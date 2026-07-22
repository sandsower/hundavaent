import { error, fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  executeModerationCorrectionAction,
  loadModerationCorrectionReview,
  type ModerationCorrectionActionName
} from '$server/moderation/correction-workspace';
import type { PlaceFlagRpcClient } from '$server/place-flags/place-flags';

import type { Actions, PageServerLoad } from './$types';

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }
  const result = await loadModerationCorrectionReview(
    locals.supabase as unknown as PlaceFlagRpcClient,
    params.id,
    url.searchParams
  );
  if (result.status === 'not_found') {
    error(404, { message: locals.copy['error.notFoundBody'], requestId: locals.requestId });
  }
  if (result.status !== 'success') {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }
  return {
    ...result.value,
    draftSaved: url.searchParams.get('draft') === 'saved'
  };
};

async function runAction(
  action: ModerationCorrectionActionName,
  event: Parameters<NonNullable<Actions[ModerationCorrectionActionName]>>[0]
) {
  const { locals, params, request, url } = event;
  if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

  const result = await executeModerationCorrectionAction(action, {
    flagClient: locals.supabase as unknown as PlaceFlagRpcClient,
    flagId: params.id,
    requestId: locals.requestId,
    formData: action === 'confirmUseful' ? null : await request.formData()
  });
  if (result.status === 'failure') {
    const conflictReview =
      result.error === 'conflict'
        ? await loadModerationCorrectionReview(
            locals.supabase as unknown as PlaceFlagRpcClient,
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
    redirect(303, `/${lang}/moderation/corrections-and-reports/${params.id}?draft=saved`);
  }
  if (result.effect.kind === 'resolved') {
    redirect(
      303,
      `/${lang}/moderation/corrections-and-reports/${params.id}?resolved=${result.effect.value}`
    );
  }
  redirect(303, `/${lang}/moderation/corrections-and-reports/${params.id}?contribution=confirmed`);
}

// Each action below is itself enforced by security.require_moderator() inside the RPC.
export const actions: Actions = {
  saveCorrectionSection: (event) => runAction('saveCorrectionSection', event),
  decideCorrection: (event) => runAction('decideCorrection', event),
  confirmUseful: (event) => runAction('confirmUseful', event)
};
