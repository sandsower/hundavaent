import { error, fail, redirect } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import {
  executeModerationSuggestionAction,
  loadModerationSuggestionReview,
  type ModerationSuggestionActionName,
  type ModerationSuggestionConfirmedEffect
} from '$server/moderation/suggestion-workspace';
import type { ContributorRpcClient } from '$server/contributors/contributor-status';
import type { SuggestionRpcClient } from '$server/suggestions/suggestions';

import type { Actions, PageServerLoad } from './$types';

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  if (!locals.supabase) {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }
  const result = await loadModerationSuggestionReview(
    locals.supabase as unknown as SuggestionRpcClient,
    locals.supabase as unknown as ContributorRpcClient,
    params.id,
    url.searchParams
  );
  if (result.status === 'not_found') {
    error(404, { message: catalogues[lang]['error.notFoundBody'], requestId: locals.requestId });
  }
  if (result.status !== 'success') {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }

  return result.value;
};

// Each action below is itself enforced by security.require_moderator() inside the RPC.
export const actions: Actions = {
  saveSuggestionSection: (event) => runFallbackAction('saveSuggestionSection', event),
  decideSuggestion: (event) => runFallbackAction('decideSuggestion', event),
  confirmUseful: (event) => runFallbackAction('confirmUseful', event),
  revokeContribution: (event) => runFallbackAction('revokeContribution', event),
  recordConductFlag: (event) => runFallbackAction('recordConductFlag', event),
  clearConductFlag: (event) => runFallbackAction('clearConductFlag', event)
};

async function runFallbackAction(
  action: ModerationSuggestionActionName,
  event: Parameters<NonNullable<Actions[ModerationSuggestionActionName]>>[0]
) {
  const { locals, params, request, url } = event;
  if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

  const result = await executeModerationSuggestionAction(action, {
    suggestionClient: locals.supabase as unknown as SuggestionRpcClient,
    contributorClient: locals.supabase as unknown as ContributorRpcClient,
    suggestionId: params.id,
    requestId: locals.requestId,
    formData: action === 'confirmUseful' ? null : await request.formData()
  });
  if (result.status === 'failure') {
    const conflictReview =
      result.error === 'conflict'
        ? await loadModerationSuggestionReview(
            locals.supabase as unknown as SuggestionRpcClient,
            locals.supabase as unknown as ContributorRpcClient,
            params.id,
            url.searchParams
          )
        : null;
    return fail(result.httpStatus, {
      error: result.error,
      ...(result.error === 'conflict' ? { conflict: true } : {}),
      ...(conflictReview?.status === 'success' ? { conflictReview: conflictReview.value } : {}),
      conflictRefreshFailed: result.error === 'conflict' && conflictReview?.status !== 'success'
    });
  }
  const lang = parseLocale(params.lang);
  if (result.effect.kind === 'draft_saved') {
    redirect(303, `/${lang}/moderation/suggestions/${params.id}?draft=saved`);
  }
  redirect(303, fallbackConfirmationHref(lang, params.id, result.effect));
}

function fallbackConfirmationHref(
  lang: ReturnType<typeof parseLocale>,
  suggestionId: string,
  effect: ModerationSuggestionConfirmedEffect
): string {
  if (effect.kind === 'draft_saved')
    return `/${lang}/moderation/suggestions/${suggestionId}?draft=saved`;
  const key = effect.kind === 'resolved' ? 'resolved' : effect.kind;
  return `/${lang}/moderation/suggestions/${suggestionId}?${key}=${effect.value}`;
}
