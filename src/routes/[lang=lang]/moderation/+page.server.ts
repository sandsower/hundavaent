import { error, fail, redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';

import { parseLocale, type Catalogue } from '$i18n';
import type { ContributorRpcClient } from '$server/contributors/contributor-status';
import type {
  CandidateQueueCursor,
  CandidateQueueRpcClient
} from '$server/moderation/candidate-queue';
import {
  executeModerationCandidateAction,
  loadModerationCandidateQueue,
  loadModerationCandidateReview,
  type ModerationCandidateActionError,
  type ModerationCandidateActionName,
  type ModerationCandidateReviewData
} from '$server/moderation/candidate-workspace';
import {
  executeModerationCorrectionAction,
  loadModerationCorrectionQueue,
  loadModerationCorrectionReview,
  type ModerationCorrectionConfirmedEffect,
  type ModerationCorrectionQueueCursorState,
  type ModerationCorrectionReviewData
} from '$server/moderation/correction-workspace';
import {
  listModerationQueueSummary,
  type QueueSummaryRpcClient
} from '$server/moderation/queue-summary';
import {
  executeModerationSuggestionAction,
  loadModerationSuggestionQueue,
  loadModerationSuggestionReview,
  type ModerationSuggestionActionName,
  type ModerationSuggestionConfirmedEffect,
  type ModerationSuggestionQueueCursorState,
  type ModerationSuggestionReviewData
} from '$server/moderation/suggestion-workspace';
import {
  buildModerationWorkspaceContinuation,
  parseModerationWorkspaceQuery,
  selectVisibleModerationItemId,
  serializeModerationWorkspaceQuery,
  type ModerationWorkspaceQuery,
  type ModerationWorkspaceQueueId
} from '$server/moderation/workspace-query';
import type {
  ModerationSuggestionCursor,
  SuggestionRpcClient
} from '$server/suggestions/suggestions';
import type {
  ModerationPlaceFlagCursor,
  PlaceFlagRpcClient
} from '$server/place-flags/place-flags';

import type { Actions, PageServerLoad } from './$types';

const moderationNoticeCookie = 'moderation-workspace-notice';

const fallbackPaths: Record<Exclude<ModerationWorkspaceQueueId, 'suggestions'>, string> = {
  'corrections-and-reports': 'corrections-and-reports',
  'candidate-places': 'places/new'
};

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = async ({ cookies, locals, params, url }) => {
  const lang = parseLocale(params.lang);
  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const state = parseModerationWorkspaceQuery(url.searchParams);
  redirectIfInvalidWorkspaceCursor(url, state);
  const summaryResult = await listModerationQueueSummary(
    locals.supabase as unknown as QueueSummaryRpcClient
  );
  if (summaryResult.status !== 'success') {
    error(summaryResult.status === 'forbidden' ? 403 : 503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  if (state.queue !== 'suggestions') {
    if (state.queue === 'corrections-and-reports') {
      const flagClient = locals.supabase as unknown as PlaceFlagRpcClient;
      const queueResult = await loadModerationCorrectionQueue(
        flagClient,
        correctionCursorState(state.cursor)
      );
      if (queueResult.status !== 'success') {
        redirectIfNonCanonical(url, state);
        return {
          workspace: state,
          queues: summaryResult.value,
          suggestions: [],
          suggestionReview: null,
          corrections: [],
          correctionReview: null,
          candidates: [],
          candidateReview: null,
          nextCursor: null,
          hasPrevious: Boolean(state.cursor),
          queueError: locals.copy['error.unexpectedBody'],
          reviewError: null,
          workspaceNotice: takeWorkspaceNotice(cookies, lang),
          fallbackHref: `/${lang}/moderation/corrections-and-reports`
        };
      }

      const corrections = queueResult.value.flags.filter(
        (flag) => flag.outcome === 'submitted' || flag.outcome === 'needs_information'
      );
      let selectedItemId = selectVisibleModerationItemId(
        state.itemId,
        corrections.map((flag) => flag.flagId),
        state.selectLast
      );
      let correctionReview: ModerationCorrectionReviewData | null = null;
      let reviewError: string | null = null;
      if (selectedItemId) {
        const reviewResult = await loadModerationCorrectionReview(
          flagClient,
          selectedItemId,
          url.searchParams
        );
        if (
          reviewResult.status === 'success' &&
          (reviewResult.value.flag.outcome === 'submitted' ||
            reviewResult.value.flag.outcome === 'needs_information')
        ) {
          correctionReview = reviewResult.value;
        } else if (reviewResult.status !== 'success' && reviewResult.status !== 'not_found') {
          reviewError = locals.copy['moderation.workspace.reviewUnavailable'];
        } else if (state.itemId) {
          selectedItemId = corrections[0]?.flagId ?? null;
          correctionReview = selectedItemId
            ? await loadActionableCorrectionReview(flagClient, selectedItemId, url)
            : null;
        }
      }
      if (selectedItemId && !correctionReview && !reviewError) {
        reviewError = locals.copy['moderation.workspace.reviewUnavailable'];
      }

      const canonicalState: ModerationWorkspaceQuery = {
        ...state,
        itemId: selectedItemId,
        selectLast: false
      };
      redirectIfNonCanonical(url, canonicalState);
      return {
        workspace: canonicalState,
        queues: summaryResult.value,
        suggestions: [],
        suggestionReview: null,
        corrections,
        correctionReview,
        candidates: [],
        candidateReview: null,
        nextCursor: encodeCorrectionCursor(queueResult.value.nextCursor),
        hasPrevious: queueResult.value.hasPrevious,
        queueError: null,
        reviewError,
        workspaceNotice: takeWorkspaceNotice(cookies, lang),
        fallbackHref: `/${lang}/moderation/corrections-and-reports`
      };
    }
    const candidateQueueResult = await loadModerationCandidateQueue(
      locals.supabase as unknown as CandidateQueueRpcClient,
      candidateCursorState(state.cursor)
    );
    if (candidateQueueResult.status !== 'success') {
      redirectIfNonCanonical(url, state);
      return {
        workspace: state,
        queues: summaryResult.value,
        suggestions: [],
        suggestionReview: null,
        corrections: [],
        correctionReview: null,
        candidates: [],
        candidateReview: null,
        nextCursor: null,
        hasPrevious: Boolean(state.cursor),
        queueError: locals.copy['error.unexpectedBody'],
        reviewError: null,
        workspaceNotice: takeWorkspaceNotice(cookies, lang),
        fallbackHref: `/${lang}/moderation/${fallbackPaths[state.queue]}`
      };
    }

    const candidates = candidateQueueResult.value.items;
    let selectedItemId = selectVisibleModerationItemId(
      state.itemId,
      candidates.map((candidate) => candidate.placeId),
      state.selectLast
    );
    let candidateReview: ModerationCandidateReviewData | null = null;
    let reviewError: string | null = null;
    if (selectedItemId) {
      const reviewResult = await loadModerationCandidateReview(locals.supabase, selectedItemId);
      if (
        reviewResult.status === 'success' &&
        reviewResult.value.review.lifecycle === 'candidate'
      ) {
        candidateReview = reviewResult.value;
      } else if (reviewResult.status !== 'success' && reviewResult.status !== 'not_found') {
        reviewError = locals.copy['moderation.workspace.reviewUnavailable'];
      } else if (state.itemId) {
        selectedItemId = candidates[0]?.placeId ?? null;
        candidateReview = selectedItemId
          ? await loadActionableCandidateReview(locals.supabase, selectedItemId)
          : null;
      }
    }
    if (selectedItemId && !candidateReview && !reviewError) {
      reviewError = locals.copy['moderation.workspace.reviewUnavailable'];
    }

    const canonicalState: ModerationWorkspaceQuery = {
      ...state,
      itemId: selectedItemId,
      selectLast: false
    };
    redirectIfNonCanonical(url, canonicalState);
    return {
      workspace: canonicalState,
      queues: summaryResult.value,
      suggestions: [],
      suggestionReview: null,
      corrections: [],
      correctionReview: null,
      candidates,
      candidateReview,
      nextCursor: encodeCandidateCursor(candidateQueueResult.value.nextCursor),
      hasPrevious: candidateQueueResult.value.hasPrevious,
      queueError: null,
      reviewError,
      workspaceNotice: takeWorkspaceNotice(cookies, lang),
      fallbackHref: `/${lang}/moderation/${fallbackPaths[state.queue]}`
    };
  }

  const suggestionClient = locals.supabase as unknown as SuggestionRpcClient;
  const contributorClient = locals.supabase as unknown as ContributorRpcClient;
  const queueResult = await loadModerationSuggestionQueue(
    suggestionClient,
    contributorClient,
    suggestionCursorState(state.cursor)
  );

  if (queueResult.status !== 'success') {
    redirectIfNonCanonical(url, state);
    return {
      workspace: state,
      queues: summaryResult.value,
      suggestions: [],
      suggestionReview: null,
      corrections: [],
      correctionReview: null,
      candidates: [],
      candidateReview: null,
      nextCursor: null,
      hasPrevious: Boolean(state.cursor),
      queueError: locals.copy['error.unexpectedBody'],
      reviewError: null,
      workspaceNotice: takeWorkspaceNotice(cookies, lang),
      fallbackHref: `/${lang}/moderation/suggestions`
    };
  }

  const suggestions = queueResult.value.suggestions.filter(
    (suggestion) => suggestion.outcome === 'submitted'
  );
  let selectedItemId = selectVisibleModerationItemId(
    state.itemId,
    suggestions.map((suggestion) => suggestion.suggestionId),
    state.selectLast
  );
  let suggestionReview: ModerationSuggestionReviewData | null = null;
  let reviewError: string | null = null;

  if (selectedItemId) {
    const reviewResult = await loadModerationSuggestionReview(
      suggestionClient,
      contributorClient,
      selectedItemId,
      url.searchParams
    );
    if (
      reviewResult.status === 'success' &&
      reviewResult.value.suggestion.outcome === 'submitted'
    ) {
      suggestionReview = reviewResult.value;
    } else if (reviewResult.status !== 'success' && reviewResult.status !== 'not_found') {
      reviewError = locals.copy['moderation.workspace.reviewUnavailable'];
    } else if (state.itemId) {
      selectedItemId = suggestions[0]?.suggestionId ?? null;
      suggestionReview = selectedItemId
        ? await loadActionableReview(suggestionClient, contributorClient, selectedItemId, url)
        : null;
    }
  }
  if (selectedItemId && !suggestionReview && !reviewError) {
    reviewError = locals.copy['moderation.workspace.reviewUnavailable'];
  }

  const canonicalState: ModerationWorkspaceQuery = {
    ...state,
    itemId: selectedItemId,
    selectLast: false
  };
  redirectIfNonCanonical(url, canonicalState);

  return {
    workspace: canonicalState,
    queues: summaryResult.value,
    suggestions,
    suggestionReview,
    corrections: [],
    correctionReview: null,
    candidates: [],
    candidateReview: null,
    nextCursor: encodeSuggestionCursor(queueResult.value.nextCursor),
    hasPrevious: queueResult.value.hasPrevious,
    queueError: null,
    reviewError,
    workspaceNotice: takeWorkspaceNotice(cookies, lang),
    fallbackHref: `/${lang}/moderation/suggestions`
  };
};

// Every command remains authorized by security.require_moderator() inside its RPC.
export const actions: Actions = {
  refreshMatches: (event) => runWorkspaceSuggestionAction('refreshMatches', event),
  resolve: (event) => runSharedWorkspaceAction('resolve', event),
  confirmUseful: (event) => runSharedWorkspaceAction('confirmUseful', event),
  revokeContribution: (event) => runWorkspaceSuggestionAction('revokeContribution', event),
  recordConductFlag: (event) => runWorkspaceSuggestionAction('recordConductFlag', event),
  clearConductFlag: (event) => runWorkspaceSuggestionAction('clearConductFlag', event),
  correctLocation: (event) => runWorkspaceCandidateAction('correctLocation', event),
  publish: (event) => runWorkspaceCandidateAction('publish', event),
  uploadEvidence: (event) => runWorkspaceCandidateAction('uploadEvidence', event),
  uploadPhoto: (event) => runWorkspaceCandidateAction('uploadPhoto', event),
  approveMedia: (event) => runWorkspaceCandidateAction('approveMedia', event),
  rejectMedia: (event) => runWorkspaceCandidateAction('rejectMedia', event),
  retireMedia: (event) => runWorkspaceCandidateAction('retireMedia', event)
};

async function runSharedWorkspaceAction(
  action: 'resolve' | 'confirmUseful',
  event: Parameters<NonNullable<Actions['resolve']>>[0]
) {
  const formData = await event.request.formData();
  if (formData.has('flagId')) {
    return runWorkspaceCorrectionAction(action, event, formData);
  }
  return runWorkspaceSuggestionAction(action, event, formData);
}

async function runWorkspaceSuggestionAction(
  action: ModerationSuggestionActionName,
  event: Parameters<NonNullable<Actions[ModerationSuggestionActionName]>>[0],
  suppliedFormData?: FormData
) {
  const { cookies, locals, params, request, url } = event;
  if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

  const formData = suppliedFormData ?? (await request.formData());
  const suggestionId = String(formData.get('suggestionId') ?? '')
    .trim()
    .toLowerCase();
  if (!uuidPattern.test(suggestionId)) return fail(400, { error: 'invalid' as const });

  const suggestionClient = locals.supabase as unknown as SuggestionRpcClient;
  const contributorClient = locals.supabase as unknown as ContributorRpcClient;
  const result = await executeModerationSuggestionAction(action, {
    suggestionClient,
    contributorClient,
    suggestionId,
    requestId: locals.requestId,
    formData: action === 'confirmUseful' ? null : formData
  });
  if (result.status === 'failure') {
    const conflictReview =
      result.error === 'conflict'
        ? await loadModerationSuggestionReview(
            suggestionClient,
            contributorClient,
            suggestionId,
            url.searchParams
          )
        : null;
    return fail(result.httpStatus, {
      error: result.error,
      suggestionId,
      ...(conflictReview?.status === 'success'
        ? { conflictQueue: 'suggestions' as const, conflictReview: conflictReview.value }
        : {}),
      conflictRefreshFailed: result.error === 'conflict' && conflictReview?.status !== 'success'
    });
  }
  if (result.status === 'refreshed') return { ...result.data, suggestionId };

  const lang = parseLocale(params.lang);
  setWorkspaceNotice(cookies, lang, result.effect, url.protocol === 'https:');
  const nextState = buildModerationWorkspaceContinuation(
    'suggestions',
    suggestionId,
    result.effect.kind === 'resolved',
    formData
  );
  redirect(303, `/${lang}/moderation?${serializeModerationWorkspaceQuery(nextState)}`);
}

async function runWorkspaceCorrectionAction(
  action: 'resolve' | 'confirmUseful',
  event: Parameters<NonNullable<Actions['resolve']>>[0],
  formData: FormData
) {
  const { cookies, locals, params, url } = event;
  if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

  const flagId = String(formData.get('flagId') ?? '')
    .trim()
    .toLowerCase();
  if (!uuidPattern.test(flagId)) return fail(400, { error: 'invalid' as const });
  const flagClient = locals.supabase as unknown as PlaceFlagRpcClient;
  const result = await executeModerationCorrectionAction(action, {
    flagClient,
    flagId,
    requestId: locals.requestId,
    formData: action === 'resolve' ? formData : null
  });
  if (result.status === 'failure') {
    const conflictReview =
      result.error === 'conflict'
        ? await loadModerationCorrectionReview(flagClient, flagId, url.searchParams)
        : null;
    return fail(result.httpStatus, {
      error: result.error,
      flagId,
      ...(conflictReview?.status === 'success'
        ? {
            conflictQueue: 'corrections-and-reports' as const,
            conflictReview: conflictReview.value
          }
        : {}),
      conflictRefreshFailed: result.error === 'conflict' && conflictReview?.status !== 'success'
    });
  }

  const lang = parseLocale(params.lang);
  setWorkspaceNotice(cookies, lang, result.effect, url.protocol === 'https:');
  const nextState = buildModerationWorkspaceContinuation(
    'corrections-and-reports',
    flagId,
    result.effect.kind === 'resolved',
    formData
  );
  redirect(303, `/${lang}/moderation?${serializeModerationWorkspaceQuery(nextState)}`);
}

async function runWorkspaceCandidateAction(
  action: ModerationCandidateActionName,
  event: Parameters<NonNullable<Actions['resolve']>>[0]
) {
  const { cookies, locals, params, request, url } = event;
  const lang = parseLocale(params.lang);
  const copy = locals.copy;
  if (!locals.supabase) {
    return fail(503, { action, success: false, error: copy['error.unexpectedBody'] });
  }

  const formData = await request.formData();
  const placeId = String(formData.get('placeId') ?? '')
    .trim()
    .toLowerCase();
  if (!uuidPattern.test(placeId)) {
    return fail(400, { action, success: false, error: copy['moderation.incomplete'] });
  }

  const result = await executeModerationCandidateAction(action, {
    client: locals.supabase,
    placeId,
    requestId: locals.requestId,
    formData
  });
  if (result.status === 'failure') {
    const conflictReview =
      result.error === 'conflict'
        ? await loadModerationCandidateReview(locals.supabase, placeId)
        : null;
    return fail(result.httpStatus, {
      action,
      success: false,
      error: candidateActionErrorMessage(action, result.error, copy),
      ...(result.error === 'conflict' ? { conflict: true } : {}),
      ...(result.error === 'already_published' ? { alreadyPublished: true } : {}),
      ...(conflictReview?.status === 'success'
        ? { conflictQueue: 'candidate-places' as const, conflictReview: conflictReview.value }
        : {}),
      conflictRefreshFailed: result.error === 'conflict' && conflictReview?.status !== 'success'
    });
  }

  setRawWorkspaceNotice(
    cookies,
    lang,
    `candidate:${result.effect.kind}`,
    url.protocol === 'https:'
  );
  const nextState = buildModerationWorkspaceContinuation(
    'candidate-places',
    placeId,
    result.terminal,
    formData
  );
  redirect(303, `/${lang}/moderation?${serializeModerationWorkspaceQuery(nextState)}`);
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
    return action === 'publish' || action === 'correctLocation'
      ? copy['moderation.versionConflict']
      : copy['moderation.media.error.conflict'];
  }
  if (
    actionError === 'incomplete' ||
    (actionError === 'invalid' && (action === 'publish' || action === 'correctLocation'))
  ) {
    return copy['moderation.incomplete'];
  }
  if (actionError === 'media_incomplete') return copy['moderation.media.error.incomplete'];
  if (actionError === 'media_file_type') return copy['moderation.media.error.fileType'];
  if (actionError === 'media_file_size') return copy['moderation.media.error.fileSize'];
  if (actionError === 'media_upload') return copy['moderation.media.error.upload'];
  return copy['moderation.media.error.invalid'];
}

function setWorkspaceNotice(
  cookies: Cookies,
  lang: ReturnType<typeof parseLocale>,
  effect: ModerationSuggestionConfirmedEffect | ModerationCorrectionConfirmedEffect,
  secure: boolean
): void {
  cookies.set(moderationNoticeCookie, `${effect.kind}:${effect.value}`, {
    path: `/${lang}/moderation`,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 60
  });
}

function setRawWorkspaceNotice(
  cookies: Cookies,
  lang: ReturnType<typeof parseLocale>,
  value: string,
  secure: boolean
): void {
  cookies.set(moderationNoticeCookie, value, {
    path: `/${lang}/moderation`,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 60
  });
}

function takeWorkspaceNotice(
  cookies: Cookies,
  lang: ReturnType<typeof parseLocale>
): WorkspaceNotice | null {
  const value = cookies.get(moderationNoticeCookie);
  cookies.delete(moderationNoticeCookie, { path: `/${lang}/moderation` });
  if (!value) return null;

  const [kind, effectValue, detail, actionDetail, overflow] = value.split(':');
  if (overflow !== undefined) return null;
  if (
    kind === 'candidate' &&
    detail === undefined &&
    moderationCandidateEffects.has(effectValue as CandidateWorkspaceNotice['value'])
  ) {
    return { kind, value: effectValue as CandidateWorkspaceNotice['value'] };
  }
  if (detail !== undefined || actionDetail !== undefined) return null;
  if (
    kind === 'resolved' &&
    (effectValue === 'needs_information' ||
      effectValue === 'accepted' ||
      effectValue === 'duplicate' ||
      effectValue === 'rejected' ||
      effectValue === 'applied' ||
      effectValue === 'confirmed_useful' ||
      effectValue === 'dispute_opened' ||
      effectValue === 'place_inactivated')
  ) {
    return { kind, value: effectValue };
  }
  if (kind === 'contribution' && (effectValue === 'confirmed' || effectValue === 'revoked')) {
    return { kind, value: effectValue };
  }
  if (kind === 'flag' && (effectValue === 'recorded' || effectValue === 'cleared')) {
    return { kind, value: effectValue };
  }
  return null;
}

type WorkspaceNotice =
  | ModerationSuggestionConfirmedEffect
  | ModerationCorrectionConfirmedEffect
  | CandidateWorkspaceNotice;

type CandidateWorkspaceNotice = {
  readonly kind: 'candidate';
  readonly value:
    | 'published'
    | 'location_corrected'
    | 'evidence_uploaded'
    | 'photo_uploaded'
    | 'media_approved'
    | 'media_rejected'
    | 'media_retired';
};

const moderationCandidateEffects = new Set<CandidateWorkspaceNotice['value']>([
  'published',
  'location_corrected',
  'evidence_uploaded',
  'photo_uploaded',
  'media_approved',
  'media_rejected',
  'media_retired'
]);

async function loadActionableReview(
  suggestionClient: SuggestionRpcClient,
  contributorClient: ContributorRpcClient,
  suggestionId: string,
  url: URL
): Promise<ModerationSuggestionReviewData | null> {
  const result = await loadModerationSuggestionReview(
    suggestionClient,
    contributorClient,
    suggestionId,
    url.searchParams
  );
  return result.status === 'success' && result.value.suggestion.outcome === 'submitted'
    ? result.value
    : null;
}

async function loadActionableCorrectionReview(
  flagClient: PlaceFlagRpcClient,
  flagId: string,
  url: URL
): Promise<ModerationCorrectionReviewData | null> {
  const result = await loadModerationCorrectionReview(flagClient, flagId, url.searchParams);
  return result.status === 'success' &&
    (result.value.flag.outcome === 'submitted' || result.value.flag.outcome === 'needs_information')
    ? result.value
    : null;
}

async function loadActionableCandidateReview(
  client: Parameters<typeof loadModerationCandidateReview>[0],
  placeId: string
): Promise<ModerationCandidateReviewData | null> {
  const result = await loadModerationCandidateReview(client, placeId);
  return result.status === 'success' && result.value.review.lifecycle === 'candidate'
    ? result.value
    : null;
}

function redirectIfNonCanonical(url: URL, state: ModerationWorkspaceQuery): void {
  const canonical = serializeModerationWorkspaceQuery(state).toString();
  if (url.searchParams.toString() !== canonical) {
    redirect(303, `${url.pathname}?${canonical}`);
  }
}

function redirectIfInvalidWorkspaceCursor(url: URL, state: ModerationWorkspaceQuery): void {
  if (!state.cursor) return;
  const valid =
    state.queue === 'suggestions'
      ? decodeSuggestionCursor(state.cursor)
      : state.queue === 'corrections-and-reports'
        ? decodeCorrectionCursor(state.cursor)
        : state.queue === 'candidate-places'
          ? decodeCandidateCursor(state.cursor)
          : null;
  if (!valid) {
    redirectIfNonCanonical(url, {
      ...state,
      cursor: null,
      cursorTrail: [],
      selectLast: false
    });
  }
}

function suggestionCursorState(cursor: string | null): ModerationSuggestionQueueCursorState {
  return { cursor: decodeSuggestionCursor(cursor), hasPrevious: cursor !== null };
}

function correctionCursorState(cursor: string | null): ModerationCorrectionQueueCursorState {
  return { cursor: decodeCorrectionCursor(cursor), hasPrevious: cursor !== null };
}

function candidateCursorState(cursor: string | null) {
  return { cursor: decodeCandidateCursor(cursor), hasPrevious: cursor !== null };
}

function encodeCandidateCursor(cursor: CandidateQueueCursor | null): string | null {
  if (!cursor) return null;
  const timestamp = Date.parse(cursor.createdAt);
  if (!Number.isFinite(timestamp)) return null;
  return `${timestamp.toString(36)}~${cursor.placeId}`;
}

function decodeCandidateCursor(cursor: string | null): CandidateQueueCursor | null {
  if (!cursor) return null;
  const [encodedTimestamp, placeId, overflow] = cursor.split('~');
  if (overflow !== undefined || !encodedTimestamp || !uuidPattern.test(placeId ?? '')) return null;
  const timestamp = Number.parseInt(encodedTimestamp, 36);
  const createdAt = safeIsoTimestamp(timestamp);
  return createdAt ? { createdAt, placeId } : null;
}

function encodeCorrectionCursor(cursor: ModerationPlaceFlagCursor | null): string | null {
  if (!cursor) return null;
  const timestamp = Date.parse(cursor.submittedAt);
  if (!Number.isFinite(timestamp)) return null;
  return `${cursor.priority.toString(36)}~${timestamp.toString(36)}~${cursor.flagId}`;
}

function decodeCorrectionCursor(cursor: string | null): ModerationPlaceFlagCursor | null {
  if (!cursor) return null;
  const [priorityToken, timestampToken, flagId, extra] = cursor.split('~');
  const priority = Number.parseInt(priorityToken, 36);
  const timestamp = Number.parseInt(timestampToken, 36);
  if (
    extra !== undefined ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    !Number.isSafeInteger(timestamp) ||
    !uuidPattern.test(flagId)
  ) {
    return null;
  }
  const submittedAt = safeIsoTimestamp(timestamp);
  return submittedAt ? { priority, submittedAt, flagId } : null;
}

function encodeSuggestionCursor(cursor: ModerationSuggestionCursor | null): string | null {
  if (!cursor) return null;
  const timestamp = Date.parse(cursor.submittedAt);
  if (!Number.isFinite(timestamp)) return null;
  return `${cursor.queueRank.toString(36)}~${timestamp.toString(36)}~${cursor.suggestionId}`;
}

function decodeSuggestionCursor(cursor: string | null): ModerationSuggestionCursor | null {
  if (!cursor) return null;
  const [rankToken, timestampToken, suggestionId, extra] = cursor.split('~');
  const queueRank = Number.parseInt(rankToken, 36);
  const timestamp = Number.parseInt(timestampToken, 36);
  if (
    extra !== undefined ||
    !Number.isInteger(queueRank) ||
    queueRank < 0 ||
    !Number.isSafeInteger(timestamp) ||
    !uuidPattern.test(suggestionId)
  ) {
    return null;
  }
  const submittedAt = safeIsoTimestamp(timestamp);
  return submittedAt ? { queueRank, submittedAt, suggestionId } : null;
}

function safeIsoTimestamp(timestamp: number): string | null {
  if (!Number.isSafeInteger(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
