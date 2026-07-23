import { describe, expect, it, vi } from 'vitest';

import { load } from '../../../src/routes/[lang=lang]/+layout.server';

function eventWith(
  options: {
    cookie?: string;
    user?: { id: string } | null;
    url?: string;
    pending?: {
      action: string;
      place_id: string;
      place_name: string;
      overall_rating: number | null;
    };
    memberAccount?: boolean;
    completion?:
      | {
          action: string;
          place_id?: string;
          completion_status: string;
          first_time_for_place?: boolean;
          activated_current_week?: boolean;
          current_week_starts_on?: string;
          current_week_ends_on?: string;
          current_week_active?: boolean;
        }
      | 'error'
      | 'throw'
      | 'unavailable';
    authError?: { message: string; name?: string; code?: string; status?: number };
  } = {}
) {
  const getUser = vi.fn(async () => ({
    data: { user: options.user ?? null },
    error: options.authError ?? null
  }));
  const signOut = vi.fn(async () => ({ error: null }));
  const deleteCookie = vi.fn();
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_member_provider_policy') {
      return {
        data: [
          {
            email_enabled: true,
            facebook_enabled: true,
            automatic_linking_verified_email: true,
            policy_version: 'member-linked-providers-v2'
          }
        ],
        error: null
      };
    }
    if (name === 'get_auth_pending_intent') {
      return { data: options.pending ? [options.pending] : [], error: null };
    }
    if (name === 'get_current_member_account') {
      return {
        data: options.memberAccount
          ? [
              {
                member_id: options.user?.id,
                created_at: '2026-07-15T10:00:00Z',
                deletion_status: null,
                deletion_requested_at: null
              }
            ]
          : [],
        error: null
      };
    }
    if (name === 'complete_auth_pending_intent') {
      if (options.completion === 'throw') throw new Error('network interruption');
      if (options.completion === 'error') return { data: null, error: { code: 'network' } };
      if (options.completion === 'unavailable') return { data: [], error: null };
      return { data: options.completion ? [options.completion] : [], error: null };
    }
    if (name === 'get_current_member_weekly_rhythm') {
      return {
        data: [{ starts_on: '2026-07-13', ends_on: '2026-07-19', active: false }],
        error: null
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  return {
    event: {
      cookies: {
        getAll: () => (options.cookie ? [{ name: options.cookie, value: 'value' }] : []),
        delete: deleteCookie
      },
      locals: { requestId: 'request-layout', supabase: { auth: { getUser, signOut }, rpc } },
      params: { lang: 'en' },
      url: new URL(options.url ?? 'https://hundavaent.test/en')
    },
    getUser,
    rpc,
    signOut,
    deleteCookie
  };
}

describe('Member-aware public layout', () => {
  it('keeps an anonymous public request free from an account lookup', async () => {
    const { event, getUser } = eventWith();
    const result = await load(event as never);

    expect(result).toMatchObject({ lang: 'en' });
    expect(result).not.toHaveProperty('signedIn');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('validates a session cookie on the server before showing Member navigation', async () => {
    const { event, getUser } = eventWith({
      cookie: 'sb-project-auth-token.0',
      user: { id: 'member-1' },
      memberAccount: true
    });
    const result = await load(event as never);

    expect(result).toMatchObject({
      lang: 'en',
      signedIn: true,
      weeklyRhythm: {
        status: 'available',
        currentWeek: {
          startsOn: '2026-07-13',
          endsOn: '2026-07-19',
          active: false
        }
      }
    });
    expect(getUser).toHaveBeenCalledOnce();
  });

  it('clears an authenticated Auth session that has no canonical Member account', async () => {
    const { event, rpc, signOut, deleteCookie } = eventWith({
      cookie: 'sb-project-auth-token.0',
      user: { id: 'orphan-auth-user' },
      memberAccount: false
    });

    const result = await load(event as never);

    expect(result).not.toHaveProperty('signedIn');
    expect(rpc).toHaveBeenCalledWith('get_current_member_account');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(deleteCookie).toHaveBeenCalledWith('sb-project-auth-token.0', { path: '/' });
  });

  it('preserves a public-layout session when Auth returns a temporary non-expiry error', async () => {
    const { event, rpc, signOut, deleteCookie } = eventWith({
      cookie: 'sb-project-auth-token.0',
      authError: {
        message: 'Auth upstream temporarily unavailable',
        code: 'unexpected_failure',
        status: 503
      }
    });

    const result = await load(event as never);

    expect(result).not.toHaveProperty('signedIn');
    expect(rpc).not.toHaveBeenCalledWith('get_current_member_account');
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it('clears a public-layout session when Auth confirms invalid credentials', async () => {
    const { event, signOut, deleteCookie } = eventWith({
      cookie: 'sb-project-auth-token.0',
      authError: { message: 'JWT expired', code: 'bad_jwt', status: 401 }
    });

    const result = await load(event as never);

    expect(result).not.toHaveProperty('signedIn');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(deleteCookie).toHaveBeenCalledWith('sb-project-auth-token.0', { path: '/' });
  });

  it('recovers the safe action-specific context from an opaque continuation token', async () => {
    const continuationToken = 'a'.repeat(43);
    const { event } = eventWith({
      url: `https://hundavaent.test/en?auth=open&pendingIntent=${continuationToken}`,
      pending: {
        action: 'favourite',
        place_id: '30000000-0000-4000-8000-000000000003',
        place_name: 'Brikk',
        overall_rating: null
      }
    });
    const result = await load(event as never);
    if (!result) throw new Error('Expected layout data');

    expect(result.pendingAuthRequest).toEqual({
      origin: 'favourite',
      continuationToken,
      intent: {
        action: 'favourite',
        placeId: '30000000-0000-4000-8000-000000000003',
        placeName: 'Brikk'
      }
    });
  });

  it('retries a transient pending completion for an activated Member without activating again', async () => {
    const continuationToken = 'r'.repeat(43);
    const { event, rpc } = eventWith({
      cookie: 'sb-project-auth-token.0',
      user: { id: 'member-1' },
      memberAccount: true,
      completion: { action: 'rating', completion_status: 'completed' },
      url: `https://hundavaent.test/en?authResult=success&authMethod=email&pendingResult=retryable&pendingIntent=${continuationToken}`
    });

    await expect(load(event as never)).rejects.toMatchObject({
      status: 303,
      location:
        '/en?authResult=success&authMethod=email&pendingResult=completed&pendingAction=rating&pendingRetryResolved=1'
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_current_member_account',
      'complete_auth_pending_intent'
    ]);
  });

  it('preserves authoritative weekly recognition when a pending Favourite retry completes', async () => {
    const continuationToken = 'f'.repeat(43);
    const { event } = eventWith({
      cookie: 'sb-project-auth-token.0',
      user: { id: 'member-1' },
      memberAccount: true,
      completion: {
        action: 'favourite',
        place_id: '30000000-0000-4000-8000-000000000003',
        completion_status: 'completed',
        first_time_for_place: true,
        activated_current_week: true,
        current_week_starts_on: '2026-07-13',
        current_week_ends_on: '2026-07-19',
        current_week_active: true
      },
      url: `https://hundavaent.test/en?pendingResult=retryable&pendingIntent=${continuationToken}`
    });

    await expect(load(event as never)).rejects.toMatchObject({
      status: 303,
      location:
        '/en?pendingResult=completed&pendingAction=favourite&pendingPlaceId=30000000-0000-4000-8000-000000000003&pendingFirstTimeForPlace=1&pendingActivatedCurrentWeek=1&pendingCurrentWeekStartsOn=2026-07-13&pendingCurrentWeekEndsOn=2026-07-19&pendingCurrentWeekActive=1&pendingRetryResolved=1'
    });
  });

  it.each(['error', 'throw'] as const)(
    'keeps the canonical continuation attached when the authenticated retry returns an RPC %s',
    async (completion) => {
      const continuationToken = 'r'.repeat(43);
      const { event } = eventWith({
        cookie: 'sb-project-auth-token.0',
        user: { id: 'member-1' },
        memberAccount: true,
        completion,
        url: `https://hundavaent.test/en?pendingResult=retryable&pendingIntent=${continuationToken}`
      });

      const result = await load(event as never);
      expect(result).toMatchObject({ signedIn: true });
    }
  );

  it('cleans an expired or consumed continuation after an authenticated retry', async () => {
    const continuationToken = 'r'.repeat(43);
    const { event } = eventWith({
      cookie: 'sb-project-auth-token.0',
      user: { id: 'member-1' },
      memberAccount: true,
      completion: 'unavailable',
      url: `https://hundavaent.test/en?pendingResult=retryable&pendingIntent=${continuationToken}`
    });

    await expect(load(event as never)).rejects.toMatchObject({
      status: 303,
      location: '/en?pendingResult=unavailable&pendingRetryResolved=1'
    });
  });
});
