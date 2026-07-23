import { isProximityDecision, type ProximityDecision } from '$lib/check-ins/proximity';
import type { WeeklyRhythmRecognition } from '$lib/member-activity/types';
import type { RequestSupabaseClient } from '$server/db/clients';
import type { Database } from '$server/db/generated.types';
import { mapWeeklyRhythmRecognition } from '$server/member-activity/weekly-rhythm';

type RecordCheckInRow = Database['public']['Functions']['record_check_in']['Returns'][number];
type CheckInStatusRow =
  Database['public']['Functions']['get_current_check_in_status']['Returns'][number];
type CheckInPolicyRow = Database['public']['Functions']['get_check_in_policy']['Returns'][number];

export interface RecordedCheckIn {
  checkInId: string;
  placeId: string;
  proximityConfirmed: ProximityDecision;
  checkedInAt: string;
  alreadyCheckedIn: boolean;
  recognition: WeeklyRhythmRecognition;
}

export interface CurrentCheckInStatus {
  hasRecentCheckIn: boolean;
  checkedInAt: string | null;
  proximityConfirmed: ProximityDecision | null;
}

export type CheckInMutationResult =
  | { status: 'success'; value: RecordedCheckIn }
  | { status: 'place_unavailable' | 'authentication_required' | 'infrastructure_error' };

export type CheckInStatusResult =
  | { status: 'success'; value: CurrentCheckInStatus }
  | { status: 'authentication_required' | 'infrastructure_error' };

export type CheckInPolicyResult =
  | { status: 'success'; value: { proximityAssistEnabled: boolean } }
  | { status: 'infrastructure_error' };

export async function recordCheckIn(
  client: RequestSupabaseClient,
  placeId: string,
  proximityDecision: ProximityDecision,
  requestId: string
): Promise<CheckInMutationResult> {
  try {
    const { data, error } = await client.rpc('record_check_in', {
      requested_place_id: placeId,
      requested_proximity_status: proximityDecision,
      command_request_id: requestId
    });
    if (error) {
      if (error.code === '42501') return { status: 'authentication_required' };
      if (error.code === '22023') return { status: 'place_unavailable' };
      return { status: 'infrastructure_error' };
    }
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isRecordCheckInRow(row)) return { status: 'infrastructure_error' };
    const recognition = mapWeeklyRhythmRecognition(row, 'check_in');
    if (!recognition) return { status: 'infrastructure_error' };
    return { status: 'success', value: toRecordedCheckIn(row, recognition) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getCurrentCheckInStatus(
  client: RequestSupabaseClient,
  placeId: string
): Promise<CheckInStatusResult> {
  try {
    const { data, error } = await client.rpc('get_current_check_in_status', {
      requested_place_id: placeId
    });
    if (error) {
      return error.code === '42501'
        ? { status: 'authentication_required' }
        : { status: 'infrastructure_error' };
    }
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isCheckInStatusRow(row)) return { status: 'infrastructure_error' };
    return {
      status: 'success',
      value: {
        hasRecentCheckIn: row.has_recent_check_in,
        checkedInAt: row.checked_in_at,
        proximityConfirmed: isProximityDecision(row.proximity_confirmed)
          ? row.proximity_confirmed
          : null
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getCheckInPolicy(
  client: RequestSupabaseClient
): Promise<CheckInPolicyResult> {
  try {
    const { data, error } = await client.rpc('get_check_in_policy');
    if (error) return { status: 'infrastructure_error' };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isCheckInPolicyRow(row)) return { status: 'infrastructure_error' };
    return { status: 'success', value: { proximityAssistEnabled: row.proximity_assist_enabled } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function toRecordedCheckIn(
  row: RecordCheckInRow,
  recognition: WeeklyRhythmRecognition
): RecordedCheckIn {
  return {
    checkInId: row.check_in_id,
    placeId: row.place_id,
    proximityConfirmed: isProximityDecision(row.proximity_confirmed)
      ? row.proximity_confirmed
      : 'unknown',
    checkedInAt: row.checked_in_at,
    alreadyCheckedIn: row.already_checked_in,
    recognition
  };
}

function isRecordCheckInRow(row: unknown): row is RecordCheckInRow {
  return (
    isRecord(row) &&
    isNonEmptyString(row.check_in_id) &&
    isNonEmptyString(row.place_id) &&
    typeof row.proximity_confirmed === 'string' &&
    isValidDate(row.checked_in_at) &&
    typeof row.already_checked_in === 'boolean' &&
    typeof row.qualifying_action_recorded === 'boolean' &&
    typeof row.activated_current_week === 'boolean' &&
    typeof row.current_week_starts_on === 'string' &&
    typeof row.current_week_ends_on === 'string' &&
    typeof row.current_week_active === 'boolean'
  );
}

function isCheckInStatusRow(row: unknown): row is CheckInStatusRow {
  return (
    isRecord(row) &&
    typeof row.has_recent_check_in === 'boolean' &&
    (row.checked_in_at === null || isValidDate(row.checked_in_at)) &&
    (row.proximity_confirmed === null || typeof row.proximity_confirmed === 'string')
  );
}

function isCheckInPolicyRow(row: unknown): row is CheckInPolicyRow {
  return isRecord(row) && typeof row.proximity_assist_enabled === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
