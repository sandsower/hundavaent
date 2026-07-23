import { error, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import { listMemberSuggestions, type SuggestionRpcClient } from '$server/suggestions/suggestions';
import { parseRedirectRecognition } from '$server/member-activity/redirect-recognition';

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
        message: locals.copy['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    throw cause;
  }

  const cursorSubmittedAt = url.searchParams.get('cursorTime');
  const cursorSuggestionId = url.searchParams.get('cursorId');
  const cursor =
    cursorSubmittedAt && cursorSuggestionId
      ? { submittedAt: cursorSubmittedAt, suggestionId: cursorSuggestionId }
      : null;
  const result = await listMemberSuggestions(
    locals.supabase as unknown as SuggestionRpcClient,
    cursor
  );
  if (result.status !== 'success') {
    error(result.status === 'forbidden' ? 403 : 503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  const submitted = url.searchParams.get('submitted');
  const submittedIsOwned = result.value.items.some(
    (suggestion) => suggestion.suggestionId === submitted
  );

  return {
    suggestions: result.value.items,
    nextCursor: result.value.nextCursor,
    hasPrevious: cursor !== null,
    submitted,
    recognition: submittedIsOwned ? parseRedirectRecognition(url.searchParams, 'suggestion') : null
  };
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
