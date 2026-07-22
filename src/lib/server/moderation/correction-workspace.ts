import {
  parseCorrectionDraftSection,
  type CorrectionDraftSectionId
} from '$server/moderation/correction-draft-input';
import { saveFlagModerationDraft } from '$server/moderation/moderation-drafts';
import {
  confirmPlaceFlagContribution,
  getModerationPlaceFlag,
  listModerationPlaceFlags,
  listRelatedPlaceFlags,
  resolvePlaceFlag,
  type ModerationPlaceFlag,
  type ModerationPlaceFlagCursor,
  type ModerationPlaceFlagSummary,
  type PlaceFlagCommandResult,
  type PlaceFlagOutcome,
  type PlaceFlagRpcClient,
  type RelatedPlaceFlag
} from '$server/place-flags/place-flags';

type PlaceFlagFailureStatus = Exclude<
  PlaceFlagCommandResult<never>,
  { status: 'success' }
>['status'];

export type CorrectionWorkspaceLoadResult<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: PlaceFlagFailureStatus | 'not_found' };

export interface ModerationCorrectionQueueCursorState {
  readonly cursor: ModerationPlaceFlagCursor | null;
  readonly hasPrevious: boolean;
}

export interface ModerationCorrectionQueueData {
  readonly flags: ModerationPlaceFlagSummary[];
  readonly nextCursor: ModerationPlaceFlagCursor | null;
  readonly hasPrevious: boolean;
}

export interface ModerationCorrectionReviewData {
  readonly flag: ModerationPlaceFlag;
  readonly related: RelatedPlaceFlag[];
  readonly resolved: boolean;
  readonly contributionConfirmed: boolean;
}

export type ModerationCorrectionActionName =
  'saveCorrectionSection' | 'decideCorrection' | 'confirmUseful';

export type ModerationCorrectionActionError =
  'invalid' | 'incomplete' | 'not_found' | 'conflict' | 'resolved' | 'forbidden' | 'unavailable';

export interface ModerationCorrectionActionContext {
  readonly flagClient: PlaceFlagRpcClient;
  readonly flagId: string;
  readonly requestId: string;
  readonly formData: FormData | null;
}

export type ModerationCorrectionConfirmedEffect =
  | {
      readonly kind: 'resolved';
      readonly value: Exclude<PlaceFlagOutcome, 'submitted'>;
    }
  | { readonly kind: 'contribution'; readonly value: 'confirmed' }
  | {
      readonly kind: 'draft_saved';
      readonly sectionId: CorrectionDraftSectionId;
      readonly draftVersion: number;
    };

export type ModerationCorrectionActionResult =
  | {
      readonly status: 'confirmed';
      readonly terminal: boolean;
      readonly effect: ModerationCorrectionConfirmedEffect;
    }
  | {
      readonly status: 'failure';
      readonly httpStatus: 400 | 403 | 404 | 409 | 503;
      readonly error: ModerationCorrectionActionError;
    };

export function parseModerationCorrectionQueueCursor(
  params: URLSearchParams
): ModerationCorrectionQueueCursorState {
  const cursorPriority = params.get('cursorPriority');
  const cursorTime = params.get('cursorTime');
  const cursorId = params.get('cursorId');
  const requestedCursor =
    cursorPriority !== null && cursorTime && cursorId
      ? { priority: Number(cursorPriority), submittedAt: cursorTime, flagId: cursorId }
      : null;

  return {
    cursor: requestedCursor && Number.isInteger(requestedCursor.priority) ? requestedCursor : null,
    hasPrevious: requestedCursor !== null
  };
}

export async function loadModerationCorrectionQueue(
  flagClient: PlaceFlagRpcClient,
  cursorState: ModerationCorrectionQueueCursorState,
  filter: 'actionable' | 'deferred' | 'resolved' = 'actionable'
): Promise<CorrectionWorkspaceLoadResult<ModerationCorrectionQueueData>> {
  const result = await listModerationPlaceFlags(flagClient, cursorState.cursor, 20, filter);
  if (result.status !== 'success') return { status: result.status };

  return {
    status: 'success',
    value: {
      flags: result.value.items,
      nextCursor: result.value.nextCursor,
      hasPrevious: cursorState.hasPrevious
    }
  };
}

export async function loadModerationCorrectionReview(
  flagClient: PlaceFlagRpcClient,
  flagId: string,
  searchParams: URLSearchParams
): Promise<CorrectionWorkspaceLoadResult<ModerationCorrectionReviewData>> {
  const [detail, related] = await Promise.all([
    getModerationPlaceFlag(flagClient, flagId),
    listRelatedPlaceFlags(flagClient, flagId)
  ]);
  if (detail.status !== 'success') return { status: detail.status };
  if (related.status !== 'success') return { status: related.status };
  if (!detail.value) return { status: 'not_found' };

  return {
    status: 'success',
    value: {
      flag: detail.value,
      related: related.value,
      resolved: searchParams.get('resolved') === detail.value.outcome,
      contributionConfirmed: searchParams.get('contribution') === 'confirmed'
    }
  };
}

export async function executeModerationCorrectionAction(
  action: ModerationCorrectionActionName,
  context: ModerationCorrectionActionContext
): Promise<ModerationCorrectionActionResult> {
  switch (action) {
    case 'saveCorrectionSection':
      return saveCorrectionSection(context);
    case 'decideCorrection':
      return decideCorrection(context);
    case 'confirmUseful':
      return confirmUsefulCorrection(context);
  }
}

async function saveCorrectionSection(
  context: ModerationCorrectionActionContext
): Promise<ModerationCorrectionActionResult> {
  const detail = await getModerationPlaceFlag(context.flagClient, context.flagId);
  if (detail.status !== 'success') return failure(503, 'unavailable');
  const flag = detail.value;
  if (!flag) return failure(404, 'not_found');

  const form = context.formData ?? new FormData();
  const versions = readVersions(form);
  const parsed = parseCorrectionDraftSection(
    flag,
    String(form.get('sectionId') ?? '').trim(),
    form
  );
  if (!versions || !parsed) return failure(400, 'incomplete');
  const result = await saveFlagModerationDraft(context.flagClient, {
    flagId: context.flagId,
    expectedItemVersion: versions.expectedItemVersion,
    expectedDraftVersion: versions.expectedDraftVersion,
    sectionId: parsed.sectionId,
    payload: parsed.payload,
    requestId: context.requestId
  });
  if (result.status !== 'success') return commandFailure(result.status);
  return {
    status: 'confirmed',
    terminal: false,
    effect: { kind: 'draft_saved', sectionId: parsed.sectionId, draftVersion: result.value.version }
  };
}

async function decideCorrection(
  context: ModerationCorrectionActionContext
): Promise<ModerationCorrectionActionResult> {
  const form = context.formData ?? new FormData();
  const requestedOutcome = String(form.get('outcome') ?? '');
  if (!isResolvedOutcome(requestedOutcome)) return failure(400, 'invalid');
  const versions = readVersions(form);
  const reasons = readPairedReasons(
    form,
    requestedOutcome !== 'applied' && requestedOutcome !== 'confirmed_useful'
  );
  if (!versions || !reasons) return failure(400, 'incomplete');

  const result = await resolvePlaceFlag(
    context.flagClient,
    {
      flagId: context.flagId,
      outcome: requestedOutcome,
      expectedItemVersion: versions.expectedItemVersion,
      expectedDraftVersion: versions.expectedDraftVersion,
      memberReasonIs: reasons.is,
      memberReasonEn: reasons.en,
      privateNote: String(form.get('privateNote') ?? '').trim() || null
    },
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);

  return {
    status: 'confirmed',
    terminal: true,
    effect: { kind: 'resolved', value: requestedOutcome }
  };
}

async function confirmUsefulCorrection(
  context: ModerationCorrectionActionContext
): Promise<ModerationCorrectionActionResult> {
  const result = await confirmPlaceFlagContribution(
    context.flagClient,
    context.flagId,
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);
  return {
    status: 'confirmed',
    terminal: false,
    effect: { kind: 'contribution', value: 'confirmed' }
  };
}

function isResolvedOutcome(value: string): value is Exclude<PlaceFlagOutcome, 'submitted'> {
  return (
    value === 'needs_information' ||
    value === 'applied' ||
    value === 'confirmed_useful' ||
    value === 'dispute_opened' ||
    value === 'place_inactivated' ||
    value === 'rejected'
  );
}

function commandFailure(status: PlaceFlagFailureStatus): ModerationCorrectionActionResult {
  if (status === 'conflict') return failure(409, 'conflict');
  if (status === 'resolved') return failure(409, 'resolved');
  if (status === 'forbidden') return failure(403, 'forbidden');
  if (status === 'invalid') return failure(400, 'invalid');
  return failure(503, 'unavailable');
}

function readVersions(
  form: FormData
): { expectedItemVersion: number; expectedDraftVersion: number } | null {
  const expectedItemVersion = Number(form.get('expectedItemVersion'));
  const expectedDraftVersion = Number(form.get('expectedDraftVersion'));
  return Number.isInteger(expectedItemVersion) &&
    expectedItemVersion > 0 &&
    Number.isInteger(expectedDraftVersion) &&
    expectedDraftVersion >= 0
    ? { expectedItemVersion, expectedDraftVersion }
    : null;
}

function readPairedReasons(
  form: FormData,
  required: boolean
): { is: string | null; en: string | null } | null {
  const is = String(form.get('memberReasonIs') ?? '').trim() || null;
  const en = String(form.get('memberReasonEn') ?? '').trim() || null;
  if ((is === null) !== (en === null) || (required && (!is || !en))) return null;
  return { is, en };
}

function failure(
  httpStatus: 400 | 403 | 404 | 409 | 503,
  error: ModerationCorrectionActionError
): ModerationCorrectionActionResult {
  return { status: 'failure', httpStatus, error };
}
