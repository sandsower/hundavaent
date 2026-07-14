import { describe, expect, it, vi } from 'vitest';

import { createHandle, createHandleError } from '../../../src/hooks.server';
import type { TelemetryLogger } from '$server/telemetry/logger';
import type { RequestSupabaseClient } from '$server/db/clients';

function createEvent() {
  const writtenCookies: Array<{ name: string; value: string }> = [];
  const event = {
    cookies: {
      getAll: () => [{ name: 'sb-session', value: 'existing' }],
      set: (name: string, value: string) => writtenCookies.push({ name, value })
    },
    locals: {} as App.Locals,
    request: new Request('http://localhost/is'),
    route: { id: '/[lang=lang]' },
    url: new URL('http://localhost/is')
  };

  return { event, writtenCookies };
}

describe('request pipeline', () => {
  function createLogger(): TelemetryLogger {
    return {
      serverError: vi.fn(),
      serverFailure: vi.fn(),
      slowRequest: vi.fn(),
      healthFailure: vi.fn()
    };
  }

  it('refreshes the caller session and exposes a request ID to route code', async () => {
    const { event, writtenCookies } = createEvent();
    const getClaims = vi.fn(async () => {
      event.cookies.set('sb-session', 'refreshed');
      return { data: { claims: { sub: 'moderator-1' } }, error: null };
    });
    const client = { auth: { getClaims } } as unknown as RequestSupabaseClient;
    const handle = createHandle({
      getPublicConfig: () => ({
        url: 'http://supabase.test',
        publishableKey: 'public-key'
      }),
      createClient: () => client,
      createRequestId: () => 'request-123',
      getGateConfig: () => null
    });
    const resolve = vi.fn(async (resolvedEvent) => {
      expect(resolvedEvent.locals.requestId).toBe('request-123');
      expect(resolvedEvent.locals.supabase).toBe(client);
      return new Response('ok');
    });

    const response = await handle({ event, resolve } as never);

    expect(await response.text()).toBe('ok');
    expect(response.headers.get('x-request-id')).toBe('request-123');
    expect(getClaims).toHaveBeenCalledOnce();
    expect(writtenCookies).toContainEqual({
      name: 'sb-session',
      value: 'refreshed'
    });
  });

  it('keeps public routes available when Supabase is not configured', async () => {
    const { event } = createEvent();
    const createClient = vi.fn();
    const handle = createHandle({
      getPublicConfig: () => null,
      createClient,
      createRequestId: () => 'request-456',
      getGateConfig: () => null
    });

    await handle({
      event,
      resolve: async (resolvedEvent: typeof event) => {
        expect(resolvedEvent.locals.supabase).toBeNull();
        return new Response('public');
      }
    } as never);

    expect(createClient).not.toHaveBeenCalled();
  });

  it('adds transport security outside local HTTP development', async () => {
    const { event } = createEvent();
    event.request = new Request('https://preview.hundavaent.is/en');
    event.url = new URL('https://preview.hundavaent.is/en');
    const handle = createHandle({
      getPublicConfig: () => null,
      createClient: vi.fn(),
      createRequestId: () => 'request-secure',
      getGateConfig: () => null
    });

    const response = await handle({
      event,
      resolve: async () => new Response('secure')
    } as never);

    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains'
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
    );
  });

  it('never shares account or authentication responses through a public cache', async () => {
    const { event } = createEvent();
    event.request = new Request('https://preview.hundavaent.is/en/account');
    event.url = new URL('https://preview.hundavaent.is/en/account');
    event.route = { id: '/[lang=lang]/account' };
    const handle = createHandle({
      getPublicConfig: () => null,
      createClient: vi.fn(),
      createRequestId: () => 'request-account',
      getGateConfig: () => null
    });

    const response = await handle({
      event,
      resolve: async () => new Response('private account')
    } as never);

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('logs returned server failures with duration and no request contents', async () => {
    const { event } = createEvent();
    const logger = createLogger();
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(142);
    const handle = createHandle({
      getPublicConfig: () => null,
      createClient: vi.fn(),
      createRequestId: () => 'request-failed',
      getGateConfig: () => null,
      logger,
      now
    });

    await handle({
      event,
      resolve: async () => new Response('redacted failure', { status: 503 })
    } as never);

    expect(logger.serverFailure).toHaveBeenCalledWith({
      requestId: 'request-failed',
      method: 'GET',
      routeId: '/[lang=lang]',
      status: 503,
      durationMs: 42
    });
    expect(logger.slowRequest).not.toHaveBeenCalled();
  });

  it('logs successful requests only when they cross the slow threshold', async () => {
    const { event } = createEvent();
    const logger = createLogger();
    const now = vi.fn().mockReturnValueOnce(50).mockReturnValueOnce(1_300);
    const handle = createHandle({
      getPublicConfig: () => null,
      createClient: vi.fn(),
      createRequestId: () => 'request-slow',
      getGateConfig: () => null,
      logger,
      now
    });

    await handle({ event, resolve: async () => new Response('slow') } as never);

    expect(logger.slowRequest).toHaveBeenCalledWith({
      requestId: 'request-slow',
      method: 'GET',
      routeId: '/[lang=lang]',
      status: 200,
      durationMs: 1_250
    });
    expect(logger.serverFailure).not.toHaveBeenCalled();
  });

  it('returns a request-correlated error without leaking provider details', () => {
    const { event } = createEvent();
    event.locals = { requestId: 'request-789', supabase: null };

    const logger = createLogger();
    const result = createHandleError(logger)({
      error: new Error('secret provider token and database detail'),
      event,
      status: 500,
      message: 'Internal Error'
    } as never);

    expect(result).toEqual({
      message: 'Something went wrong',
      requestId: 'request-789'
    });
    expect(JSON.stringify(result)).not.toContain('secret provider token');
    expect(logger.serverError).toHaveBeenCalledWith({
      requestId: 'request-789',
      method: 'GET',
      routeId: '/[lang=lang]',
      status: 500,
      errorType: 'Error'
    });
  });
});
