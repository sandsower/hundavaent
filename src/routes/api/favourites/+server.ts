import { listFavouriteIds } from '$server/favourites/favourites';
import { privateJson } from '$server/http/private-json';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  try {
    const { data, error } = await locals.supabase.auth.getUser();
    if (error || !data.user) return privateJson({ error: 'authentication_required' }, 401);
  } catch {
    return privateJson({ error: 'unavailable' }, 503);
  }

  const result = await listFavouriteIds(locals.supabase);
  if (result.status !== 'success') {
    return privateJson({ error: 'unavailable' }, 503);
  }

  return privateJson({ placeIds: result.value });
};
