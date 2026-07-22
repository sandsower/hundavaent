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
import type { SuggestionInputError } from '$server/suggestions/suggestion-input';
import { saveSuggestionModerationDraft } from '$server/moderation/moderation-drafts';
import {
  parseSuggestionDraftSection,
  type SuggestionDraftSectionId
} from '$server/moderation/suggestion-draft-input';

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
  readonly mapStyleUrl: string | null;
}

export type ModerationSuggestionActionName =
  | 'saveSuggestionSection'
  | 'decideSuggestion'
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
  | 'resolved'
  | 'forbidden'
  | 'unavailable';

export interface ModerationSuggestionActionContext {
  readonly suggestionClient: SuggestionRpcClient;
  readonly contributorClient: ContributorRpcClient;
  readonly suggestionId: string;
  readonly requestId: string;
  readonly formData: FormData | null;
}

export type ModerationSuggestionConfirmedEffect =
  | {
      readonly kind: 'resolved';
      readonly value: Exclude<SuggestionOutcome, 'submitted'>;
    }
  | { readonly kind: 'contribution'; readonly value: 'confirmed' | 'revoked' }
  | { readonly kind: 'flag'; readonly value: 'recorded' | 'cleared' }
  | {
      readonly kind: 'draft_saved';
      readonly sectionId: SuggestionDraftSectionId;
      readonly draftVersion: number;
    };

export type ModerationSuggestionActionResult =
  | {
      readonly status: 'confirmed';
      readonly terminal: boolean;
      readonly effect: ModerationSuggestionConfirmedEffect;
    }
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
  const detail = await getModerationSuggestion(suggestionClient, suggestionId);
  if (detail.status !== 'success') return { status: detail.status };

  const suggestion = detail.value;
  if (!suggestion) return { status: 'not_found' };
  const matches = await listSuggestionPlaceMatchesForPayload(
    suggestionClient,
    suggestion.effectiveProposal
  );
  if (matches.status !== 'success') return { status: matches.status };

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
      conductFlagCleared: searchParams.get('flag') === 'cleared',
      mapStyleUrl: env.PUBLIC_MAP_STYLE_URL?.trim() || null
    }
  };
}

export async function executeModerationSuggestionAction(
  action: ModerationSuggestionActionName,
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  switch (action) {
    case 'saveSuggestionSection':
      return saveSuggestionSection(context);
    case 'decideSuggestion':
      return decideSuggestion(context);
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

async function saveSuggestionSection(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const versions = readVersions(form);
  const sectionId = String(form.get('sectionId') ?? '').trim();
  const parsed = parseSuggestionDraftSection(sectionId, form);
  if (!versions || !parsed.ok) return failure(400, parsed.ok ? 'invalid' : parsed.error);
  const result = await saveSuggestionModerationDraft(context.suggestionClient, {
    suggestionId: context.suggestionId,
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

async function decideSuggestion(
  context: ModerationSuggestionActionContext
): Promise<ModerationSuggestionActionResult> {
  const form = context.formData ?? new FormData();
  const outcome = String(form.get('outcome') ?? '') as SuggestionOutcome;
  if (!isModerationOutcome(outcome)) return failure(400, 'invalid');
  const versions = readVersions(form);
  const reasons = readPairedReasons(form, outcome !== 'accepted');
  if (!versions || !reasons) return failure(400, 'incomplete');

  const duplicatePlaceId = String(form.get('duplicatePlaceId') ?? '').trim() || null;
  const operatorIdentity = String(form.get('operatorIdentityPlaceId') ?? '').trim();
  const locationIdentity = String(form.get('locationIdentityPlaceId') ?? '').trim();
  if (outcome === 'duplicate' && !isUuid(duplicatePlaceId)) return failure(400, 'incomplete');
  if (outcome === 'accepted' && (!isNewOrUuid(operatorIdentity) || !isNewOrUuid(locationIdentity)))
    return failure(400, 'invalid');

  const result = await resolveSuggestion(
    context.suggestionClient,
    {
      suggestionId: context.suggestionId,
      outcome,
      expectedItemVersion: versions.expectedItemVersion,
      expectedDraftVersion: versions.expectedDraftVersion,
      memberReasonIs: reasons.is,
      memberReasonEn: reasons.en,
      privateNote: String(form.get('privateNote') ?? '').trim() || null,
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

  return { status: 'confirmed', terminal: true, effect: { kind: 'resolved', value: outcome } };
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
  return {
    status: 'confirmed',
    terminal: false,
    effect: { kind: 'contribution', value: 'confirmed' }
  };
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
  return {
    status: 'confirmed',
    terminal: false,
    effect: { kind: 'contribution', value: 'revoked' }
  };
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
  return { status: 'confirmed', terminal: false, effect: { kind: 'flag', value: 'recorded' } };
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
  return { status: 'confirmed', terminal: false, effect: { kind: 'flag', value: 'cleared' } };
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

function isNewOrUuid(value: string): boolean {
  return value === 'new' || isUuid(value);
}
function isUuid(value: string | null): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
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
import { env } from '$env/dynamic/public';
