import { error, redirect } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import { buildFavouritePage, listFavourites } from '$server/favourites/favourites';

import type { PageServerLoad } from './$types';

const pageSize = 24;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export const load: PageServerLoad = async ({ locals, params, parent, setHeaders, url }) => {
  const lang = parseLocale(params.lang);
  const layout = await parent();
  if (!layout.signedIn) {
    const returnTo = `/${lang}/favorites`;
    const discovery = `/${lang}?auth=open&authReturnTo=${encodeURIComponent(returnTo)}`;
    redirect(303, discovery);
  }
  if (!locals.supabase) {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  setHeaders({ 'cache-control': 'private, no-store', vary: 'cookie' });

  const rawBeforeSavedAt = url.searchParams.get('before');
  const rawBeforePlaceId = url.searchParams.get('beforePlace');
  const requestedBeforeSavedAt = validDate(rawBeforeSavedAt);
  const requestedBeforePlaceId = rawBeforePlaceId;
  const hasValidCursor = Boolean(
    requestedBeforeSavedAt && requestedBeforePlaceId && uuidPattern.test(requestedBeforePlaceId)
  );
  const hasCursorInput = rawBeforeSavedAt !== null || rawBeforePlaceId !== null;
  if (hasCursorInput && !hasValidCursor) {
    error(400, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  const result = await listFavourites(locals.supabase, lang, {
    limit: pageSize + 1,
    beforeSavedAt: hasValidCursor ? requestedBeforeSavedAt : null,
    beforePlaceId: hasValidCursor ? requestedBeforePlaceId : null
  });
  if (result.status !== 'success') {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }

  const page = buildFavouritePage(result.value, pageSize);
  return {
    savedPlaces: page.places,
    nextCursor: page.nextCursor,
    isFirstPage: !hasValidCursor
  };
};

function validDate(value: string | null): string | null {
  return value && timestampPattern.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
