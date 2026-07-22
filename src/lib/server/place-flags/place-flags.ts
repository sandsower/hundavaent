import type { VerificationStatus } from '$domain/access';
import type { EvidenceKind } from '$domain/evidence';
import type { Json } from '$server/db/generated.types';
import type {
  AccessConditionValue,
  CorrectionPayload,
  FlagEvidence,
  PlaceField,
  PlaceFieldValue,
  ReportPayload,
  ReportReason
} from './place-flag-input';

export type PlaceFlagKind = 'correction' | 'report';
export type PlaceFlagOutcome =
  | 'submitted'
  | 'needs_information'
  | 'applied'
  | 'confirmed_useful'
  | 'dispute_opened'
  | 'place_inactivated'
  | 'rejected';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface PlaceFlagRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export interface SubmittedPlaceFlag {
  flagId: string;
  outcome: PlaceFlagOutcome;
  submittedAt: string;
}

export interface MemberPlaceFlag {
  flagId: string;
  kind: PlaceFlagKind;
  outcome: PlaceFlagOutcome;
  placeNameIs: string;
  placeNameEn: string;
  targetKind: 'place_field' | 'access_condition';
  targetField: PlaceField | null;
  reportReason: ReportReason | null;
  memberReasonIs: string | null;
  memberReasonEn: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface PlaceFlagPage<T, TCursor> {
  items: T[];
  nextCursor: TCursor | null;
}

export interface MemberPlaceFlagCursor {
  submittedAt: string;
  flagId: string;
}

export interface ModerationPlaceFlagCursor extends MemberPlaceFlagCursor {
  priority: number;
}

export interface ModerationPlaceFlagSummary {
  flagId: string;
  memberId: string;
  kind: PlaceFlagKind;
  outcome: PlaceFlagOutcome;
  placeId: string;
  placeNameIs: string;
  placeNameEn: string;
  targetKind: 'place_field' | 'access_condition';
  targetField: PlaceField | null;
  accessConditionId: string | null;
  reportReason: ReportReason | null;
  isSafetyConcern: boolean;
  submittedAt: string;
  updatedAt: string;
  priority: number;
  itemVersion: number;
  draftVersion: number;
  draftUpdatedBy: string | null;
  draftUpdatedAt: string | null;
  readinessState: 'ready' | 'needs_attention';
}

export interface ModerationPlaceFlag {
  flagId: string;
  memberId: string;
  kind: PlaceFlagKind;
  outcome: PlaceFlagOutcome;
  placeId: string;
  placeNameIs: string;
  placeNameEn: string;
  targetKind: 'place_field' | 'access_condition';
  targetField: PlaceField | null;
  accessConditionId: string | null;
  currentValueSnapshot: PlaceFieldValue | AccessConditionValue;
  currentLiveValue: (PlaceFieldValue | AccessConditionValue) | null;
  currentPlaceVersion: number | null;
  currentVerificationId: string | null;
  currentVerificationStatus: VerificationStatus | null;
  currentVerificationVerifiedAt: string | null;
  currentVerificationFreshnessUntil: string | null;
  currentVerificationEvidence: ModerationEvidenceSource[] | null;
  proposedValue: (PlaceFieldValue | AccessConditionValue) | null;
  reportReason: ReportReason | null;
  isSafetyConcern: boolean;
  successorPlaceId: string | null;
  explanation: string;
  evidence: FlagEvidence;
  privateNote: string | null;
  appliedAccessConditionId: string | null;
  disputeId: string | null;
  transitionId: string | null;
  contributionId: string | null;
  submittedAt: string;
  updatedAt: string;
  itemVersion: number;
  draftVersion: number;
  draftPayload: PlaceFlagModerationDraftEnvelope | null;
  draftUpdatedBy: string | null;
  draftUpdatedAt: string | null;
}

export interface PlaceFlagModerationDraftEnvelope {
  application_payload?: Record<string, unknown> | null;
  dispute_command?: Record<string, unknown> | null;
  transition_command?: Record<string, unknown> | null;
}

export interface ModerationEvidenceSource {
  kind: EvidenceKind;
  sourceUrl: string | null;
  sourceCitation: string | null;
  sourceLabel: string;
  observedAt: string;
}

export interface RelatedPlaceFlag {
  flagId: string;
  kind: PlaceFlagKind;
  outcome: PlaceFlagOutcome;
  submittedAt: string;
}

export type PlaceFlagCommandResult<T> =
  | { status: 'success'; value: T }
  | {
      status:
        'policy_unavailable' | 'rate_limited' | 'forbidden' | 'invalid' | 'conflict' | 'resolved';
    }
  | { status: 'infrastructure_error' };

export async function submitCorrection(
  client: PlaceFlagRpcClient,
  payload: CorrectionPayload,
  requestId: string
): Promise<PlaceFlagCommandResult<SubmittedPlaceFlag>> {
  return submitFlag(
    client,
    'submit_place_correction',
    payload as unknown as Record<string, unknown>,
    requestId
  );
}

export async function submitReport(
  client: PlaceFlagRpcClient,
  payload: ReportPayload,
  requestId: string
): Promise<PlaceFlagCommandResult<SubmittedPlaceFlag>> {
  return submitFlag(
    client,
    'submit_place_report',
    payload as unknown as Record<string, unknown>,
    requestId
  );
}

async function submitFlag(
  client: PlaceFlagRpcClient,
  functionName: string,
  payload: Record<string, unknown>,
  requestId: string
): Promise<PlaceFlagCommandResult<SubmittedPlaceFlag>> {
  try {
    const { data, error } = await client.rpc(functionName, {
      command_payload: payload as unknown as Json,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isSubmissionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: { flagId: data[0].flag_id, outcome: data[0].status, submittedAt: data[0].submitted_at }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listMemberPlaceFlags(
  client: PlaceFlagRpcClient,
  cursor: MemberPlaceFlagCursor | null = null,
  limit = 20
): Promise<PlaceFlagCommandResult<PlaceFlagPage<MemberPlaceFlag, MemberPlaceFlagCursor>>> {
  try {
    const pageSize = boundedPageSize(limit);
    const { data, error } = await client.rpc('list_my_place_flags', {
      cursor_submitted_at: cursor?.submittedAt ?? null,
      cursor_flag_id: cursor?.flagId ?? null,
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
          flagId: row.flag_id,
          kind: row.kind,
          outcome: row.status,
          placeNameIs: row.place_name_is,
          placeNameEn: row.place_name_en,
          targetKind: row.target_kind,
          targetField: row.target_field,
          reportReason: row.report_reason,
          memberReasonIs: row.member_reason_is,
          memberReasonEn: row.member_reason_en,
          submittedAt: row.submitted_at,
          updatedAt: row.updated_at
        }),
        (row) => ({ submittedAt: row.submitted_at, flagId: row.flag_id })
      )
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listModerationPlaceFlags(
  client: PlaceFlagRpcClient,
  cursor: ModerationPlaceFlagCursor | null = null,
  limit = 20,
  filter: 'actionable' | 'deferred' | 'resolved' = 'actionable'
): Promise<
  PlaceFlagCommandResult<PlaceFlagPage<ModerationPlaceFlagSummary, ModerationPlaceFlagCursor>>
> {
  try {
    const pageSize = boundedPageSize(limit);
    const { data, error } = await client.rpc('list_moderation_place_flags', {
      requested_filter: filter,
      cursor_priority: cursor?.priority ?? null,
      cursor_submitted_at: cursor?.submittedAt ?? null,
      cursor_flag_id: cursor?.flagId ?? null,
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
          flagId: row.flag_id,
          memberId: row.member_id,
          kind: row.kind,
          outcome: row.status,
          placeId: row.place_id,
          placeNameIs: row.place_name_is,
          placeNameEn: row.place_name_en,
          targetKind: row.target_kind,
          targetField: row.target_field,
          accessConditionId: row.access_condition_id,
          reportReason: row.report_reason,
          isSafetyConcern: row.is_safety_concern,
          submittedAt: row.submitted_at,
          updatedAt: row.updated_at,
          priority: row.priority,
          itemVersion: row.item_version,
          draftVersion: row.draft_version,
          draftUpdatedBy: row.draft_updated_by,
          draftUpdatedAt: row.draft_updated_at,
          readinessState: row.readiness_state
        }),
        (row) => ({ priority: row.priority, submittedAt: row.submitted_at, flagId: row.flag_id })
      )
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getModerationPlaceFlag(
  client: PlaceFlagRpcClient,
  flagId: string
): Promise<PlaceFlagCommandResult<ModerationPlaceFlag | null>> {
  try {
    const { data, error } = await client.rpc('get_moderation_place_flag', {
      requested_flag_id: flagId
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
        flagId: row.flag_id,
        memberId: row.member_id,
        kind: row.kind,
        outcome: row.status,
        placeId: row.place_id,
        placeNameIs: row.place_name_is,
        placeNameEn: row.place_name_en,
        targetKind: row.target_kind,
        targetField: row.target_field,
        accessConditionId: row.access_condition_id,
        currentValueSnapshot: row.current_value_snapshot as unknown as
          PlaceFieldValue | AccessConditionValue,
        currentLiveValue: row.current_live_value as unknown as
          (PlaceFieldValue | AccessConditionValue) | null,
        currentPlaceVersion: row.current_place_version,
        currentVerificationId: row.current_verification_id,
        currentVerificationStatus: row.current_verification_status,
        currentVerificationVerifiedAt: row.current_verification_verified_at,
        currentVerificationFreshnessUntil: row.current_verification_freshness_until,
        currentVerificationEvidence: row.current_verification_evidence as unknown as
          ModerationEvidenceSource[] | null,
        proposedValue: row.proposed_value as unknown as
          (PlaceFieldValue | AccessConditionValue) | null,
        reportReason: row.report_reason,
        isSafetyConcern: row.is_safety_concern,
        successorPlaceId: row.successor_place_id,
        explanation: row.explanation,
        evidence: row.evidence as unknown as FlagEvidence,
        privateNote: row.private_note,
        appliedAccessConditionId: row.applied_access_condition_id,
        disputeId: row.dispute_id,
        transitionId: row.transition_id,
        contributionId: row.contribution_id,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
        itemVersion: row.item_version,
        draftVersion: row.draft_version,
        draftPayload: row.draft_payload as PlaceFlagModerationDraftEnvelope | null,
        draftUpdatedBy: row.draft_updated_by,
        draftUpdatedAt: row.draft_updated_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listRelatedPlaceFlags(
  client: PlaceFlagRpcClient,
  flagId: string
): Promise<PlaceFlagCommandResult<RelatedPlaceFlag[]>> {
  try {
    const { data, error } = await client.rpc('list_related_place_flags', {
      requested_flag_id: flagId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isRelatedRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        flagId: row.flag_id,
        kind: row.kind,
        outcome: row.status,
        submittedAt: row.submitted_at
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export interface ResolvePlaceFlagCommand {
  flagId: string;
  outcome: Exclude<PlaceFlagOutcome, 'submitted'>;
  expectedItemVersion: number;
  expectedDraftVersion: number;
  memberReasonIs: string | null;
  memberReasonEn: string | null;
  privateNote: string | null;
}

export async function resolvePlaceFlag(
  client: PlaceFlagRpcClient,
  command: ResolvePlaceFlagCommand,
  requestId: string
): Promise<
  PlaceFlagCommandResult<{
    appliedAccessConditionId: string | null;
    disputeId: string | null;
    transitionId: string | null;
  }>
> {
  try {
    const { data, error } = await client.rpc('resolve_place_flag', {
      requested_flag_id: command.flagId,
      requested_outcome: command.outcome,
      expected_item_version: command.expectedItemVersion,
      expected_draft_version: command.expectedDraftVersion,
      member_reason_is: command.memberReasonIs,
      member_reason_en: command.memberReasonEn,
      private_note: command.privateNote,
      application_payload: null,
      dispute_command: null,
      transition_command: null,
      command_request_id: requestId
    });
    if (error) return { status: mapResolutionError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isResolutionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: {
        appliedAccessConditionId: data[0].applied_access_condition_id,
        disputeId: data[0].dispute_id,
        transitionId: data[0].transition_id
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function confirmPlaceFlagContribution(
  client: PlaceFlagRpcClient,
  flagId: string,
  requestId: string
): Promise<PlaceFlagCommandResult<{ contributionId: string; confirmedAt: string }>> {
  try {
    const { data, error } = await client.rpc('confirm_place_flag_contribution', {
      requested_flag_id: flagId,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isContributionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: { contributionId: data[0].contribution_id, confirmedAt: data[0].confirmed_at }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<PlaceFlagCommandResult<never>['status'], 'success'> {
  if (code === '55000') return 'policy_unavailable';
  if (code === '55006' || code === '23505' || code === '40001') return 'conflict';
  if (code === '54000') return 'rate_limited';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function mapResolutionError(
  code: string | undefined
): Exclude<PlaceFlagCommandResult<never>['status'], 'success'> {
  return code === '55006' ? 'resolved' : mapError(code);
}

function isOutcome(value: unknown): value is PlaceFlagOutcome {
  return (
    value === 'submitted' ||
    value === 'needs_information' ||
    value === 'applied' ||
    value === 'confirmed_useful' ||
    value === 'dispute_opened' ||
    value === 'place_inactivated' ||
    value === 'rejected'
  );
}

function isKind(value: unknown): value is PlaceFlagKind {
  return value === 'correction' || value === 'report';
}

function isTargetKind(value: unknown): value is 'place_field' | 'access_condition' {
  return value === 'place_field' || value === 'access_condition';
}

function isPlaceFieldOrNull(value: unknown): value is PlaceField | null {
  return (
    value === null ||
    value === 'name' ||
    value === 'description' ||
    value === 'website_url' ||
    value === 'phone' ||
    value === 'opening_hours' ||
    value === 'dog_amenities'
  );
}

function isReportReasonOrNull(value: unknown): value is ReportReason | null {
  return (
    value === null ||
    value === 'inaccurate' ||
    value === 'unsafe' ||
    value === 'misleading' ||
    value === 'obsolete' ||
    value === 'closed' ||
    value === 'moved' ||
    value === 'successor_place'
  );
}

function isVerificationStatusOrNull(value: unknown): value is VerificationStatus | null {
  return (
    value === null || value === 'verified' || value === 'reconfirmation_due' || value === 'disputed'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isSubmissionRow(
  value: unknown
): value is { flag_id: string; status: PlaceFlagOutcome; submitted_at: string } {
  return (
    isRecord(value) &&
    typeof value.flag_id === 'string' &&
    isOutcome(value.status) &&
    typeof value.submitted_at === 'string'
  );
}

function isMemberRow(value: unknown): value is Record<string, unknown> & {
  flag_id: string;
  kind: PlaceFlagKind;
  status: PlaceFlagOutcome;
  place_name_is: string;
  place_name_en: string;
  target_kind: 'place_field' | 'access_condition';
  target_field: PlaceField | null;
  report_reason: ReportReason | null;
  member_reason_is: string | null;
  member_reason_en: string | null;
  submitted_at: string;
  updated_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.flag_id === 'string' &&
    isKind(value.kind) &&
    isOutcome(value.status) &&
    typeof value.place_name_is === 'string' &&
    typeof value.place_name_en === 'string' &&
    isTargetKind(value.target_kind) &&
    isPlaceFieldOrNull(value.target_field) &&
    isReportReasonOrNull(value.report_reason) &&
    isStringOrNull(value.member_reason_is) &&
    isStringOrNull(value.member_reason_en) &&
    typeof value.submitted_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

function isModerationRow(value: unknown): value is Record<string, unknown> & {
  flag_id: string;
  member_id: string;
  kind: PlaceFlagKind;
  status: PlaceFlagOutcome;
  place_id: string;
  place_name_is: string;
  place_name_en: string;
  target_kind: 'place_field' | 'access_condition';
  target_field: PlaceField | null;
  access_condition_id: string | null;
  report_reason: ReportReason | null;
  is_safety_concern: boolean;
  submitted_at: string;
  updated_at: string;
  priority: number;
  item_version: number;
  draft_version: number;
  draft_updated_by: string | null;
  draft_updated_at: string | null;
  readiness_state: 'ready' | 'needs_attention';
} {
  return (
    isRecord(value) &&
    typeof value.flag_id === 'string' &&
    typeof value.member_id === 'string' &&
    isKind(value.kind) &&
    isOutcome(value.status) &&
    typeof value.place_id === 'string' &&
    typeof value.place_name_is === 'string' &&
    typeof value.place_name_en === 'string' &&
    isTargetKind(value.target_kind) &&
    isPlaceFieldOrNull(value.target_field) &&
    isStringOrNull(value.access_condition_id) &&
    isReportReasonOrNull(value.report_reason) &&
    typeof value.is_safety_concern === 'boolean' &&
    typeof value.submitted_at === 'string' &&
    typeof value.updated_at === 'string' &&
    Number.isInteger(value.priority) &&
    Number.isInteger(value.item_version) &&
    Number.isInteger(value.draft_version) &&
    isStringOrNull(value.draft_updated_by) &&
    isStringOrNull(value.draft_updated_at) &&
    (value.readiness_state === 'ready' || value.readiness_state === 'needs_attention')
  );
}

function isModerationDetailRow(value: unknown): value is Record<string, unknown> & {
  flag_id: string;
  member_id: string;
  kind: PlaceFlagKind;
  status: PlaceFlagOutcome;
  place_id: string;
  place_name_is: string;
  place_name_en: string;
  target_kind: 'place_field' | 'access_condition';
  target_field: PlaceField | null;
  access_condition_id: string | null;
  current_value_snapshot: Record<string, unknown>;
  current_live_value: Record<string, unknown> | null;
  current_place_version: number | null;
  current_verification_id: string | null;
  current_verification_status: VerificationStatus | null;
  current_verification_verified_at: string | null;
  current_verification_freshness_until: string | null;
  current_verification_evidence: Record<string, unknown>[] | null;
  proposed_value: Record<string, unknown> | null;
  report_reason: ReportReason | null;
  is_safety_concern: boolean;
  successor_place_id: string | null;
  explanation: string;
  evidence: Record<string, unknown>;
  private_note: string | null;
  applied_access_condition_id: string | null;
  dispute_id: string | null;
  transition_id: string | null;
  contribution_id: string | null;
  submitted_at: string;
  updated_at: string;
  item_version: number;
  draft_version: number;
  draft_payload: Record<string, unknown> | null;
  draft_updated_by: string | null;
  draft_updated_at: string | null;
} {
  return (
    isRecord(value) &&
    typeof value.flag_id === 'string' &&
    typeof value.member_id === 'string' &&
    isKind(value.kind) &&
    isOutcome(value.status) &&
    typeof value.place_id === 'string' &&
    typeof value.place_name_is === 'string' &&
    typeof value.place_name_en === 'string' &&
    isTargetKind(value.target_kind) &&
    isPlaceFieldOrNull(value.target_field) &&
    isStringOrNull(value.access_condition_id) &&
    isRecord(value.current_value_snapshot) &&
    (value.current_live_value === null || isRecord(value.current_live_value)) &&
    (value.current_place_version === null || Number.isInteger(value.current_place_version)) &&
    isStringOrNull(value.current_verification_id) &&
    isVerificationStatusOrNull(value.current_verification_status) &&
    isStringOrNull(value.current_verification_verified_at) &&
    isStringOrNull(value.current_verification_freshness_until) &&
    (value.current_verification_evidence === null ||
      (Array.isArray(value.current_verification_evidence) &&
        value.current_verification_evidence.every(isRecord))) &&
    (value.proposed_value === null || isRecord(value.proposed_value)) &&
    isReportReasonOrNull(value.report_reason) &&
    typeof value.is_safety_concern === 'boolean' &&
    isStringOrNull(value.successor_place_id) &&
    typeof value.explanation === 'string' &&
    isRecord(value.evidence) &&
    isStringOrNull(value.private_note) &&
    isStringOrNull(value.applied_access_condition_id) &&
    isStringOrNull(value.dispute_id) &&
    isStringOrNull(value.transition_id) &&
    isStringOrNull(value.contribution_id) &&
    typeof value.submitted_at === 'string' &&
    typeof value.updated_at === 'string' &&
    Number.isInteger(value.item_version) &&
    Number.isInteger(value.draft_version) &&
    (value.draft_payload === null || isRecord(value.draft_payload)) &&
    isStringOrNull(value.draft_updated_by) &&
    isStringOrNull(value.draft_updated_at)
  );
}

function isRelatedRow(value: unknown): value is {
  flag_id: string;
  kind: PlaceFlagKind;
  status: PlaceFlagOutcome;
  submitted_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.flag_id === 'string' &&
    isKind(value.kind) &&
    isOutcome(value.status) &&
    typeof value.submitted_at === 'string'
  );
}

function isResolutionRow(value: unknown): value is {
  applied_access_condition_id: string | null;
  dispute_id: string | null;
  transition_id: string | null;
} {
  return (
    isRecord(value) &&
    isStringOrNull(value.applied_access_condition_id) &&
    isStringOrNull(value.dispute_id) &&
    isStringOrNull(value.transition_id)
  );
}

function isContributionRow(
  value: unknown
): value is { contribution_id: string; confirmed_at: string } {
  return (
    isRecord(value) &&
    typeof value.contribution_id === 'string' &&
    typeof value.confirmed_at === 'string'
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
): PlaceFlagPage<TItem, TCursor> {
  return {
    items: rows.slice(0, pageSize).map(mapItem),
    nextCursor: rows.length > pageSize ? mapCursor(rows[pageSize - 1]) : null
  };
}
