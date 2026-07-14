import { describe, expect, it, vi } from 'vitest';

import { load } from '../../../src/routes/[lang=lang]/+layout.server';

function eventWith(options: { cookie?: string; user?: { id: string } | null } = {}) {
  const getUser = vi.fn(async () => ({ data: { user: options.user ?? null }, error: null }));
  return {
    event: {
      cookies: { getAll: () => (options.cookie ? [{ name: options.cookie, value: 'value' }] : []) },
      locals: { requestId: 'request-layout', supabase: { auth: { getUser } } },
      params: { lang: 'en' }
    },
    getUser
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
});
