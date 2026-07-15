import { listFavouriteIds } from '$server/favourites/favourites';
import { clearRequestAuthSession } from '$server/auth/callback';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';
import { privateJson } from '$server/http/private-json';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, locals }) => {
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  try {
    const session = await getMemberSession(locals.supabase);
    if (session.status === 'orphaned') {
      await clearRequestAuthSession(locals.supabase, cookies);
    }
    if (session.status !== 'member') {
      return privateJson({ error: 'authentication_required' }, 401);
    }
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      await clearRequestAuthSession(locals.supabase, cookies);
      return privateJson({ error: 'authentication_required' }, 401);
    }
    return privateJson({ error: 'unavailable' }, 503);
  }

  const result = await listFavouriteIds(locals.supabase);
  if (result.status !== 'success') {
    return privateJson({ error: 'unavailable' }, 503);
  }

  return privateJson({ placeIds: result.value });
};
