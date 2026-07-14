import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

import { catalogues, parseLocale } from '$i18n';
import { defaultCameraForPlaces, parseDiscoveryState } from '$lib/discovery/state';
import { getCheckInPolicy } from '$server/check-ins/check-ins';
import { listPublished } from '$server/discovery/public-places';
import { listFavouriteIds } from '$server/favourites/favourites';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent, setHeaders, url }) => {
  const lang = parseLocale(params.lang);

  if (!locals.supabase) {
    error(503, {
      message: catalogues[lang]['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  const result = await listPublished(locals.supabase, lang);

  if (result.status !== 'success') {
    error(503, {
      message: catalogues[lang]['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  const layout = await parent();
  const favouriteResult = layout.signedIn
    ? await listFavouriteIds(locals.supabase)
    : { status: 'success' as const, value: [] };
  const checkInPolicyResult = layout.signedIn
    ? await getCheckInPolicy(locals.supabase)
    : { status: 'success' as const, value: { proximityAssistEnabled: false } };
  if (layout.signedIn) {
    setHeaders({ 'cache-control': 'private, no-store', vary: 'cookie' });
  }
  const pendingFavourite = url.searchParams.get('favourite');

  return {
    places: result.value,
    ...(favouriteResult.status === 'success' && favouriteResult.value.length > 0
      ? { favouritePlaceIds: favouriteResult.value }
      : {}),
    ...(pendingFavourite &&
    result.value.some((place) => place.placeId === pendingFavourite) &&
    (favouriteResult.status !== 'success' || !favouriteResult.value.includes(pendingFavourite))
      ? { pendingFavourite }
      : {}),
    proximityAssistEnabled:
      checkInPolicyResult.status === 'success' && checkInPolicyResult.value.proximityAssistEnabled,
    discoveryState: parseDiscoveryState(url.searchParams, defaultCameraForPlaces(result.value)),
    // Without an explicit camera in the URL the client fits the map to the result set,
    // since only the real viewport size can produce a correct zoom.
    fitPlacesOnMount:
      !url.searchParams.has('lat') && !url.searchParams.has('lng') && !url.searchParams.has('z'),
    mapStyleUrl: env.PUBLIC_MAP_STYLE_URL?.trim() || null,
    forceMapFailure: dev && url.searchParams.get('__mapFailure') === '1'
  };
};
