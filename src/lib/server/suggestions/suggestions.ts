import type { Json } from '$server/db/generated.types';
import type { WeeklyRhythmRecognition } from '$lib/member-activity/types';
import { mapWeeklyRhythmRecognition } from '$server/member-activity/weekly-rhythm';
import type { SuggestionProposal } from './suggestion-input';

export type SuggestionOutcome =
  'submitted' | 'needs_information' | 'accepted' | 'duplicate' | 'rejected';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface SuggestionRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export interface SubmittedSuggestion {
  suggestionId: string;
  outcome: SuggestionOutcome;
  submittedAt: string;
  recognition: WeeklyRhythmRecognition;
}

export interface MemberSuggestion {
  suggestionId: string;
  outcome: SuggestionOutcome;
  nameIs: string;
  nameEn: string;
  category: SuggestionProposal['category'];
  locality: string;
  memberReasonIs: string | null;
  memberReasonEn: string | null;
  candidatePlaceId: string | null;
  duplicatePlaceId: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface SuggestionPage<T, TCursor> {
  items: T[];
  nextCursor: TCursor | null;
}

export interface MemberSuggestionCursor {
  submittedAt: string;
  suggestionId: string;
}

export interface ModerationSuggestionCursor extends MemberSuggestionCursor {
  queueRank: number;
}

export interface ModerationSuggestionSummary {
  suggestionId: string;
  memberId: string;
  outcome: SuggestionOutcome;
  operatorName: string;
  nameIs: string;
  nameEn: string;
  category: SuggestionProposal['category'];
  addressLine: string;
  locality: string;
  submittedAt: string;
  updatedAt: string;
  queueRank: number;
  itemVersion: number;
  draftVersion: number;
  draftUpdatedBy: string | null;
  draftUpdatedAt: string | null;
  readinessState: 'ready' | 'blocked';
}

export interface ModerationSuggestion {
  suggestionId: string;
  memberId: string;
  outcome: SuggestionOutcome;
  operatorName: string;
  nameIs: string;
  nameEn: string;
  category: SuggestionProposal['category'];
  addressLine: string;
  locality: string;
  submittedAt: string;
  updatedAt: string;
  proposal: SuggestionProposal;
  reviewedProposal: SuggestionProposal | null;
  draftProposal: SuggestionProposal | null;
  effectiveProposal: SuggestionProposal;
  itemVersion: number;
  draftVersion: number;
  draftUpdatedBy: string | null;
  draftUpdatedAt: string | null;
  privateNote: string | null;
  contributionId: string | null;
  operatorIdentityPlaceId: string | null;
  locationIdentityPlaceId: string | null;
}

export interface SuggestionPlaceMatch {
  placeId: string;
  lifecycle: 'candidate' | 'verified' | 'published' | 'inactive';
  operatorName: string;
  nameIs: string | null;
  nameEn: string | null;
  addressLine: string;
  locality: string;
  sameOperator: boolean;
  exactLocation: boolean;
}

export type SuggestionCommandResult<T> =
  | { status: 'success'; value: T }
  | {
      status:
        'policy_unavailable' | 'rate_limited' | 'forbidden' | 'invalid' | 'conflict' | 'resolved';
    }
  | { status: 'infrastructure_error' };

export async function submitSuggestion(
  client: SuggestionRpcClient,
  proposal: SuggestionProposal,
  requestId: string
): Promise<SuggestionCommandResult<SubmittedSuggestion>> {
  try {
    const { data, error } = await client.rpc('submit_place_suggestion', {
      command_proposal: proposal as unknown as Json,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isSubmissionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const recognition = mapWeeklyRhythmRecognition(data[0], 'suggestion');
    if (!recognition) return { status: 'infrastructure_error' };
    return {
      status: 'success',
      value: {
        suggestionId: data[0].suggestion_id,
        outcome: data[0].status,
        submittedAt: data[0].submitted_at,
        recognition
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listMemberSuggestions(
  client: SuggestionRpcClient,
  cursor: MemberSuggestionCursor | null = null,
  limit = 20
): Promise<SuggestionCommandResult<SuggestionPage<MemberSuggestion, MemberSuggestionCursor>>> {
  try {
    const pageSize = boundedPageSize(limit);
    const { data, error } = await client.rpc('list_my_place_suggestions', {
      cursor_submitted_at: cursor?.submittedAt ?? null,
      cursor_suggestion_id: cursor?.suggestionId ?? null,
      requested_limit: pageSize + 1
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isMemberRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: pageFromRows(
        data,
        pageSize,
        (row) => ({
          suggestionId: row.suggestion_id,
          outcome: row.status,
          nameIs: row.name_is,
          nameEn: row.name_en,
          category: row.category,
          locality: row.locality,
          memberReasonIs: row.member_reason_is,
          memberReasonEn: row.member_reason_en,
          candidatePlaceId: row.candidate_place_id,
          duplicatePlaceId: row.duplicate_place_id,
          submittedAt: row.submitted_at,
          updatedAt: row.updated_at
        }),
        (row) => ({ submittedAt: row.submitted_at, suggestionId: row.suggestion_id })
      )
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listModerationSuggestions(
  client: SuggestionRpcClient,
  cursor: ModerationSuggestionCursor | null = null,
  limit = 20,
  filter: 'actionable' | 'deferred' | 'resolved' = 'actionable'
): Promise<
  SuggestionCommandResult<SuggestionPage<ModerationSuggestionSummary, ModerationSuggestionCursor>>
> {
  try {
    const pageSize = boundedPageSize(limit);
    const { data, error } = await client.rpc('list_moderation_place_suggestions', {
      requested_filter: filter,
      cursor_queue_rank: cursor?.queueRank ?? null,
      cursor_submitted_at: cursor?.submittedAt ?? null,
      cursor_suggestion_id: cursor?.suggestionId ?? null,
      requested_limit: pageSize + 1
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isModerationRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: pageFromRows(
        data,
        pageSize,
        (row) => ({
          suggestionId: row.suggestion_id,
          memberId: row.member_id,
          outcome: row.status,
          operatorName: row.operator_name,
          nameIs: row.name_is,
          nameEn: row.name_en,
          category: row.category,
          addressLine: row.address_line,
          locality: row.locality,
          submittedAt: row.submitted_at,
          updatedAt: row.updated_at,
          queueRank: row.queue_rank,
          itemVersion: row.item_version,
          draftVersion: row.draft_version,
          draftUpdatedBy: row.draft_updated_by,
          draftUpdatedAt: row.draft_updated_at,
          readinessState: row.readiness_state
        }),
        (row) => ({
          queueRank: row.queue_rank,
          submittedAt: row.submitted_at,
          suggestionId: row.suggestion_id
        })
      )
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getModerationSuggestion(
  client: SuggestionRpcClient,
  suggestionId: string
): Promise<SuggestionCommandResult<ModerationSuggestion | null>> {
  try {
    const { data, error } = await client.rpc('get_moderation_place_suggestion', {
      requested_suggestion_id: suggestionId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length > 1 || !data.every(isModerationDetailRow)) {
      return { status: 'infrastructure_error' };
    }
    if (data.length === 0) return { status: 'success', value: null };
    const row = data[0];
    return {
      status: 'success',
      value: {
        suggestionId: row.suggestion_id,
        memberId: row.member_id,
        outcome: row.status,
        operatorName: row.operator_name,
        nameIs: row.name_is,
        nameEn: row.name_en,
        category: row.category,
        addressLine: row.address_line,
        locality: row.locality,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
        proposal: row.proposal as unknown as SuggestionProposal,
        reviewedProposal: row.reviewed_proposal as unknown as SuggestionProposal | null,
        draftProposal: row.draft_payload as unknown as SuggestionProposal | null,
        effectiveProposal: (row.reviewed_proposal ??
          row.draft_payload ??
          row.proposal) as unknown as SuggestionProposal,
        itemVersion: row.item_version,
        draftVersion: row.draft_version,
        draftUpdatedBy: row.draft_updated_by,
        draftUpdatedAt: row.draft_updated_at,
        privateNote: row.private_note,
        contributionId: row.contribution_id,
        operatorIdentityPlaceId: row.operator_identity_place_id,
        locationIdentityPlaceId: row.location_identity_place_id
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listSuggestionPlaceMatches(
  client: SuggestionRpcClient,
  suggestionId: string
): Promise<SuggestionCommandResult<SuggestionPlaceMatch[]>> {
  try {
    const { data, error } = await client.rpc('list_suggestion_place_matches', {
      requested_suggestion_id: suggestionId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isMatchRow)) {
      return { status: 'infrastructure_error' };
    }
    return { status: 'success', value: data.map(mapMatchRow) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listSuggestionPlaceMatchesForPayload(
  client: SuggestionRpcClient,
  proposal: SuggestionProposal
): Promise<SuggestionCommandResult<SuggestionPlaceMatch[]>> {
  try {
    const { data, error } = await client.rpc('list_suggestion_place_matches_for_payload', {
      requested_proposal: proposal as unknown as Json
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isMatchRow)) {
      return { status: 'infrastructure_error' };
    }
    return { status: 'success', value: data.map(mapMatchRow) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function resolveSuggestion(
  client: SuggestionRpcClient,
  command: {
    suggestionId: string;
    outcome: Exclude<SuggestionOutcome, 'submitted'>;
    expectedItemVersion: number;
    expectedDraftVersion: number;
    memberReasonIs: string | null;
    memberReasonEn: string | null;
    privateNote: string | null;
    duplicatePlaceId: string | null;
    operatorIdentityPlaceId: string | null;
    locationIdentityPlaceId: string | null;
    confirmUseful: boolean;
  },
  requestId: string
): Promise<SuggestionCommandResult<{ candidatePlaceId: string | null }>> {
  try {
    const { data, error } = await client.rpc('resolve_place_suggestion', {
      requested_suggestion_id: command.suggestionId,
      requested_outcome: command.outcome,
      expected_item_version: command.expectedItemVersion,
      expected_draft_version: command.expectedDraftVersion,
      member_reason_is: command.memberReasonIs,
      member_reason_en: command.memberReasonEn,
      private_note: command.privateNote,
      moderator_candidate_payload: null,
      requested_duplicate_place_id: command.duplicatePlaceId,
      requested_operator_identity_place_id: command.operatorIdentityPlaceId,
      requested_location_identity_place_id: command.locationIdentityPlaceId,
      confirm_useful: command.confirmUseful,
      command_request_id: requestId
    });
    if (error) return { status: mapResolutionError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isResolutionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    return { status: 'success', value: { candidatePlaceId: data[0].candidate_place_id } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function confirmSuggestionContribution(
  client: SuggestionRpcClient,
  suggestionId: string,
  requestId: string
): Promise<SuggestionCommandResult<{ contributionId: string; confirmedAt: string }>> {
  try {
    const { data, error } = await client.rpc('confirm_suggestion_contribution', {
      requested_suggestion_id: suggestionId,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isContributionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: {
        contributionId: data[0].contribution_id,
        confirmedAt: data[0].confirmed_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<SuggestionCommandResult<never>['status'], 'success'> {
  if (code === '55000') return 'policy_unavailable';
  if (code === '55006' || code === '23505' || code === '40001') return 'conflict';
  if (code === '54000') return 'rate_limited';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function mapResolutionError(
  code: string | undefined
): Exclude<SuggestionCommandResult<never>['status'], 'success'> {
  return code === '55006' ? 'resolved' : mapError(code);
}

function isOutcome(value: unknown): value is SuggestionOutcome {
  return (
    value === 'submitted' ||
    value === 'needs_information' ||
    value === 'accepted' ||
    value === 'duplicate' ||
    value === 'rejected'
  );
}

function isSuggestionCategory(value: unknown): value is SuggestionProposal['category'] {
  return (
    value === 'restaurant' ||
    value === 'cafe' ||
    value === 'bar' ||
    value === 'shop' ||
    value === 'shopping_centre' ||
    value === 'accommodation' ||
    value === 'park' ||
    value === 'recreation' ||
    value === 'culture' ||
    value === 'service' ||
    value === 'other'
  );
}

function isPlaceLifecycle(value: unknown): value is SuggestionPlaceMatch['lifecycle'] {
  return (
    value === 'candidate' || value === 'verified' || value === 'published' || value === 'inactive'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isSubmissionRow(value: unknown): value is {
  suggestion_id: string;
  status: SuggestionOutcome;
  submitted_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.suggestion_id === 'string' &&
    isOutcome(value.status) &&
    typeof value.submitted_at === 'string' &&
    typeof value.qualifying_action_recorded === 'boolean'
  );
}

function isMemberRow(value: unknown): value is Record<string, unknown> & {
  suggestion_id: string;
  status: SuggestionOutcome;
  name_is: string;
  name_en: string;
  category: SuggestionProposal['category'];
  locality: string;
  member_reason_is: string | null;
  member_reason_en: string | null;
  candidate_place_id: string | null;
  duplicate_place_id: string | null;
  submitted_at: string;
  updated_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.suggestion_id === 'string' &&
    isOutcome(value.status) &&
    typeof value.name_is === 'string' &&
    typeof value.name_en === 'string' &&
    isSuggestionCategory(value.category) &&
    typeof value.locality === 'string' &&
    isStringOrNull(value.member_reason_is) &&
    isStringOrNull(value.member_reason_en) &&
    isStringOrNull(value.candidate_place_id) &&
    isStringOrNull(value.duplicate_place_id) &&
    typeof value.submitted_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

function isModerationRow(value: unknown): value is Record<string, unknown> & {
  suggestion_id: string;
  member_id: string;
  status: SuggestionOutcome;
  operator_name: string;
  name_is: string;
  name_en: string;
  category: SuggestionProposal['category'];
  address_line: string;
  locality: string;
  submitted_at: string;
  updated_at: string;
  queue_rank: number;
  item_version: number;
  draft_version: number;
  draft_updated_by: string | null;
  draft_updated_at: string | null;
  readiness_state: 'ready' | 'blocked';
} {
  return (
    isRecord(value) &&
    typeof value.suggestion_id === 'string' &&
    typeof value.member_id === 'string' &&
    isOutcome(value.status) &&
    typeof value.operator_name === 'string' &&
    typeof value.name_is === 'string' &&
    typeof value.name_en === 'string' &&
    isSuggestionCategory(value.category) &&
    typeof value.address_line === 'string' &&
    typeof value.locality === 'string' &&
    typeof value.submitted_at === 'string' &&
    typeof value.updated_at === 'string' &&
    Number.isInteger(value.queue_rank) &&
    Number.isInteger(value.item_version) &&
    Number.isInteger(value.draft_version) &&
    isStringOrNull(value.draft_updated_by) &&
    isStringOrNull(value.draft_updated_at) &&
    (value.readiness_state === 'ready' || value.readiness_state === 'blocked')
  );
}

function isModerationDetailRow(value: unknown): value is Record<string, unknown> & {
  suggestion_id: string;
  member_id: string;
  status: SuggestionOutcome;
  operator_name: string;
  name_is: string;
  name_en: string;
  category: SuggestionProposal['category'];
  address_line: string;
  locality: string;
  submitted_at: string;
  updated_at: string;
  proposal: Record<string, unknown>;
  reviewed_proposal: Record<string, unknown> | null;
  private_note: string | null;
  contribution_id: string | null;
  operator_identity_place_id: string | null;
  location_identity_place_id: string | null;
  item_version: number;
  draft_version: number;
  draft_payload: Record<string, unknown> | null;
  draft_updated_by: string | null;
  draft_updated_at: string | null;
} {
  return (
    isRecord(value) &&
    typeof value.suggestion_id === 'string' &&
    typeof value.member_id === 'string' &&
    isOutcome(value.status) &&
    typeof value.operator_name === 'string' &&
    typeof value.name_is === 'string' &&
    typeof value.name_en === 'string' &&
    isSuggestionCategory(value.category) &&
    typeof value.address_line === 'string' &&
    typeof value.locality === 'string' &&
    typeof value.submitted_at === 'string' &&
    typeof value.updated_at === 'string' &&
    isRecord(value.proposal) &&
    (value.reviewed_proposal === null || isRecord(value.reviewed_proposal)) &&
    isStringOrNull(value.private_note) &&
    isStringOrNull(value.contribution_id) &&
    isStringOrNull(value.operator_identity_place_id) &&
    isStringOrNull(value.location_identity_place_id) &&
    Number.isInteger(value.item_version) &&
    Number.isInteger(value.draft_version) &&
    (value.draft_payload === null || isRecord(value.draft_payload)) &&
    isStringOrNull(value.draft_updated_by) &&
    isStringOrNull(value.draft_updated_at)
  );
}

function boundedPageSize(value: number): number {
  return Math.min(Math.max(Math.trunc(value) || 20, 1), 50);
}

function pageFromRows<TRow, TItem, TCursor>(
  rows: TRow[],
  pageSize: number,
  mapItem: (row: TRow) => TItem,
  mapCursor: (row: TRow) => TCursor
): SuggestionPage<TItem, TCursor> {
  return {
    items: rows.slice(0, pageSize).map(mapItem),
    nextCursor: rows.length > pageSize ? mapCursor(rows[pageSize - 1]) : null
  };
}

type SuggestionMatchRow = Record<string, unknown> & {
  place_id: string;
  lifecycle: SuggestionPlaceMatch['lifecycle'];
  operator_name: string;
  name_is: string | null;
  name_en: string | null;
  address_line: string;
  locality: string;
  same_operator: boolean;
  exact_location: boolean;
};

function isMatchRow(value: unknown): value is SuggestionMatchRow {
  return (
    isRecord(value) &&
    typeof value.place_id === 'string' &&
    isPlaceLifecycle(value.lifecycle) &&
    typeof value.operator_name === 'string' &&
    isStringOrNull(value.name_is) &&
    isStringOrNull(value.name_en) &&
    typeof value.address_line === 'string' &&
    typeof value.locality === 'string' &&
    typeof value.same_operator === 'boolean' &&
    typeof value.exact_location === 'boolean'
  );
}

function mapMatchRow(row: SuggestionMatchRow): SuggestionPlaceMatch {
  return {
    placeId: row.place_id,
    lifecycle: row.lifecycle,
    operatorName: row.operator_name,
    nameIs: row.name_is,
    nameEn: row.name_en,
    addressLine: row.address_line,
    locality: row.locality,
    sameOperator: row.same_operator,
    exactLocation: row.exact_location
  };
}

function isContributionRow(value: unknown): value is {
  contribution_id: string;
  confirmed_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.contribution_id === 'string' &&
    typeof value.confirmed_at === 'string'
  );
}

function isResolutionRow(value: unknown): value is { candidate_place_id: string | null } {
  return isRecord(value) && isStringOrNull(value.candidate_place_id);
}
