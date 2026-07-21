import { error, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import { getPublishedProfile } from '$server/discovery/public-places';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders, url }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const lang = parseLocale(params.lang);
  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }
  const result = await getPublishedProfile(locals.supabase, params.id, lang);
  if (result.status === 'not_found') {
    error(404, { message: locals.copy['error.notFoundBody'], requestId: locals.requestId });
  }
  if (result.status !== 'success') {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }
  const search = new URLSearchParams(url.searchParams);
  search.set('place', params.id);
  redirect(307, `/${lang}?${search.toString()}`);
};
