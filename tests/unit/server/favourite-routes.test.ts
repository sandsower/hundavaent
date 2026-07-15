import { describe, expect, it, vi } from 'vitest';

import { GET } from '../../../src/routes/api/favourites/+server';
import { PUT } from '../../../src/routes/api/favourites/[placeId]/+server';

const placeId = '30000000-0000-4000-8000-000000000003';

function expectPrivate(response: Response, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toContain('cookie');
}

describe('Favourite API privacy headers', () => {
  it('applies private cache headers to every list success and error path', async () => {
    expectPrivate(await GET({ locals: { supabase: null } } as never), 503);

    const signedOut = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      rpc: vi.fn()
    };
    expectPrivate(await GET({ locals: { supabase: signedOut } } as never), 401);

    const authUnavailable = {
      auth: { getUser: vi.fn(async () => Promise.reject(new Error('provider unavailable'))) },
      rpc: vi.fn()
    };
    expectPrivate(await GET({ locals: { supabase: authUnavailable } } as never), 503);

    const failed = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
      rpc: vi.fn(async (name: string) =>
        name === 'get_current_member_account'
          ? { data: [{ member_id: 'member' }], error: null }
          : { data: null, error: { code: 'network' } }
      )
    };
    expectPrivate(await GET({ locals: { supabase: failed } } as never), 503);

    const success = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
      rpc: vi.fn(async (name: string) =>
        name === 'get_current_member_account'
          ? { data: [{ member_id: 'member' }], error: null }
          : { data: [{ place_id: placeId }], error: null }
      )
    };
    expectPrivate(await GET({ locals: { supabase: success } } as never), 200);
  });

  it('clears an Auth-only session instead of exposing Member Favorites', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const deleteCookie = vi.fn();
    const orphaned = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'orphan' } }, error: null })),
        signOut
      },
      rpc: vi.fn(async () => ({ data: [], error: null }))
    };

    const response = await GET({
      cookies: {
        getAll: () => [{ name: 'sb-test-auth-token', value: 'orphaned' }],
        delete: deleteCookie
      },
      locals: { supabase: orphaned }
    } as never);

    expectPrivate(response, 401);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(deleteCookie).toHaveBeenCalledWith('sb-test-auth-token', { path: '/' });
    expect(orphaned.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['GET', (event: never) => GET(event)],
    ['PUT', (event: never) => PUT(event)]
  ] as const)('clears an expired Favorite session and returns 401 for %s', async (method, run) => {
    const signOut = vi.fn(async () => ({ error: null }));
    const deleteCookie = vi.fn();
    const expired = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { name: 'AuthApiError', message: 'JWT expired', code: 'bad_jwt' }
        })),
        signOut
      },
      rpc: vi.fn()
    };
    const common = {
      cookies: {
        getAll: () => [{ name: 'sb-test-auth-token', value: 'expired' }],
        delete: deleteCookie
      },
      locals: { supabase: expired },
      params: { placeId }
    };
    const response = await run(
      (method === 'PUT'
        ? { ...common, request: jsonRequest({ desiredState: true }) }
        : common) as never
    );

    expectPrivate(response, 401);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(deleteCookie).toHaveBeenCalledWith('sb-test-auth-token', { path: '/' });
    expect(expired.rpc).not.toHaveBeenCalled();
  });

  it('applies private cache headers to every mutation success and error path', async () => {
    expectPrivate(
      await PUT({
        locals: { supabase: null },
        params: { placeId: 'not-a-place' },
        request: new Request('http://localhost', { method: 'PUT' })
      } as never),
      400
    );

    expectPrivate(
      await PUT({
        locals: { supabase: null },
        params: { placeId },
        request: jsonRequest({ desiredState: true })
      } as never),
      503
    );

    expectPrivate(
      await PUT({
        locals: { supabase: { auth: { getUser: vi.fn() }, rpc: vi.fn() } },
        params: { placeId },
        request: new Request('http://localhost', { method: 'PUT', body: '{' })
      } as never),
      400
    );

    expectPrivate(
      await PUT({
        locals: { supabase: { auth: { getUser: vi.fn() }, rpc: vi.fn() } },
        params: { placeId },
        request: jsonRequest({ desiredState: 'yes' })
      } as never),
      400
    );

    const signedOut = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      rpc: vi.fn()
    };
    expectPrivate(
      await PUT({
        locals: { supabase: signedOut },
        params: { placeId },
        request: jsonRequest({ desiredState: true })
      } as never),
      401
    );

    const authUnavailable = {
      auth: { getUser: vi.fn(async () => Promise.reject(new Error('provider unavailable'))) },
      rpc: vi.fn()
    };
    expectPrivate(
      await PUT({
        locals: { supabase: authUnavailable },
        params: { placeId },
        request: jsonRequest({ desiredState: true })
      } as never),
      503
    );

    const failed = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
      rpc: vi.fn(async (name: string) =>
        name === 'get_current_member_account'
          ? { data: [{ member_id: 'member' }], error: null }
          : { data: null, error: { code: 'conflict' } }
      )
    };
    expectPrivate(
      await PUT({
        locals: { supabase: failed },
        params: { placeId },
        request: jsonRequest({ desiredState: true })
      } as never),
      409
    );

    const success = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
      rpc: vi.fn(async (name: string) =>
        name === 'get_current_member_account'
          ? { data: [{ member_id: 'member' }], error: null }
          : {
              data: [{ place_id: placeId, is_favourite: true, changed_at: '2026-07-11T10:00:00Z' }],
              error: null
            }
      )
    };
    expectPrivate(
      await PUT({
        locals: { supabase: success },
        params: { placeId },
        request: jsonRequest({ desiredState: true })
      } as never),
      200
    );
  });
});

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/favourites', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
