import type { Json } from '$server/db/generated.types';
import type {
  CandidateDecisionOutcome,
  CandidateRejectionReasonCode,
  ModerationDraftSnapshot
} from '$server/moderation/moderation-contract';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface ModerationDraftRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export type ModerationDraftCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'invalid' | 'conflict' | 'resolved' | 'forbidden' | 'infrastructure_error' };

export interface SaveCandidateModerationDraftCommand {
  placeId: string;
  expectedItemVersion: number;
  expectedDraftVersion: number;
  sectionId: string;
  payload: Json;
  requestId: string;
}

export interface SaveSuggestionModerationDraftCommand {
  suggestionId: string;
  expectedItemVersion: number;
  expectedDraftVersion: number;
  sectionId: string;
  payload: Json;
  requestId: string;
}

export interface SaveFlagModerationDraftCommand {
  flagId: string;
  expectedItemVersion: number;
  expectedDraftVersion: number;
  sectionId: string;
  payload: Json;
  requestId: string;
}

export interface DecideCandidatePlaceCommand {
  placeId: string;
  outcome: CandidateDecisionOutcome;
  expectedItemVersion: number;
  expectedDraftVersion: number;
  reasonCode: CandidateRejectionReasonCode | null;
  contributorExplanationIs: string | null;
  contributorExplanationEn: string | null;
  privateNote: string | null;
  requestId: string;
}

export interface CandidateDecisionReceipt {
  placeId: string;
  status: 'pending' | 'needs_information' | 'rejected';
  itemVersion: number;
  draftVersion: number;
}

export async function saveCandidateModerationDraft(
  client: ModerationDraftRpcClient,
  command: SaveCandidateModerationDraftCommand
): Promise<ModerationDraftCommandResult<ModerationDraftSnapshot>> {
  try {
    const { data, error } = await client.rpc('save_candidate_place_moderation_draft', {
      requested_place_id: command.placeId,
      expected_item_version: command.expectedItemVersion,
      expected_draft_version: command.expectedDraftVersion,
      requested_section_id: command.sectionId,
      requested_payload: command.payload,
      command_request_id: command.requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isDraftRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        targetId: row.target_id,
        version: row.draft_version,
        payload: row.payload as Json,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function saveSuggestionModerationDraft(
  client: ModerationDraftRpcClient,
  command: SaveSuggestionModerationDraftCommand
): Promise<ModerationDraftCommandResult<ModerationDraftSnapshot>> {
  return saveModerationDraft(client, 'save_place_suggestion_moderation_draft', {
    requested_suggestion_id: command.suggestionId,
    expected_item_version: command.expectedItemVersion,
    expected_draft_version: command.expectedDraftVersion,
    requested_section_id: command.sectionId,
    requested_payload: command.payload,
    command_request_id: command.requestId
  });
}

export async function saveFlagModerationDraft(
  client: ModerationDraftRpcClient,
  command: SaveFlagModerationDraftCommand
): Promise<ModerationDraftCommandResult<ModerationDraftSnapshot>> {
  return saveModerationDraft(client, 'save_place_flag_moderation_draft', {
    requested_flag_id: command.flagId,
    expected_item_version: command.expectedItemVersion,
    expected_draft_version: command.expectedDraftVersion,
    requested_section_id: command.sectionId,
    requested_payload: command.payload,
    command_request_id: command.requestId
  });
}

async function saveModerationDraft(
  client: ModerationDraftRpcClient,
  functionName: 'save_place_suggestion_moderation_draft' | 'save_place_flag_moderation_draft',
  args: Record<string, unknown>
): Promise<ModerationDraftCommandResult<ModerationDraftSnapshot>> {
  try {
    const { data, error } = await client.rpc(functionName, args);
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isDraftRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        targetId: row.target_id,
        version: row.draft_version,
        payload: row.payload as Json,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function decideCandidatePlace(
  client: ModerationDraftRpcClient,
  command: DecideCandidatePlaceCommand
): Promise<ModerationDraftCommandResult<CandidateDecisionReceipt>> {
  try {
    const { data, error } = await client.rpc('decide_candidate_place', {
      requested_place_id: command.placeId,
      requested_outcome: command.outcome,
      expected_item_version: command.expectedItemVersion,
      expected_draft_version: command.expectedDraftVersion,
      requested_reason_code: command.reasonCode,
      contributor_explanation_is: command.contributorExplanationIs,
      contributor_explanation_en: command.contributorExplanationEn,
      requested_private_note: command.privateNote,
      command_request_id: command.requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isDecisionRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        status: row.status,
        itemVersion: row.item_version,
        draftVersion: row.draft_version
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<ModerationDraftCommandResult<never>['status'], 'success'> {
  if (code === '22023') return 'invalid';
  if (code === '40001') return 'conflict';
  if (code === '55006') return 'resolved';
  if (code === '42501') return 'forbidden';
  return 'infrastructure_error';
}

function isDraftRow(value: unknown): value is {
  target_id: string;
  draft_version: number;
  payload: Record<string, unknown>;
  updated_by: string;
  updated_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.target_id === 'string' &&
    typeof value.draft_version === 'number' &&
    Number.isInteger(value.draft_version) &&
    value.draft_version > 0 &&
    isRecord(value.payload) &&
    typeof value.updated_by === 'string' &&
    typeof value.updated_at === 'string'
  );
}

function isDecisionRow(value: unknown): value is {
  place_id: string;
  status: 'pending' | 'needs_information' | 'rejected';
  item_version: number;
  draft_version: number;
} {
  return (
    isRecord(value) &&
    typeof value.place_id === 'string' &&
    (value.status === 'pending' ||
      value.status === 'needs_information' ||
      value.status === 'rejected') &&
    typeof value.item_version === 'number' &&
    Number.isInteger(value.item_version) &&
    value.item_version > 0 &&
    typeof value.draft_version === 'number' &&
    Number.isInteger(value.draft_version) &&
    value.draft_version >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
