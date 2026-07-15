import { setFavourite } from '$server/favourites/favourites';
import { clearRequestAuthSession } from '$server/auth/callback';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';
import { privateJson } from '$server/http/private-json';

import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PUT: RequestHandler = async ({ cookies, locals, params, request }) => {
  if (!uuidPattern.test(params.placeId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (!locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  let desiredState: unknown;
  try {
    ({ desiredState } = (await request.json()) as { desiredState?: unknown });
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (typeof desiredState !== 'boolean') {
    return privateJson({ error: 'invalid_request' }, 400);
  }

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

  const result = await setFavourite(locals.supabase, params.placeId, desiredState);
  if (result.status !== 'success') {
    return privateJson({ error: 'unavailable' }, 409);
  }
  return privateJson(result.value);
};
