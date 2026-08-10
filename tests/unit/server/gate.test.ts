import { describe, expect, it, vi } from 'vitest';

import { createHandle } from '../../../src/hooks.server';
import {
  GATE_COOKIE_NAME,
  createGateCookieValue,
  getGateConfig,
  isGateCookieValid,
  normalizeGateRedirectTo,
  verifyPassword,
  type GateConfig
} from '$server/gate';

describe('getGateConfig', () => {
  it('returns null when the password is unset', () => {
    expect(getGateConfig({})).toBeNull();
    expect(getGateConfig({ SITE_GATE_PASSWORD: undefined })).toBeNull();
  });

  it('returns null when the password is blank', () => {
    expect(getGateConfig({ SITE_GATE_PASSWORD: '   ' })).toBeNull();
  });

  it('returns the trimmed password when configured', () => {
    expect(getGateConfig({ SITE_GATE_PASSWORD: ' opna ' })).toEqual({ password: 'opna' });
  });
});

describe('verifyPassword', () => {
  const config = { password: 'rett-lykilord' };

  it('accepts the configured password', async () => {
    await expect(verifyPassword('rett-lykilord', config)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await expect(verifyPassword('rangt-lykilord', config)).resolves.toBe(false);
  });

  it('rejects an empty candidate', async () => {
    await expect(verifyPassword('', config)).resolves.toBe(false);
  });
});

describe('gate cookie', () => {
  const config = { password: 'rett-lykilord' };

  it('exposes a stable cookie name', () => {
    expect(GATE_COOKIE_NAME).toBe('hundavaent-gate');
  });

  it('round-trips a created cookie value', async () => {
    const value = await createGateCookieValue(config);
    await expect(isGateCookieValid(value, config)).resolves.toBe(true);
  });

  it('rejects a missing or tampered cookie value', async () => {
    const value = await createGateCookieValue(config);
    await expect(isGateCookieValid(undefined, config)).resolves.toBe(false);
    await expect(isGateCookieValid('', config)).resolves.toBe(false);
    await expect(isGateCookieValid(`${value}0`, config)).resolves.toBe(false);
  });

  it('invalidates existing cookies when the password rotates', async () => {
    const value = await createGateCookieValue(config);
    await expect(isGateCookieValid(value, { password: 'nytt-lykilord' })).resolves.toBe(false);
  });
});

describe('normalizeGateRedirectTo', () => {
  it('preserves a local path with its query', () => {
    expect(normalizeGateRedirectTo('/en/places/abc?view=map')).toBe('/en/places/abc?view=map');
  });

  it.each([
    'https://attacker.example/en',
    '//attacker.example/en',
    'javascript:alert(1)',
    '/gate',
    '/gate?redirectTo=%2Fen',
    '',
    null,
    undefined,
    42
  ])('falls back to the root for unsafe destination %s', (unsafe) => {
    expect(normalizeGateRedirectTo(unsafe)).toBe('/');
  });
});

describe('gated request pipeline', () => {
  const gate: GateConfig = { password: 'rett-lykilord' };

  function createGatedEvent(url: string, gateCookie?: string) {
    const event = {
      cookies: {
        get: (name: string) => (name === GATE_COOKIE_NAME ? gateCookie : undefined),
        getAll: () => [],
        set: vi.fn()
      },
      locals: {} as App.Locals,
      request: new Request(url),
      route: { id: null },
      url: new URL(url)
    };

    return event;
  }

  function createGatedHandle(gateConfig: GateConfig | null) {
    return createHandle({
      getPublicConfig: () => null,
      createClient: vi.fn(),
      createRequestId: () => 'request-gate',
      getGateConfig: () => gateConfig
    });
  }

  it('leaves requests untouched when the gate is not configured', async () => {
    const handle = createGatedHandle(null);
    const response = await handle({
      event: createGatedEvent('http://localhost/is'),
      resolve: async () => new Response('open')
    } as never);

    expect(await response.text()).toBe('open');
    expect(response.headers.get('x-robots-tag')).toBeNull();
  });

  it('redirects an unauthorized request to the gate with the original destination', async () => {
    const handle = createGatedHandle(gate);
    const resolve = vi.fn(async () => new Response('hidden'));
    const response = await handle({
      event: createGatedEvent('http://localhost/en/places/abc?view=map'),
      resolve
    } as never);

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/gate?redirectTo=%2Fen%2Fplaces%2Fabc%3Fview%3Dmap'
    );
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('x-request-id')).toBe('request-gate');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects a tampered gate cookie', async () => {
    const handle = createGatedHandle(gate);
    const response = await handle({
      event: createGatedEvent('http://localhost/is', 'tampered'),
      resolve: async () => new Response('hidden')
    } as never);

    expect(response.status).toBe(303);
  });

  it('passes an authorized request through and keeps it unindexed', async () => {
    const handle = createGatedHandle(gate);
    const cookie = await createGateCookieValue(gate);
    const response = await handle({
      event: createGatedEvent('http://localhost/is', cookie),
      resolve: async () => new Response('inni')
    } as never);

    expect(await response.text()).toBe('inni');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('exempts the gate page and the health check from the cookie requirement', async () => {
    const handle = createGatedHandle(gate);

    for (const url of ['http://localhost/gate', 'http://localhost/api/health']) {
      const response = await handle({
        event: createGatedEvent(url),
        resolve: async () => new Response('exempt')
      } as never);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('exempt');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
  });

  it('retires the shared-password translation workspace before route actions can run', async () => {
    const handle = createGatedHandle(gate);
    const resolve = vi.fn(async () => new Response('legacy workspace'));
    const response = await handle({
      event: {
        ...createGatedEvent('http://localhost/translations/review'),
        request: new Request('http://localhost/translations/review', { method: 'POST' })
      },
      resolve
    } as never);

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/is');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('does not exempt unrelated paths with a similar prefix', async () => {
    const handle = createGatedHandle(gate);
    const resolve = vi.fn(async () => new Response('hidden'));
    const response = await handle({
      event: createGatedEvent('http://localhost/translations-preview'),
      resolve
    } as never);

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/gate?redirectTo=%2Ftranslations-preview');
  });
});
