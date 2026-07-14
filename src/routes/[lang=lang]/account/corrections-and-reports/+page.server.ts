import { error, redirect } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import { listMemberPlaceFlags, type PlaceFlagRpcClient } from '$server/place-flags/place-flags';

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

  const cursorSubmittedAt = url.searchParams.get('cursorTime');
  const cursorFlagId = url.searchParams.get('cursorId');
  const cursor =
    cursorSubmittedAt && cursorFlagId
      ? { submittedAt: cursorSubmittedAt, flagId: cursorFlagId }
      : null;
  const result = await listMemberPlaceFlags(
    locals.supabase as unknown as PlaceFlagRpcClient,
    cursor
  );
  if (result.status !== 'success') {
    error(result.status === 'forbidden' ? 403 : 503, {
      message: catalogues[lang]['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  return {
    flags: result.value.items,
    nextCursor: result.value.nextCursor,
    hasPrevious: cursor !== null,
    submitted: url.searchParams.get('submitted')
  };
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
