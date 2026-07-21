import {
  readAccessConditionValue,
  readEvidence,
  readPlaceFieldValue
} from '$server/place-flags/place-flag-input';
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

export type ModerationCorrectionActionName = 'resolve' | 'confirmUseful';

export type ModerationCorrectionActionError =
  'invalid' | 'incomplete' | 'not_found' | 'conflict' | 'forbidden' | 'unavailable';

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
  | { readonly kind: 'contribution'; readonly value: 'confirmed' };

export type ModerationCorrectionActionResult =
  | {
      readonly status: 'confirmed';
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
    case 'resolve':
      return resolveModerationCorrection(context);
    case 'confirmUseful':
      return confirmUsefulCorrection(context);
  }
}

async function resolveModerationCorrection(
  context: ModerationCorrectionActionContext
): Promise<ModerationCorrectionActionResult> {
  const detail = await getModerationPlaceFlag(context.flagClient, context.flagId);
  if (detail.status !== 'success') return failure(503, 'unavailable');
  const flag = detail.value;
  if (!flag) return failure(404, 'not_found');

  const form = context.formData ?? new FormData();
  const requestedOutcome = String(form.get('outcome') ?? '');
  if (!isResolvedOutcome(requestedOutcome)) return failure(400, 'invalid');

  const reasonIs = String(form.get('memberReasonIs') ?? '').trim();
  const reasonEn = String(form.get('memberReasonEn') ?? '').trim();
  if (!reasonIs || !reasonEn) return failure(400, 'incomplete');

  const privateNote = String(form.get('privateNote') ?? '').trim() || null;
  let applicationPayload: Record<string, unknown> | null = null;
  let disputeCommand: Record<string, unknown> | null = null;
  let transitionCommand: Record<string, unknown> | null = null;

  if (requestedOutcome === 'applied') {
    if (flag.targetKind === 'place_field') {
      if (!flag.targetField) return failure(400, 'invalid');
      const fieldValue = readPlaceFieldValue(form, flag.targetField);
      const expectedVersion = Number(form.get('expectedVersion') ?? '');
      if (!fieldValue || !Number.isInteger(expectedVersion)) return failure(400, 'invalid');
      applicationPayload = { expected_version: expectedVersion, field_value: fieldValue };
    } else {
      const replacementCondition = readAccessConditionValue(form);
      const evidence = readEvidence(form);
      const expectedVerificationId = String(form.get('expectedVerificationId') ?? '').trim();
      const verifiedAt = String(form.get('verifiedAt') ?? '').trim();
      const freshnessUntil = String(form.get('freshnessUntil') ?? '').trim();
      if (
        !replacementCondition ||
        !evidence ||
        !expectedVerificationId ||
        !verifiedAt ||
        !freshnessUntil
      ) {
        return failure(400, 'invalid');
      }
      applicationPayload = {
        expected_verification_id: expectedVerificationId,
        replacement_condition: replacementCondition,
        evidence,
        verified_at: `${verifiedAt}:00.000Z`,
        freshness_until: `${freshnessUntil}:00.000Z`
      };
    }
  } else if (requestedOutcome === 'dispute_opened') {
    const evidence = readEvidence(form);
    const expectedVerificationId = String(form.get('expectedVerificationId') ?? '').trim();
    const reason = String(form.get('disputeReason') ?? '').trim();
    if (!evidence || !expectedVerificationId || !reason) return failure(400, 'invalid');
    disputeCommand = { expected_verification_id: expectedVerificationId, reason, evidence };
  } else if (requestedOutcome === 'place_inactivated') {
    const expectedVersion = Number(form.get('expectedVersion') ?? '');
    const decisionNotes = String(form.get('decisionNotes') ?? '').trim();
    if (!Number.isInteger(expectedVersion) || !decisionNotes) return failure(400, 'invalid');
    transitionCommand = { expected_version: expectedVersion, decision_notes: decisionNotes };
  }

  const result = await resolvePlaceFlag(
    context.flagClient,
    {
      flagId: flag.flagId,
      outcome: requestedOutcome,
      memberReasonIs: reasonIs,
      memberReasonEn: reasonEn,
      privateNote,
      applicationPayload,
      disputeCommand,
      transitionCommand
    },
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);

  return { status: 'confirmed', effect: { kind: 'resolved', value: requestedOutcome } };
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
  return { status: 'confirmed', effect: { kind: 'contribution', value: 'confirmed' } };
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
  if (status === 'forbidden') return failure(403, 'forbidden');
  if (status === 'invalid') return failure(400, 'invalid');
  return failure(503, 'unavailable');
}

function failure(
  httpStatus: 400 | 403 | 404 | 409 | 503,
  error: ModerationCorrectionActionError
): ModerationCorrectionActionResult {
  return { status: 'failure', httpStatus, error };
}
