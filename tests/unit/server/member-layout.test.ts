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
  } = {}
) {
  const getUser = vi.fn(async () => ({ data: { user: options.user ?? null }, error: null }));
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
    throw new Error(`Unexpected RPC ${name}`);
  });
  return {
    event: {
      cookies: { getAll: () => (options.cookie ? [{ name: options.cookie, value: 'value' }] : []) },
      locals: { requestId: 'request-layout', supabase: { auth: { getUser }, rpc } },
      params: { lang: 'en' },
      url: new URL(options.url ?? 'https://hundavaent.test/en')
    },
    getUser,
    rpc
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
      user: { id: 'member-1' }
    });
    const result = await load(event as never);

    expect(result).toMatchObject({ lang: 'en', signedIn: true });
    expect(getUser).toHaveBeenCalledOnce();
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
});
