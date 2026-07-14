import type { Json } from '$server/db/generated.types';
import type { RequestSupabaseClient } from '$server/db/clients';

export interface LifecycleEvidenceInput {
  kind:
    | 'official_website'
    | 'venue_representative'
    | 'member_report'
    | 'direct_observation'
    | 'public_record'
    | 'other';
  source_url?: string | null;
  source_citation?: string | null;
  source_label: string;
  observed_at: string;
  source_metadata?: Readonly<Record<string, Json>>;
}

export interface ReplacementAccessConditionInput {
  access_area: 'indoors' | 'outdoors' | 'designated_area' | 'other_bounded';
  access_area_note?: string | null;
  restraint_condition:
    'leash_required' | 'off_leash_permitted' | 'carrier_required' | 'other_sourced';
  restraint_note?: string | null;
  dog_eligibility: Readonly<Record<string, Json>>;
  availability_window: Readonly<Record<string, Json>>;
  permission_requirement: 'standing_permission' | 'ask_on_arrival' | 'advance_approval';
}

export type LifecycleCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' }
  | { status: 'stale' }
  | { status: 'invalid' }
  | { status: 'infrastructure_error' };

export interface FreshnessTask {
  taskId: string;
  verificationId: string;
  dueAt: string;
}

const identityTransitionKinds = new Set([
  'rebrand',
  'inactive',
  'move',
  'new_operator',
  'material_purpose_change'
] as const);
type IdentityTransitionKind =
  'rebrand' | 'inactive' | 'move' | 'new_operator' | 'material_purpose_change';

export async function scheduleReconfirmationDue(
  client: RequestSupabaseClient,
  asOf: string,
  requestId: string
): Promise<LifecycleCommandResult<FreshnessTask[]>> {
  try {
    const { data, error } = await client.rpc('schedule_reconfirmation_due', {
      requested_as_of: asOf,
      command_request_id: requestId
    });
    if (error) return mapLifecycleError(error.code);
    if (
      !Array.isArray(data) ||
      !data.every(
        (row) => hasText(row.task_id) && hasText(row.verification_id) && isTimestamp(row.due_at)
      )
    ) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        taskId: row.task_id,
        verificationId: row.verification_id,
        dueAt: row.due_at
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function reconfirmAccessCondition(
  client: RequestSupabaseClient,
  command: {
    accessConditionId: string;
    expectedVerificationId: string;
    verifiedAt: string;
    freshnessUntil: string;
    evidence: LifecycleEvidenceInput;
    decisionMetadata?: Readonly<Record<string, Json>>;
  },
  requestId: string
): Promise<
  LifecycleCommandResult<{ verificationId: string; verifiedAt: string; freshnessUntil: string }>
> {
  try {
    const { data, error } = await client.rpc('reconfirm_access_condition', {
      command_payload: {
        access_condition_id: command.accessConditionId,
        expected_verification_id: command.expectedVerificationId,
        verified_at: command.verifiedAt,
        freshness_until: command.freshnessUntil,
        evidence: command.evidence,
        decision_metadata: command.decisionMetadata ?? {}
      } as unknown as Json,
      command_request_id: requestId
    });
    if (error) return mapLifecycleError(error.code);
    const row = data[0];
    if (
      data.length !== 1 ||
      !row ||
      !hasText(row.verification_id) ||
      !isTimestamp(row.verified_at) ||
      !isTimestamp(row.freshness_until)
    ) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: {
        verificationId: row.verification_id,
        verifiedAt: row.verified_at,
        freshnessUntil: row.freshness_until
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function openAccessDispute(
  client: RequestSupabaseClient,
  command: {
    accessConditionId: string;
    expectedVerificationId: string;
    openedAt: string;
    reason: string;
    evidence: LifecycleEvidenceInput;
  },
  requestId: string
): Promise<
  LifecycleCommandResult<{ disputeId: string; disputedVerificationId: string; openedAt: string }>
> {
  try {
    const { data, error } = await client.rpc('open_access_dispute', {
      command_payload: {
        access_condition_id: command.accessConditionId,
        expected_verification_id: command.expectedVerificationId,
        opened_at: command.openedAt,
        reason: command.reason,
        evidence: command.evidence
      } as unknown as Json,
      command_request_id: requestId
    });
    if (error) return mapLifecycleError(error.code);
    const row = data[0];
    if (
      data.length !== 1 ||
      !row ||
      !hasText(row.dispute_id) ||
      !hasText(row.disputed_verification_id) ||
      !isTimestamp(row.opened_at)
    ) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: {
        disputeId: row.dispute_id,
        disputedVerificationId: row.disputed_verification_id,
        openedAt: row.opened_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function resolveAccessDispute(
  client: RequestSupabaseClient,
  command: {
    disputeId: string;
    outcome: 'dismissed' | 'confirmed';
    resolvedAt: string;
    freshnessUntil: string;
    resolutionNotes: string;
    evidence: LifecycleEvidenceInput;
    replacementCondition?: ReplacementAccessConditionInput;
  },
  requestId: string
): Promise<
  LifecycleCommandResult<{
    disputeId: string;
    accessConditionId: string;
    verificationId: string;
    resolvedAt: string;
  }>
> {
  try {
    const { data, error } = await client.rpc('resolve_access_dispute', {
      command_payload: {
        dispute_id: command.disputeId,
        outcome: command.outcome,
        resolved_at: command.resolvedAt,
        freshness_until: command.freshnessUntil,
        resolution_notes: command.resolutionNotes,
        evidence: command.evidence,
        ...(command.replacementCondition
          ? { replacement_condition: command.replacementCondition }
          : {})
      } as unknown as Json,
      command_request_id: requestId
    });
    if (error) return mapLifecycleError(error.code);
    const row = data[0];
    if (
      data.length !== 1 ||
      !row ||
      !hasText(row.dispute_id) ||
      !hasText(row.access_condition_id) ||
      !hasText(row.verification_id) ||
      !isTimestamp(row.resolved_at)
    ) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: {
        disputeId: row.dispute_id,
        accessConditionId: row.access_condition_id,
        verificationId: row.verification_id,
        resolvedAt: row.resolved_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function transitionPlaceIdentity(
  client: RequestSupabaseClient,
  command: {
    placeId: string;
    expectedVersion: number;
    kind: IdentityTransitionKind;
    decidedAt: string;
    decisionNotes: string;
    successorPlaceId?: string;
    names?: { is: string; en: string };
  },
  requestId: string
): Promise<
  LifecycleCommandResult<{
    transitionId: string;
    predecessorPlaceId: string;
    successorPlaceId: string | null;
    transitionKind: IdentityTransitionKind;
    predecessorVersion: number;
  }>
> {
  try {
    const { data, error } = await client.rpc('transition_place_identity', {
      command_payload: {
        place_id: command.placeId,
        expected_version: command.expectedVersion,
        kind: command.kind,
        decided_at: command.decidedAt,
        decision_notes: command.decisionNotes,
        ...(command.successorPlaceId ? { successor_place_id: command.successorPlaceId } : {}),
        ...(command.names ? { names: command.names } : {})
      } as Json,
      command_request_id: requestId
    });
    if (error) return mapLifecycleError(error.code);
    const row = data[0];
    if (
      data.length !== 1 ||
      !row ||
      !hasText(row.transition_id) ||
      !hasText(row.predecessor_place_id) ||
      !(row.successor_place_id === null || hasText(row.successor_place_id)) ||
      !isIdentityTransitionKind(row.transition_kind) ||
      !Number.isSafeInteger(row.predecessor_version)
    ) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: {
        transitionId: row.transition_id,
        predecessorPlaceId: row.predecessor_place_id,
        successorPlaceId: row.successor_place_id,
        transitionKind: row.transition_kind,
        predecessorVersion: row.predecessor_version
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function isIdentityTransitionKind(value: unknown): value is IdentityTransitionKind {
  return typeof value === 'string' && identityTransitionKinds.has(value as IdentityTransitionKind);
}

function mapLifecycleError(code: string): LifecycleCommandResult<never> {
  if (code === '42501') return { status: 'forbidden' };
  if (code === '40001' || code === '23505') return { status: 'stale' };
  if (
    code === '22007' ||
    code === '22023' ||
    code === '23502' ||
    code === '23503' ||
    code === '23514'
  ) {
    return { status: 'invalid' };
  }
  return { status: 'infrastructure_error' };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return hasText(value) && Number.isFinite(Date.parse(value));
}
