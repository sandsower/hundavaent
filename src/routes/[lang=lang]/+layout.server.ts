import type { LayoutServerLoad } from './$types';

import { catalogues, parseLocale } from '$i18n';

export const load: LayoutServerLoad = async ({ cookies, locals, params }) => {
  const lang = parseLocale(params.lang);
  let signedIn = false;
  const hasSessionCookie = cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));

  if (locals.supabase && hasSessionCookie) {
    try {
      const { data, error } = await locals.supabase.auth.getUser();
      signedIn = !error && data.user !== null;
    } catch {
      signedIn = false;
    }
  }

  return {
    lang,
    copy: catalogues[lang],
    ...(signedIn ? { signedIn: true as const } : {})
  };
};
