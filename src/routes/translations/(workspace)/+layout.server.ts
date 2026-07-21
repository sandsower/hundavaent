import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';

import {
  TRANSLATION_COOKIE_NAME,
  getTranslationAccessConfig,
  isTranslationSessionValid
} from '$server/translations/access';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
  const config = getTranslationAccessConfig(env);
  if (!config) {
    error(503, {
      message: 'The translation workspace is not configured.',
      requestId: locals.requestId
    });
  }
  if (!(await isTranslationSessionValid(cookies.get(TRANSLATION_COOKIE_NAME), config))) {
    const redirectTo = encodeURIComponent(`${url.pathname}${url.search}`);
    redirect(303, `/translations/sign-in?redirectTo=${redirectTo}`);
  }
  return {};
};
