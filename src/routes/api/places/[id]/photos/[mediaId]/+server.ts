import { json } from '@sveltejs/kit';

import { refreshPublishedPhotoUrl } from '$server/discovery/public-places';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.mediaId)) {
    return json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!locals.supabase) return json({ error: 'unavailable' }, { status: 503 });

  const result = await refreshPublishedPhotoUrl(locals.supabase, params.id, params.mediaId);
  if (result.status === 'not_found') return json({ error: 'not_found' }, { status: 404 });
  if (result.status !== 'success') return json({ error: 'unavailable' }, { status: 503 });
  return json(result.value, { headers: { 'cache-control': 'no-store' } });
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
