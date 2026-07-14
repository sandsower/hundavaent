import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

import {
  GATE_COOKIE_NAME,
  createGateCookieValue,
  getGateConfig,
  normalizeGateRedirectTo,
  verifyPassword
} from '$server/gate';

import type { Actions, PageServerLoad } from './$types';

const cookieMaxAgeSeconds = 60 * 60 * 24 * 30;

export const load: PageServerLoad = ({ url }) => {
  if (!getGateConfig(env)) {
    redirect(307, '/');
  }

  return {
    redirectTo: normalizeGateRedirectTo(url.searchParams.get('redirectTo'))
  };
};

export const actions: Actions = {
  default: async ({ cookies, request }) => {
    const config = getGateConfig(env);

    if (!config) {
      redirect(307, '/');
    }

    const formData = await request.formData();
    const password = String(formData.get('password') ?? '');
    const redirectTo = normalizeGateRedirectTo(formData.get('redirectTo'));

    if (!(await verifyPassword(password, config))) {
      return fail(400, { incorrect: true, redirectTo });
    }

    cookies.set(GATE_COOKIE_NAME, await createGateCookieValue(config), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: cookieMaxAgeSeconds
    });

    redirect(303, redirectTo);
  }
};
