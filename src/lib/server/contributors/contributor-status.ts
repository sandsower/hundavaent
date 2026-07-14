export type ContributorTier = 'none' | 'contributor' | 'trusted_contributor';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface ContributorRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

// Deliberately excludes any count, ratio, or "N more needed" figure - the Member view must never
// create a volume incentive or a basis for cross-Member comparison.
export interface MyContributorStatus {
  status: ContributorTier;
  policyVersion: string | null;
  statusSince: string | null;
}

export interface ModerationContributorStatus {
  status: ContributorTier;
  policyVersion: string | null;
  netAcceptedTotal: number;
  netAcceptedInWindow: number;
  distinctSubjectsInWindow: number;
  distinctMonthsInWindow: number;
  revokedInWindow: number;
  hasActiveFlag: boolean;
  firstNetAcceptedAt: string | null;
}

export interface ContributorEvidenceItem {
  contributionId: string | null;
  subjectPlaceId: string | null;
  confirmedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  flagId: string | null;
  flagKind: string | null;
  flagReason: string | null;
  flagRecordedAt: string | null;
  flagActive: boolean | null;
}

export interface ContributorPriority {
  memberId: string;
  status: ContributorTier;
}

export type ConductFlagKind = 'fraud' | 'abuse' | 'policy_violation';

export type ContributorCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' | 'invalid' | 'conflict' }
  | { status: 'infrastructure_error' };

export async function getMyContributorStatus(
  client: ContributorRpcClient
): Promise<ContributorCommandResult<MyContributorStatus>> {
  try {
    const { data, error } = await client.rpc('get_my_contributor_status');
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isMyStatusRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        status: row.status,
        policyVersion: row.policy_version,
        statusSince: row.status_since
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getModerationContributorStatus(
  client: ContributorRpcClient,
  memberId: string
): Promise<ContributorCommandResult<ModerationContributorStatus>> {
  try {
    const { data, error } = await client.rpc('get_moderation_contributor_status', {
      requested_member_id: memberId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isModerationStatusRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        status: row.status,
        policyVersion: row.policy_version,
        netAcceptedTotal: row.net_accepted_total,
        netAcceptedInWindow: row.net_accepted_in_window,
        distinctSubjectsInWindow: row.distinct_subjects_in_window,
        distinctMonthsInWindow: row.distinct_months_in_window,
        revokedInWindow: row.revoked_in_window,
        hasActiveFlag: row.has_active_flag,
        firstNetAcceptedAt: row.first_net_accepted_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listModerationContributorEvidence(
  client: ContributorRpcClient,
  memberId: string
): Promise<ContributorCommandResult<ContributorEvidenceItem[]>> {
  try {
    const { data, error } = await client.rpc('list_moderation_contributor_evidence', {
      requested_member_id: memberId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isEvidenceRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        contributionId: row.contribution_id,
        subjectPlaceId: row.subject_place_id,
        confirmedAt: row.confirmed_at,
        revokedAt: row.revoked_at,
        revokedReason: row.revoked_reason,
        flagId: row.flag_id,
        flagKind: row.flag_kind,
        flagReason: row.flag_reason,
        flagRecordedAt: row.flag_recorded_at,
        flagActive: row.flag_active
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listMemberContributorPriority(
  client: ContributorRpcClient,
  memberIds: readonly string[]
): Promise<ContributorCommandResult<ContributorPriority[]>> {
  try {
    if (memberIds.length === 0) return { status: 'success', value: [] };
    const { data, error } = await client.rpc('list_member_contributor_priority', {
      requested_member_ids: memberIds
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isPriorityRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({ memberId: row.member_id, status: row.status }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function revokeContribution(
  client: ContributorRpcClient,
  contributionId: string,
  reason: string,
  requestId: string
): Promise<ContributorCommandResult<{ contributionId: string; revokedAt: string }>> {
  try {
    const { data, error } = await client.rpc('revoke_contribution', {
      requested_contribution_id: contributionId,
      reason,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isRevocationRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: { contributionId: row.contribution_id, revokedAt: row.revoked_at }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function recordMemberConductFlag(
  client: ContributorRpcClient,
  memberId: string,
  flagKind: ConductFlagKind,
  reason: string,
  relatedContributionId: string | null,
  requestId: string
): Promise<ContributorCommandResult<{ flagId: string; recordedAt: string }>> {
  try {
    const { data, error } = await client.rpc('record_member_conduct_flag', {
      requested_member_id: memberId,
      flag_kind: flagKind,
      reason,
      related_contribution_id: relatedContributionId,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isFlagRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return { status: 'success', value: { flagId: row.flag_id, recordedAt: row.recorded_at } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function clearMemberConductFlag(
  client: ContributorRpcClient,
  flagId: string,
  reason: string,
  requestId: string
): Promise<ContributorCommandResult<{ flagId: string; clearedAt: string }>> {
  try {
    const { data, error } = await client.rpc('clear_member_conduct_flag', {
      requested_flag_id: flagId,
      reason,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isClearFlagRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return { status: 'success', value: { flagId: row.flag_id, clearedAt: row.cleared_at } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function recalculateMemberContributorStatus(
  client: ContributorRpcClient,
  memberId: string,
  requestId: string
): Promise<ContributorCommandResult<{ status: ContributorTier; policyVersion: string | null }>> {
  try {
    const { data, error } = await client.rpc('recalculate_member_contributor_status', {
      requested_member_id: memberId,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isRecalculationRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return { status: 'success', value: { status: row.status, policyVersion: row.policy_version } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<ContributorCommandResult<never>['status'], 'success'> {
  if (code === '55006' || code === '23505') return 'conflict';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function isTier(value: unknown): value is ContributorTier {
  return value === 'none' || value === 'contributor' || value === 'trusted_contributor';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isMyStatusRow(value: unknown): value is Record<string, unknown> & {
  status: ContributorTier;
  policy_version: string | null;
  status_since: string | null;
} {
  return (
    isRecord(value) &&
    isTier(value.status) &&
    isStringOrNull(value.policy_version) &&
    isStringOrNull(value.status_since)
  );
}

function isModerationStatusRow(value: unknown): value is Record<string, unknown> & {
  status: ContributorTier;
  policy_version: string | null;
  net_accepted_total: number;
  net_accepted_in_window: number;
  distinct_subjects_in_window: number;
  distinct_months_in_window: number;
  revoked_in_window: number;
  has_active_flag: boolean;
  first_net_accepted_at: string | null;
} {
  return (
    isRecord(value) &&
    isTier(value.status) &&
    isStringOrNull(value.policy_version) &&
    Number.isInteger(value.net_accepted_total) &&
    Number.isInteger(value.net_accepted_in_window) &&
    Number.isInteger(value.distinct_subjects_in_window) &&
    Number.isInteger(value.distinct_months_in_window) &&
    Number.isInteger(value.revoked_in_window) &&
    typeof value.has_active_flag === 'boolean' &&
    isStringOrNull(value.first_net_accepted_at)
  );
}

function isEvidenceRow(value: unknown): value is Record<string, unknown> & {
  contribution_id: string | null;
  subject_place_id: string | null;
  confirmed_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  flag_id: string | null;
  flag_kind: string | null;
  flag_reason: string | null;
  flag_recorded_at: string | null;
  flag_active: boolean | null;
} {
  return (
    isRecord(value) &&
    isStringOrNull(value.contribution_id) &&
    isStringOrNull(value.subject_place_id) &&
    isStringOrNull(value.confirmed_at) &&
    isStringOrNull(value.revoked_at) &&
    isStringOrNull(value.revoked_reason) &&
    isStringOrNull(value.flag_id) &&
    isStringOrNull(value.flag_kind) &&
    isStringOrNull(value.flag_reason) &&
    isStringOrNull(value.flag_recorded_at) &&
    (value.flag_active === null || typeof value.flag_active === 'boolean')
  );
}

function isPriorityRow(
  value: unknown
): value is Record<string, unknown> & { member_id: string; status: ContributorTier } {
  return isRecord(value) && typeof value.member_id === 'string' && isTier(value.status);
}

function isRevocationRow(value: unknown): value is { contribution_id: string; revoked_at: string } {
  return (
    isRecord(value) &&
    typeof value.contribution_id === 'string' &&
    typeof value.revoked_at === 'string'
  );
}

function isFlagRow(value: unknown): value is { flag_id: string; recorded_at: string } {
  return (
    isRecord(value) && typeof value.flag_id === 'string' && typeof value.recorded_at === 'string'
  );
}

function isClearFlagRow(value: unknown): value is { flag_id: string; cleared_at: string } {
  return (
    isRecord(value) && typeof value.flag_id === 'string' && typeof value.cleared_at === 'string'
  );
}

function isRecalculationRow(
  value: unknown
): value is { status: ContributorTier; policy_version: string | null } {
  return isRecord(value) && isTier(value.status) && isStringOrNull(value.policy_version);
}
