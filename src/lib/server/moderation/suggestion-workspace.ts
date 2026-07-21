import {
  clearMemberConductFlag,
  getModerationContributorStatus,
  listMemberContributorPriority,
  listModerationContributorEvidence,
  recordMemberConductFlag,
  revokeContribution,
  type ConductFlagKind,
  type ContributorEvidenceItem,
  type ContributorRpcClient,
  type ContributorTier,
  type ModerationContributorStatus
} from '$server/contributors/contributor-status';
import {
  confirmSuggestionContribution,
  getModerationSuggestion,
  listModerationSuggestions,
  listSuggestionPlaceMatches,
  listSuggestionPlaceMatchesForPayload,
  resolveSuggestion,
  type ModerationSuggestion,
  type ModerationSuggestionCursor,
  type ModerationSuggestionSummary,
  type SuggestionCommandResult,
  type SuggestionOutcome,
  type SuggestionPlaceMatch,
  type SuggestionRpcClient
} from '$server/suggestions/suggestions';
import {
  parseSuggestionFormData,
  type SuggestionInputError,
  type SuggestionProposal
} from '$server/suggestions/suggestion-input';

type SuggestionCommandFailureStatus = Exclude<
  SuggestionCommandResult<never>,
  { status: 'success' }
>['status'];

export type SuggestionWorkspaceLoadResult<T> =
  { status: 'success'; value: T } | { status: SuggestionCommandFailureStatus | 'not_found' };

export interface ModerationSuggestionQueueCursorState {
  readonly cursor: ModerationSuggestionCursor | null;
  readonly hasPrevious: boolean;
}

export type ModerationSuggestionQueueItem = ModerationSuggestionSummary & {
  trustTier: ContributorTier;
};

export interface ModerationSuggestionQueueData {
  readonly suggestions: ModerationSuggestionQueueItem[];
  readonly nextCursor: ModerationSuggestionCursor | null;
  readonly hasPrevious: boolean;
}

export interface ModerationSuggestionReviewData {
  readonly suggestion: ModerationSuggestion;
  readonly matches: SuggestionPlaceMatch[];
  readonly resolved: boolean;
  readonly contributionConfirmed: boolean;
  readonly contributor: ModerationContributorStatus | null;
  readonly contributorEvidence: ContributorEvidenceItem[];
  readonly contributionRevoked: boolean;
  readonly conductFlagRecorded: boolean;
  readonly conductFlagCleared: boolean;
}

export type ModerationSuggestionActionName =
  | 'refreshMatches'
  | 'resolve'
  | 'confirmUseful'
  | 'revokeContribution'
  | 'recordConductFlag'
  | 'clearConductFlag';

export type ModerationSuggestionActionError =
  | SuggestionInputError
  | 'invalid'
  | 'incomplete'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'unavailable';

export interface ModerationSuggestionActionContext {
  readonly suggestionClient: SuggestionRpcClient;
  readonly contributorClient: ContributorRpcClient;
  readonly suggestionId: string;
  readonly requestId: string;
  readonly formData: FormData | null;
}

export interface ModerationSuggestionRefreshedData {
  readonly matchesRefreshed: true;
  readonly refreshedMatches: SuggestionPlaceMatch[];
  readonly refreshedProposal: SuggestionProposal;
  readonly refreshedOutcome: 'accepted';
  readonly refreshedMemberReasonIs: string;
  readonly refreshedMemberReasonEn: string;
  readonly refreshedPrivateNote: string;
}

export type ModerationSuggestionConfirmedEffect =
  | {
      readonly kind: 'resolved';
      readonly value: Exclude<SuggestionOutcome, 'submitted'>;
    }
  | { readonly kind: 'contribution'; readonly value: 'confirmed' | 'revoked' }
  | { readonly kind: 'flag'; readonly value: 'recorded' | 'cleared' };

export type ModerationSuggestionActionResult =
  | { readonly status: 'refreshed'; readonly data: ModerationSuggestionRefreshedData }
  | { readonly status: 'confirmed'; readonly effect: ModerationSuggestionConfirmedEffect }
  | {
      readonly status: 'failure';
      readonly httpStatus: 400 | 403 | 404 | 409 | 503;
      readonly error: ModerationSuggestionActionError;
    };

export function parseModerationSuggestionQueueCursor(
  params: URLSearchParams
): ModerationSuggestionQueueCursorState {
  const cursorRank = params.get('cursorRank');
  const cursorTime = params.get('cursorTime');
  const cursorId = params.get('cursorId');
  const requestedCursor =
    cursorRank !== null && cursorTime && cursorId
      ? { queueRank: Number(cursorRank), submittedAt: cursorTime, suggestionId: cursorId }
      : null;

  return {
    cursor: requestedCursor && Number.isInteger(requestedCursor.queueRank) ? requestedCursor : null,
    hasPrevious: requestedCursor !== null
  };
}

export async function loadModerationSuggestionQueue(
  suggestionClient: SuggestionRpcClient,
  contributorClient: ContributorRpcClient,
  cursorState: ModerationSuggestionQueueCursorState,
  filter: 'actionable' | 'deferred' | 'resolved' = 'actionable'
): Promise<SuggestionWorkspaceLoadResult<ModerationSuggestionQueueData>> {
  const result = await listModerationSuggestions(suggestionClient, cursorState.cursor, 20, filter);
  if (result.status !== 'success') return { status: result.status };

  const memberIds = [...new Set(result.value.items.map((item) => item.memberId))];
  const priority = await listMemberContributorPriority(contributorClient, memberIds);
  const tierByMember = new Map(
    priority.status === 'success' ? priority.value.map((row) => [row.memberId, row.status]) : []
  );

  return {
    status: 'success',
    value: {
      suggestions: applyBoundedTrustOrder(result.value.items, tierByMember),
      nextCursor: result.value.nextCursor,
      hasPrevious: cursorState.hasPrevious
    }
  };
}

export async function loadModerationSuggestionReview(
  suggestionClient: SuggestionRpcClient,
  contributorClient: ContributorRpcClient,
  suggestionId: string,
  searchParams: URLSearchParams
): Promise<SuggestionWorkspaceLoadResult<ModerationSuggestionReviewData>> {
  const [detail, matches] = await Promise.all([
    getModerationSuggestion(suggestionClient, suggestionId),
    listSuggestionPlaceMatches(suggestionClient, suggestionId)
  ]);
  if (detail.status !== 'success') return { status: detail.status };
  if (matches.status !== 'success') return { status: matches.status };

  const suggestion = detail.value;
  if (!suggestion) return { status: 'not_found' };

  const [contributorStatus, evidence] = await Promise.all([
    getModerationContributorStatus(contributorClient, suggestion.memberId),
    listModerationContributorEvidence(contributorClient, suggestion.memberId)
  ]);

  return {
    status: 'success',
    value: {
      suggestion,
      matches: matches.value,
      resolved: searchParams.get('resolved') === suggestion.outcome,
      contributionConfirmed: searchParams.get('contribution') === 'confirmed',
      contributor: contributorStatus.status === 'success' ? contributorStatus.value : null,
      contributorEvidence: evidence.status === 'success' ? evidence.value : [],
      contributionRevoked: searchParams.get('contribution') === 'revoked',
      conductFlagRecorded: searchParams.get('flag') === 'recorded',
      conductFlagCleared: searchParams.get('flag') === 'cleared'
    }
  };
}

export async function executeModerationSuggestionAction(
  action: ModerationSuggestionActionName,
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  switch (action) {
    case 'refreshMatches':
      return refreshSuggestionMatches(context);
    case 'resolve':
      return resolveModerationSuggestion(context);
    case 'confirmUseful':
      return confirmUsefulSuggestion(context);
    case 'revokeContribution':
      return revokeSuggestionContribution(context);
    case 'recordConductFlag':
      return recordSuggestionConductFlag(context);
    case 'clearConductFlag':
      return clearSuggestionConductFlag(context);
  }
}

async function refreshSuggestionMatches(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const parsedProposal = parseSuggestionFormData(form);
  if (!parsedProposal.ok) return failure(400, parsedProposal.error);

  const matches = await listSuggestionPlaceMatchesForPayload(
    context.suggestionClient,
    parsedProposal.proposal
  );
  if (matches.status !== 'success') {
    return matches.status === 'forbidden' ? failure(403, 'forbidden') : failure(503, 'unavailable');
  }

  return {
    status: 'refreshed',
    data: {
      matchesRefreshed: true,
      refreshedMatches: matches.value,
      refreshedProposal: parsedProposal.proposal,
      refreshedOutcome: 'accepted',
      refreshedMemberReasonIs: String(form.get('memberReasonIs') ?? ''),
      refreshedMemberReasonEn: String(form.get('memberReasonEn') ?? ''),
      refreshedPrivateNote: String(form.get('privateNote') ?? '')
    }
  };
}

async function resolveModerationSuggestion(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const outcome = String(form.get('outcome') ?? '') as SuggestionOutcome;
  if (!isModerationOutcome(outcome)) return failure(400, 'invalid');

  const reasonIs = String(form.get('memberReasonIs') ?? '').trim();
  const reasonEn = String(form.get('memberReasonEn') ?? '').trim();
  if (!reasonIs || !reasonEn) return failure(400, 'incomplete');

  const detail = await getModerationSuggestion(context.suggestionClient, context.suggestionId);
  if (detail.status !== 'success') return failure(503, 'unavailable');
  const suggestion = detail.value;
  if (!suggestion) return failure(404, 'not_found');

  const duplicatePlaceId = String(form.get('duplicatePlaceId') ?? '').trim() || null;
  const parsedProposal = outcome === 'accepted' ? parseSuggestionFormData(form) : null;
  if (parsedProposal && !parsedProposal.ok) return failure(400, parsedProposal.error);

  const operatorIdentity = String(form.get('operatorIdentityPlaceId') ?? '').trim();
  const locationIdentity = String(form.get('locationIdentityPlaceId') ?? '').trim();
  const matches = parsedProposal?.ok
    ? await listSuggestionPlaceMatchesForPayload(context.suggestionClient, parsedProposal.proposal)
    : { status: 'success' as const, value: [] };
  if (matches.status !== 'success') return failure(503, 'unavailable');

  const matchIds = new Set(matches.value.map((match) => match.placeId));
  if (
    outcome === 'accepted' &&
    ((operatorIdentity !== 'new' && !matchIds.has(operatorIdentity)) ||
      (locationIdentity !== 'new' && !matchIds.has(locationIdentity)))
  ) {
    return failure(400, 'invalid');
  }

  const result = await resolveSuggestion(
    context.suggestionClient,
    {
      suggestionId: suggestion.suggestionId,
      outcome,
      memberReasonIs: reasonIs,
      memberReasonEn: reasonEn,
      privateNote: String(form.get('privateNote') ?? '').trim() || null,
      candidatePayload: parsedProposal?.ok ? parsedProposal.proposal : null,
      duplicatePlaceId: outcome === 'duplicate' ? duplicatePlaceId : null,
      operatorIdentityPlaceId:
        outcome === 'accepted' && operatorIdentity !== 'new' ? operatorIdentity : null,
      locationIdentityPlaceId:
        outcome === 'accepted' && locationIdentity !== 'new' ? locationIdentity : null,
      confirmUseful: false
    },
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);

  return { status: 'confirmed', effect: { kind: 'resolved', value: outcome } };
}

async function confirmUsefulSuggestion(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const result = await confirmSuggestionContribution(
    context.suggestionClient,
    context.suggestionId,
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);
  return { status: 'confirmed', effect: { kind: 'contribution', value: 'confirmed' } };
}

async function revokeSuggestionContribution(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const contributionId = String(form.get('contributionId') ?? '').trim();
  const reason = String(form.get('revokeReason') ?? '').trim();
  if (!contributionId || !reason) return failure(400, 'incomplete');

  const result = await revokeContribution(
    context.contributorClient,
    contributionId,
    reason,
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);
  return { status: 'confirmed', effect: { kind: 'contribution', value: 'revoked' } };
}

async function recordSuggestionConductFlag(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const memberId = String(form.get('memberId') ?? '').trim();
  const flagKind = String(form.get('flagKind') ?? '');
  const reason = String(form.get('flagReason') ?? '').trim();
  if (!memberId || !reason || !isConductFlagKind(flagKind)) return failure(400, 'incomplete');

  const result = await recordMemberConductFlag(
    context.contributorClient,
    memberId,
    flagKind,
    reason,
    null,
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);
  return { status: 'confirmed', effect: { kind: 'flag', value: 'recorded' } };
}

async function clearSuggestionConductFlag(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const flagId = String(form.get('flagId') ?? '').trim();
  const reason = String(form.get('clearReason') ?? '').trim();
  if (!flagId || !reason) return failure(400, 'incomplete');

  const result = await clearMemberConductFlag(
    context.contributorClient,
    flagId,
    reason,
    context.requestId
  );
  if (result.status !== 'success') return commandFailure(result.status);
  return { status: 'confirmed', effect: { kind: 'flag', value: 'cleared' } };
}

function isModerationOutcome(
  outcome: SuggestionOutcome
): outcome is Exclude<SuggestionOutcome, 'submitted'> {
  return (
    outcome === 'needs_information' ||
    outcome === 'accepted' ||
    outcome === 'duplicate' ||
    outcome === 'rejected'
  );
}

function isConductFlagKind(kind: string): kind is ConductFlagKind {
  return kind === 'fraud' || kind === 'abuse' || kind === 'policy_violation';
}

function commandFailure(status: SuggestionCommandFailureStatus): ModerationSuggestionActionResult {
  if (status === 'conflict') return failure(409, 'conflict');
  if (status === 'forbidden') return failure(403, 'forbidden');
  if (status === 'invalid') return failure(400, 'invalid');
  return failure(503, 'unavailable');
}

function failure(
  httpStatus: 400 | 403 | 404 | 409 | 503,
  error: ModerationSuggestionActionError
): ModerationSuggestionActionResult {
  return { status: 'failure', httpStatus, error };
}

const tierWeight: Record<ContributorTier, number> = {
  trusted_contributor: 0,
  contributor: 1,
  none: 2
};

// Trust can only reorder Suggestions inside the same queue rank and calendar-day bucket.
// This preserves database pagination and prevents a newer Suggestion from jumping ahead by days.
function applyBoundedTrustOrder(
  items: readonly ModerationSuggestionSummary[],
  tierByMember: ReadonlyMap<string, ContributorTier>
): ModerationSuggestionQueueItem[] {
  const dayBucket = (submittedAt: string) => submittedAt.slice(0, 10);
  return items
    .map((item) => ({ ...item, trustTier: tierByMember.get(item.memberId) ?? 'none' }))
    .sort((a, b) => {
      if (a.queueRank !== b.queueRank) return a.queueRank - b.queueRank;
      const dayCompare = dayBucket(a.submittedAt).localeCompare(dayBucket(b.submittedAt));
      if (dayCompare !== 0) return dayCompare;
      const tierCompare = tierWeight[a.trustTier] - tierWeight[b.trustTier];
      if (tierCompare !== 0) return tierCompare;
      return a.submittedAt.localeCompare(b.submittedAt);
    });
}
