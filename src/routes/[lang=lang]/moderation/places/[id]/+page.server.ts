import { error, fail, type RequestEvent } from '@sveltejs/kit';

import type { Catalogue } from '$i18n';
import {
  executeModerationCandidateAction,
  loadModerationCandidateReview,
  type ModerationCandidateActionError,
  type ModerationCandidateActionName
} from '$server/moderation/candidate-workspace';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.supabase) {
    error(503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  const result = await loadModerationCandidateReview(locals.supabase, params.id);
  if (result.status === 'not_found') {
    error(404, {
      message: locals.copy['error.notFoundBody'],
      requestId: locals.requestId
    });
  }
  if (result.status === 'forbidden') {
    error(403, {
      message: locals.copy['moderation.unauthorized'],
      requestId: locals.requestId
    });
  }
  if (result.status !== 'success') {
    error(503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  return result.value;
};

export const actions: Actions = {
  correctLocation: (event) => handleCandidateAction('correctLocation', event),
  updateWheelchairAccessibility: (event) =>
    handleCandidateAction('updateWheelchairAccessibility', event),
  publish: (event) => handleCandidateAction('publish', event),
  uploadEvidence: (event) => handleCandidateAction('uploadEvidence', event),
  uploadPhoto: (event) => handleCandidateAction('uploadPhoto', event),
  approveMedia: (event) => handleCandidateAction('approveMedia', event),
  rejectMedia: (event) => handleCandidateAction('rejectMedia', event),
  retireMedia: (event) => handleCandidateAction('retireMedia', event)
};

async function handleCandidateAction(
  action: ModerationCandidateActionName,
  { locals, params, request }: RequestEvent
) {
  const copy = locals.copy;
  if (!locals.supabase) {
    return fail(503, { action, success: false, error: copy['error.unexpectedBody'] });
  }
  const placeId = params.id;
  if (!placeId) {
    return fail(400, { action, success: false, error: copy['moderation.incomplete'] });
  }

  const result = await executeModerationCandidateAction(action, {
    client: locals.supabase,
    placeId,
    requestId: locals.requestId,
    formData: await request.formData()
  });

  if (result.status === 'confirmed') {
    if (result.effect.kind === 'published') {
      return {
        action: 'publish' as const,
        success: true,
        terminal: true,
        publishedAt: result.effect.publishedAt
      };
    }
    return { action, success: true, terminal: false };
  }

  return fail(result.httpStatus, {
    action,
    success: false,
    error: candidateActionErrorMessage(action, result.error, copy),
    ...(result.error === 'conflict' && action === 'publish' ? { conflict: true } : {}),
    ...(result.error === 'already_published' ? { alreadyPublished: true } : {})
  });
}

function candidateActionErrorMessage(
  action: ModerationCandidateActionName,
  actionError: ModerationCandidateActionError,
  copy: Catalogue
): string {
  if (actionError === 'forbidden') return copy['moderation.unauthorized'];
  if (actionError === 'unavailable') return copy['error.unexpectedBody'];
  if (actionError === 'already_published') return copy['moderation.alreadyPublished'];
  if (actionError === 'conflict') {
    return action === 'publish' ||
      action === 'correctLocation' ||
      action === 'updateWheelchairAccessibility'
      ? copy['moderation.versionConflict']
      : copy['moderation.media.error.conflict'];
  }
  if (
    actionError === 'incomplete' ||
    (actionError === 'invalid' &&
      (action === 'publish' ||
        action === 'correctLocation' ||
        action === 'updateWheelchairAccessibility'))
  ) {
    return copy['moderation.incomplete'];
  }
  if (actionError === 'media_incomplete') return copy['moderation.media.error.incomplete'];
  if (actionError === 'media_file_type') return copy['moderation.media.error.fileType'];
  if (actionError === 'media_file_size') return copy['moderation.media.error.fileSize'];
  if (actionError === 'media_upload') return copy['moderation.media.error.upload'];
  return copy['moderation.media.error.invalid'];
}
