import { error, redirect } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import { getPublishedProfile, getPublicPlaceStatus } from '$server/discovery/public-places';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders, url }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const lang = parseLocale(params.lang);
  if (!locals.supabase) {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  const result = await getPublishedProfile(locals.supabase, params.id, lang);
  if (result.status === 'not_found') {
    const status = await getPublicPlaceStatus(locals.supabase, params.id, lang);
    if (status.status === 'success') {
      return { lang, copy: catalogues[lang], place: status.value };
    }
    if (status.status === 'not_found') {
      error(404, { message: catalogues[lang]['error.notFoundBody'], requestId: locals.requestId });
    }
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  if (result.status !== 'success') {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  const search = new URLSearchParams(url.searchParams);
  search.set('place', params.id);
  redirect(307, `/${lang}?${search.toString()}`);
};
