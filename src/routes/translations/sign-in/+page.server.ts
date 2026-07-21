import { env } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';

import {
  TRANSLATION_COOKIE_NAME,
  createTranslationSession,
  getTranslationAccessConfig,
  isTranslationSessionValid,
  normalizeTranslationRedirectTo,
  translationCookieOptions,
  verifyTranslationPassword
} from '$server/translations/access';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals, url }) => {
  const config = getTranslationAccessConfig(env);
  if (!config) {
    error(503, {
      message: 'The translation workspace is not configured.',
      requestId: locals.requestId
    });
  }
  const redirectTo = normalizeTranslationRedirectTo(url.searchParams.get('redirectTo'));
  if (await isTranslationSessionValid(cookies.get(TRANSLATION_COOKIE_NAME), config)) {
    redirect(303, redirectTo);
  }
  return { redirectTo };
};

export const actions: Actions = {
  default: async ({ cookies, locals, request, url }) => {
    const config = getTranslationAccessConfig(env);
    if (!config) {
      error(503, {
        message: 'The translation workspace is not configured.',
        requestId: locals.requestId
      });
    }

    const formData = await request.formData();
    const password = String(formData.get('password') ?? '');
    const redirectTo = normalizeTranslationRedirectTo(formData.get('redirectTo'));
    if (!(await verifyTranslationPassword(password, config))) {
      return fail(400, { incorrect: true, redirectTo });
    }

    cookies.set(
      TRANSLATION_COOKIE_NAME,
      await createTranslationSession(config),
      translationCookieOptions(url)
    );
    redirect(303, redirectTo);
  }
};
