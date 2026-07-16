import { redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const lang = parseLocale(params.lang);
  redirect(308, `/${lang}?place=${encodeURIComponent(params.id)}`);
};
