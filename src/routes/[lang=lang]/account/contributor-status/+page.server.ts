import { error, redirect } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import {
  getMyContributorStatus,
  type ContributorRpcClient
} from '$server/contributors/contributor-status';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  if (!locals.supabase) redirectToAccount(lang, returnTo);

  try {
    await requireRole(locals.supabase, 'member');
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      redirectToAccount(lang, returnTo);
    }
    if (cause instanceof AuthenticationUnavailableError) {
      error(503, {
        message: catalogues[lang]['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    throw cause;
  }

  const result = await getMyContributorStatus(locals.supabase as unknown as ContributorRpcClient);
  if (result.status !== 'success') {
    if (result.status === 'forbidden') {
      error(403, {
        message: catalogues[lang]['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    error(503, {
      message: catalogues[lang]['contributor.unavailable'],
      requestId: locals.requestId
    });
  }

  return { contributor: result.value };
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
