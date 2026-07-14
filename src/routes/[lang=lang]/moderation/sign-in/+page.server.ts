import { fail } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import { isValidEmail, normalizeModerationReturnTo } from '$server/auth/return-to';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
  const lang = parseLocale(params.lang);

  return {
    returnTo: normalizeModerationReturnTo(url.searchParams.get('returnTo'), lang)
  };
};

export const actions: Actions = {
  default: async ({ locals, params, request, url }) => {
    const lang = parseLocale(params.lang);
    const copy = catalogues[lang];
    const formData = await request.formData();
    const email = String(formData.get('email') ?? '').trim();
    const returnTo = normalizeModerationReturnTo(formData.get('returnTo'), lang);

    if (!email) {
      return fail(400, {
        success: false,
        email,
        returnTo,
        error: copy['moderation.emailRequired']
      });
    }

    if (!isValidEmail(email)) {
      return fail(400, {
        success: false,
        email,
        returnTo,
        error: copy['moderation.emailInvalid']
      });
    }

    if (!locals.supabase) {
      return fail(503, {
        success: false,
        email,
        returnTo,
        error: copy['moderation.signInUnavailable']
      });
    }

    const callbackUrl = new URL(`/${lang}/auth/callback`, url.origin);
    callbackUrl.searchParams.set('returnTo', returnTo);

    const { error } = await locals.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: false
      }
    });

    if (error) {
      return fail(503, {
        success: false,
        email,
        returnTo,
        error: copy['moderation.signInUnavailable']
      });
    }

    return {
      success: true,
      email,
      returnTo
    };
  }
};
