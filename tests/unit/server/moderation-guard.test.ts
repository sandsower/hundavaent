import { describe, expect, it } from 'vitest';

import { load } from '../../../src/routes/[lang=lang]/moderation/+layout.server';
import { catalogues } from '$i18n';
import type { RequestSupabaseClient } from '$server/db/clients';

function createAuthenticatedClient(hasModeratorRole: boolean): RequestSupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1' } },
        error: null
      })
    },
    rpc: async () => ({ data: hasModeratorRole, error: null })
  } as unknown as RequestSupabaseClient;
}

function createLoadEvent(pathname: string, supabase: RequestSupabaseClient | null) {
  return {
    locals: { requestId: 'request-guard', supabase, copy: catalogues.is },
    params: { lang: 'is' },
    route: { id: '/[lang=lang]/moderation' },
    url: new URL(`http://localhost${pathname}`)
  };
}

describe('Moderator route guard', () => {
  it('keeps the sign-in route public', async () => {
    await expect(load(createLoadEvent('/is/moderation/sign-in', null) as never)).resolves.toEqual({
      moderator: null
    });
  });

  it('redirects a signed-out caller and preserves the protected return path', async () => {
    await expect(load(createLoadEvent('/is/moderation', null) as never)).rejects.toMatchObject({
      status: 303,
      location: '/is/moderation/sign-in?returnTo=%2Fis%2Fmoderation'
    });
  });

  it('returns forbidden for an authenticated non-Moderator', async () => {
    await expect(
      load(createLoadEvent('/is/moderation', createAuthenticatedClient(false)) as never)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('returns the caller identity for a Moderator', async () => {
    await expect(
      load(createLoadEvent('/is/moderation', createAuthenticatedClient(true)) as never)
    ).resolves.toEqual({ moderator: { id: 'user-1' } });
  });
});
