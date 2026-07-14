import { json } from '@sveltejs/kit';

import { isLocale } from '$i18n';
import { getPublishedProfile, getPublicPlaceStatus } from '$server/discovery/public-places';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
  const locale = url.searchParams.get('lang');
  if (!isLocale(locale) || !uuidPattern.test(params.id)) {
    return json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!locals.supabase) return json({ error: 'unavailable' }, { status: 503 });

  const result = await getPublishedProfile(locals.supabase, params.id, locale);
  if (result.status === 'not_found') {
    const placeStatus = await getPublicPlaceStatus(locals.supabase, params.id, locale);
    if (placeStatus.status === 'success') {
      return json(
        { error: placeStatus.value.publicStatus, place: placeStatus.value },
        { status: 409, headers: { 'cache-control': 'no-store' } }
      );
    }
    if (placeStatus.status === 'not_found') return json({ error: 'not_found' }, { status: 404 });
    return json({ error: 'unavailable' }, { status: 503 });
  }
  if (result.status !== 'success') return json({ error: 'unavailable' }, { status: 503 });
  return json(result.value, { headers: { 'cache-control': 'no-store' } });
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
