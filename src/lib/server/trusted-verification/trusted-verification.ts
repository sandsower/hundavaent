export type TrustedVerificationTaskKind = 'access_freshness' | 'dog_amenities';
export type TrustedVerificationOutcome =
  | 'submitted'
  | 'already_handled'
  | 'superseded'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  | 'unavailable';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface TrustedVerificationRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export interface TrustedVerificationTask {
  taskId: string;
  taskKind: TrustedVerificationTaskKind;
  placeId: string;
  placeName: string;
  municipality: string;
  category: string;
  currentValue: Record<string, unknown>;
  freshnessUntil: string | null;
}

export interface TrustedVerificationSubmission {
  submissionId: string;
  taskId: string;
  taskKind: TrustedVerificationTaskKind;
  flagId: string;
  placeId: string;
  placeName: string;
  outcome: TrustedVerificationOutcome;
  memberReason: string | null;
  submittedAt: string;
  confirmedAt: string | null;
}

export interface TrustedVerificationFeedback {
  hasUnread: boolean;
  unreadCount: number;
  latestConfirmedAt: string | null;
  latestTaskKind: TrustedVerificationTaskKind | null;
  latestPlaceId: string | null;
}

export interface ModerationTrustedVerificationContext {
  submissionId: string;
  taskId: string;
  taskKind: TrustedVerificationTaskKind;
  outcome: 'submitted' | 'superseded' | 'accepted';
  supersededBySubmissionId: string | null;
}

export interface TrustedVerificationEvidence {
  kind: string;
  source_url?: string | null;
  source_citation?: string | null;
  source_label: string;
  observed_at: string;
  source_metadata?: Record<string, unknown>;
}

export type TrustedVerificationCommandResult<T> =
  | { status: 'success'; value: T }
  | {
      status:
        | 'forbidden'
        | 'invalid'
        | 'conflict'
        | 'rate_limited'
        | 'policy_unavailable'
        | 'infrastructure_error';
    };

export async function listTrustedVerificationTasks(
  client: TrustedVerificationRpcClient,
  locale: 'is' | 'en',
  limit = 24
): Promise<TrustedVerificationCommandResult<TrustedVerificationTask[]>> {
  try {
    const { data, error } = await client.rpc('list_trusted_verification_tasks', {
      requested_locale: locale,
      requested_limit: limit
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isTaskRow)) {
      return { status: 'infrastructure_error' };
    }
    return { status: 'success', value: data.map(mapTaskRow) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getTrustedVerificationTask(
  client: TrustedVerificationRpcClient,
  taskId: string,
  locale: 'is' | 'en'
): Promise<TrustedVerificationCommandResult<TrustedVerificationTask> | { status: 'unavailable' }> {
  try {
    const { data, error } = await client.rpc('get_trusted_verification_task', {
      requested_task_id: taskId,
      requested_locale: locale
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data)) return { status: 'infrastructure_error' };
    if (data.length === 0) return { status: 'unavailable' };
    if (data.length !== 1 || !isTaskRow(data[0])) return { status: 'infrastructure_error' };
    return { status: 'success', value: mapTaskRow(data[0]) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function submitTrustedVerificationTask(
  client: TrustedVerificationRpcClient,
  command: {
    taskId: string;
    response: Record<string, unknown>;
    evidence: TrustedVerificationEvidence;
    explanation: string;
  },
  requestId: string
): Promise<
  TrustedVerificationCommandResult<{
    submissionId: string | null;
    flagId: string | null;
    outcome: TrustedVerificationOutcome;
    activatedCurrentWeek: boolean;
    submittedAt: string;
  }>
> {
  try {
    const { data, error } = await client.rpc('submit_trusted_verification_task', {
      requested_task_id: command.taskId,
      requested_response: command.response,
      requested_evidence: command.evidence,
      requested_explanation: command.explanation,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isSubmissionResultRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        submissionId: row.submission_id,
        flagId: row.flag_id,
        outcome: row.outcome,
        activatedCurrentWeek: row.activated_current_week,
        submittedAt: row.submitted_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listMyTrustedVerificationSubmissions(
  client: TrustedVerificationRpcClient,
  locale: 'is' | 'en',
  limit = 30
): Promise<TrustedVerificationCommandResult<TrustedVerificationSubmission[]>> {
  try {
    const { data, error } = await client.rpc('list_my_trusted_verification_submissions', {
      requested_locale: locale,
      requested_limit: limit
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isHistoryRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        submissionId: row.submission_id,
        taskId: row.task_id,
        taskKind: row.task_kind,
        flagId: row.flag_id,
        placeId: row.place_id,
        placeName: row.place_name,
        outcome: row.outcome,
        memberReason: row.member_reason,
        submittedAt: row.submitted_at,
        confirmedAt: row.confirmed_at
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getMyTrustedVerificationFeedback(
  client: TrustedVerificationRpcClient
): Promise<TrustedVerificationCommandResult<TrustedVerificationFeedback>> {
  try {
    const { data, error } = await client.rpc('get_my_trusted_verification_feedback');
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isFeedbackRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    const row = data[0];
    return {
      status: 'success',
      value: {
        hasUnread: row.has_unread,
        unreadCount: row.unread_count,
        latestConfirmedAt: row.latest_confirmed_at,
        latestTaskKind: row.latest_task_kind,
        latestPlaceId: row.latest_place_id
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function markMyTrustedVerificationFeedbackRead(
  client: TrustedVerificationRpcClient,
  readThroughConfirmedAt: string
): Promise<
  TrustedVerificationCommandResult<{
    readThroughConfirmedAt: string;
  }>
> {
  try {
    const { data, error } = await client.rpc('mark_my_trusted_verification_feedback_read', {
      requested_read_through: readThroughConfirmedAt
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1 || !isReadReceiptRow(data[0])) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: { readThroughConfirmedAt: data[0].read_through_confirmed_at }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getModerationTrustedVerificationContext(
  client: TrustedVerificationRpcClient,
  flagId: string
): Promise<TrustedVerificationCommandResult<ModerationTrustedVerificationContext | null>> {
  try {
    const { data, error } = await client.rpc('get_moderation_trusted_verification_context', {
      requested_flag_id: flagId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length > 1 || !data.every(isModerationContextRow)) {
      return { status: 'infrastructure_error' };
    }
    if (data.length === 0) return { status: 'success', value: null };
    const row = data[0];
    return {
      status: 'success',
      value: {
        submissionId: row.submission_id,
        taskId: row.task_id,
        taskKind: row.task_kind,
        outcome: row.outcome,
        supersededBySubmissionId: row.superseded_by_submission_id
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapTaskRow(row: TaskRow): TrustedVerificationTask {
  return {
    taskId: row.task_id,
    taskKind: row.task_kind,
    placeId: row.place_id,
    placeName: row.place_name,
    municipality: row.municipality,
    category: row.category,
    currentValue: row.current_value,
    freshnessUntil: row.freshness_until
  };
}

function mapError(
  code: string | undefined
): Exclude<TrustedVerificationCommandResult<never>['status'], 'success'> {
  if (code === '55006' || code === '23505' || code === '40001') return 'conflict';
  if (code === '54000') return 'rate_limited';
  if (code === '55000') return 'policy_unavailable';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isTaskKind(value: unknown): value is TrustedVerificationTaskKind {
  return value === 'access_freshness' || value === 'dog_amenities';
}

function isOutcome(value: unknown): value is TrustedVerificationOutcome {
  return (
    value === 'submitted' ||
    value === 'already_handled' ||
    value === 'superseded' ||
    value === 'accepted' ||
    value === 'rejected' ||
    value === 'revoked' ||
    value === 'unavailable'
  );
}

interface TaskRow {
  task_id: string;
  task_kind: TrustedVerificationTaskKind;
  place_id: string;
  place_name: string;
  municipality: string;
  category: string;
  current_value: Record<string, unknown>;
  freshness_until: string | null;
}

function isTaskRow(value: unknown): value is TaskRow {
  return (
    isRecord(value) &&
    typeof value.task_id === 'string' &&
    isTaskKind(value.task_kind) &&
    typeof value.place_id === 'string' &&
    typeof value.place_name === 'string' &&
    typeof value.municipality === 'string' &&
    typeof value.category === 'string' &&
    isRecord(value.current_value) &&
    isStringOrNull(value.freshness_until)
  );
}

interface SubmissionResultRow {
  submission_id: string | null;
  flag_id: string | null;
  outcome: TrustedVerificationOutcome;
  activated_current_week: boolean;
  submitted_at: string;
}

function isSubmissionResultRow(value: unknown): value is SubmissionResultRow {
  return (
    isRecord(value) &&
    isStringOrNull(value.submission_id) &&
    isStringOrNull(value.flag_id) &&
    isOutcome(value.outcome) &&
    typeof value.activated_current_week === 'boolean' &&
    typeof value.submitted_at === 'string'
  );
}

interface HistoryRow {
  submission_id: string;
  task_id: string;
  task_kind: TrustedVerificationTaskKind;
  flag_id: string;
  place_id: string;
  place_name: string;
  outcome: TrustedVerificationOutcome;
  member_reason: string | null;
  submitted_at: string;
  confirmed_at: string | null;
}

function isHistoryRow(value: unknown): value is HistoryRow {
  return (
    isRecord(value) &&
    typeof value.submission_id === 'string' &&
    typeof value.task_id === 'string' &&
    isTaskKind(value.task_kind) &&
    typeof value.flag_id === 'string' &&
    typeof value.place_id === 'string' &&
    typeof value.place_name === 'string' &&
    isOutcome(value.outcome) &&
    isStringOrNull(value.member_reason) &&
    typeof value.submitted_at === 'string' &&
    isStringOrNull(value.confirmed_at)
  );
}

interface FeedbackRow {
  has_unread: boolean;
  unread_count: number;
  latest_confirmed_at: string | null;
  latest_task_kind: TrustedVerificationTaskKind | null;
  latest_place_id: string | null;
}

function isFeedbackRow(value: unknown): value is FeedbackRow {
  return (
    isRecord(value) &&
    typeof value.has_unread === 'boolean' &&
    Number.isInteger(value.unread_count) &&
    isStringOrNull(value.latest_confirmed_at) &&
    (value.latest_task_kind === null || isTaskKind(value.latest_task_kind)) &&
    isStringOrNull(value.latest_place_id)
  );
}

interface ReadReceiptRow {
  read_through_confirmed_at: string;
}

function isReadReceiptRow(value: unknown): value is ReadReceiptRow {
  return isRecord(value) && typeof value.read_through_confirmed_at === 'string';
}

interface ModerationContextRow {
  submission_id: string;
  task_id: string;
  task_kind: TrustedVerificationTaskKind;
  outcome: 'submitted' | 'superseded' | 'accepted';
  superseded_by_submission_id: string | null;
}

function isModerationContextRow(value: unknown): value is ModerationContextRow {
  return (
    isRecord(value) &&
    typeof value.submission_id === 'string' &&
    typeof value.task_id === 'string' &&
    isTaskKind(value.task_kind) &&
    (value.outcome === 'submitted' ||
      value.outcome === 'superseded' ||
      value.outcome === 'accepted') &&
    isStringOrNull(value.superseded_by_submission_id)
  );
}
