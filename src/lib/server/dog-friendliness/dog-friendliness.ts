import type {
  Dimension,
  PrivateRatingNoteClassification,
  RatingExclusionKind,
  RatingNoteDispositionKind,
  RatingNoteInput,
  RatingScores,
  InlineRatingInput
} from './dog-friendliness-input';
import type { WeeklyRhythmRecognition } from '$lib/member-activity/types';
import { mapWeeklyRhythmRecognition } from '$server/member-activity/weekly-rhythm';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface DogFriendlinessRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export type DogFriendlinessCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' | 'invalid' | 'conflict' }
  | { status: 'infrastructure_error' };

export interface CurrentRating {
  id: string;
  placeId: string;
  scores: RatingScores;
  overallScore?: number | null;
  ratedAt: string;
  privateNote: string | null;
  privateNoteUpdatedAt: string | null;
}

export interface RatingMutation {
  rating: CurrentRating;
  recognition: WeeklyRhythmRecognition;
}

export interface ModerationRating {
  id: string;
  memberId: string;
  scores: RatingScores;
  overallScore?: number | null;
  ratedAt: string;
  excludedAt: string | null;
  excludedKind: RatingExclusionKind | null;
  excludedReason: string | null;
  privateNote: string | null;
  privateNoteClassification: PrivateRatingNoteClassification | null;
  privateNoteUpdatedAt: string | null;
  linkedReportId: string | null;
}

export async function saveInlineRating(
  client: DogFriendlinessRpcClient,
  placeId: string,
  input: InlineRatingInput,
  requestId: string
): Promise<DogFriendlinessCommandResult<RatingMutation>> {
  try {
    const { data, error } = await client.rpc('save_inline_dog_friendliness_rating', {
      requested_place_id: placeId,
      requested_overall_score: input.overall,
      requested_welcome_score: input.welcome,
      requested_clarity_score: input.clarity,
      requested_comfort_score: input.comfort,
      requested_thoughtfulness_score: input.thoughtfulness,
      command_request_id: requestId,
      requested_update_private_note: input.noteUpdate,
      requested_private_note: input.noteUpdate ? input.privateNote : null,
      requested_private_note_classification: null
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isSubmitRow(row) || !isScoreOrNull(row.overall_score) || row.overall_score === null) {
      return { status: 'infrastructure_error' };
    }
    const recognition = mapWeeklyRhythmRecognition(row, 'rating');
    if (!recognition) return { status: 'infrastructure_error' };
    return {
      status: 'success',
      value: { rating: toCurrentRating(row), recognition }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function applyPendingRating(
  client: DogFriendlinessRpcClient,
  placeId: string
): Promise<
  DogFriendlinessCommandResult<{ applied: boolean; recognition: WeeklyRhythmRecognition }>
> {
  try {
    const { data, error } = await client.rpc('apply_pending_member_rating', {
      requested_place_id: placeId
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    const recognition = mapWeeklyRhythmRecognition(row, 'rating');
    if (!isRecord(row) || typeof row.applied !== 'boolean' || !recognition) {
      return { status: 'infrastructure_error' };
    }
    return { status: 'success', value: { applied: row.applied, recognition } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export interface PrivateRatingNotePolicy {
  enabled: boolean;
  lowScoreThreshold: number | null;
}

export interface RatingNoteHistoryEntry {
  eventKind: 'submitted' | 'updated' | 'note_updated' | 'report_linked';
  privateNote: string | null;
  privateNoteClassification: PrivateRatingNoteClassification | null;
  occurredAt: string;
}

export interface RatingNoteDisposition {
  id: string;
  dispositionKind: RatingNoteDispositionKind;
  notes: string;
  moderatorId: string;
  occurredAt: string;
}

export interface SummaryDimension {
  dimension: Dimension;
  applicableCount: number;
  mean: number;
}

export interface DogFriendlinessSummary {
  placeId: string;
  visible: boolean;
  eligibleCount: number | null;
  trailingTwelveMonthCount: number | null;
  dimensions: SummaryDimension[];
  overallMean: number | null;
  overallVisible: boolean;
}

export async function submitRating(
  client: DogFriendlinessRpcClient,
  placeId: string,
  scores: RatingScores,
  requestId: string,
  noteInput: RatingNoteInput = { update: false }
): Promise<DogFriendlinessCommandResult<CurrentRating>> {
  try {
    const { data, error } = await client.rpc('submit_dog_friendliness_rating', {
      requested_place_id: placeId,
      requested_welcome_score: scores.welcome,
      requested_clarity_score: scores.clarity,
      requested_comfort_score: scores.comfort,
      requested_thoughtfulness_score: scores.thoughtfulness,
      command_request_id: requestId,
      requested_update_private_note: noteInput.update,
      requested_private_note: noteInput.update ? noteInput.note : null,
      requested_private_note_classification: noteInput.update ? noteInput.classification : null
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isSubmitRow(row)) return { status: 'infrastructure_error' };
    return { status: 'success', value: toCurrentRating(row) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getPrivateRatingNotePolicy(
  client: DogFriendlinessRpcClient
): Promise<DogFriendlinessCommandResult<PrivateRatingNotePolicy>> {
  try {
    const { data, error } = await client.rpc('get_private_rating_note_policy');
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isPolicyRow(row)) return { status: 'infrastructure_error' };
    return {
      status: 'success',
      value: { enabled: row.enabled, lowScoreThreshold: row.low_score_threshold }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function createReportFromRatingNote(
  client: DogFriendlinessRpcClient,
  placeId: string,
  requestId: string
): Promise<
  DogFriendlinessCommandResult<{
    flagId: string;
    outcome: string;
    submittedAt: string;
    recognition: WeeklyRhythmRecognition;
  }>
> {
  try {
    const { data, error } = await client.rpc('create_report_from_rating_note', {
      requested_place_id: placeId,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isReportLinkRow(row)) return { status: 'infrastructure_error' };
    const recognition = mapWeeklyRhythmRecognition(row, 'report');
    if (!recognition) return { status: 'infrastructure_error' };
    return {
      status: 'success',
      value: {
        flagId: row.flag_id,
        outcome: row.status,
        submittedAt: row.submitted_at,
        recognition
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getMyRating(
  client: DogFriendlinessRpcClient,
  placeId: string
): Promise<DogFriendlinessCommandResult<CurrentRating | null>> {
  try {
    const { data, error } = await client.rpc('get_my_dog_friendliness_rating', {
      requested_place_id: placeId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data)) return { status: 'infrastructure_error' };
    if (data.length === 0) return { status: 'success', value: null };
    const row = data[0];
    if (!isSubmitRow(row)) return { status: 'infrastructure_error' };
    return { status: 'success', value: toCurrentRating(row) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getSummary(
  client: DogFriendlinessRpcClient,
  placeId: string
): Promise<DogFriendlinessCommandResult<DogFriendlinessSummary>> {
  try {
    const { data, error } = await client.rpc('get_dog_friendliness_summary', {
      requested_place_id: placeId
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isSummaryRow(row)) return { status: 'infrastructure_error' };
    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        visible: row.summary_visible,
        eligibleCount: row.eligible_count,
        trailingTwelveMonthCount: row.trailing_twelve_month_count,
        dimensions: parseDimensions(row.dimensions),
        overallMean: row.overall_mean,
        overallVisible: row.overall_visible
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listModerationRatings(
  client: DogFriendlinessRpcClient,
  placeId: string
): Promise<DogFriendlinessCommandResult<ModerationRating[]>> {
  try {
    const { data, error } = await client.rpc('list_moderation_dog_friendliness_ratings', {
      requested_place_id: placeId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isModerationRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        scores: {
          welcome: row.welcome_score,
          clarity: row.clarity_score,
          comfort: row.comfort_score,
          thoughtfulness: row.thoughtfulness_score
        },
        overallScore: row.overall_score,
        ratedAt: row.rated_at,
        excludedAt: row.excluded_at,
        excludedKind: row.excluded_kind,
        excludedReason: row.excluded_reason,
        privateNote: row.private_note,
        privateNoteClassification: row.private_note_classification,
        privateNoteUpdatedAt: row.private_note_updated_at,
        linkedReportId: row.linked_report_id
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listModerationRatingNoteHistory(
  client: DogFriendlinessRpcClient,
  memberId: string,
  placeId: string
): Promise<DogFriendlinessCommandResult<RatingNoteHistoryEntry[]>> {
  try {
    const { data, error } = await client.rpc(
      'list_moderation_dog_friendliness_rating_note_history',
      { requested_member_id: memberId, requested_place_id: placeId }
    );
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isNoteHistoryRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        eventKind: row.event_kind,
        privateNote: row.private_note,
        privateNoteClassification: row.private_note_classification,
        occurredAt: row.occurred_at
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function recordRatingNoteDisposition(
  client: DogFriendlinessRpcClient,
  memberId: string,
  placeId: string,
  dispositionKind: RatingNoteDispositionKind,
  notes: string,
  requestId: string
): Promise<DogFriendlinessCommandResult<{ id: string; occurredAt: string }>> {
  try {
    const { data, error } = await client.rpc('record_rating_note_disposition', {
      requested_member_id: memberId,
      requested_place_id: placeId,
      disposition_kind: dispositionKind,
      notes,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isDispositionCommandRow(row)) return { status: 'infrastructure_error' };
    return { status: 'success', value: { id: row.id, occurredAt: row.occurred_at } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listModerationRatingNoteDispositions(
  client: DogFriendlinessRpcClient,
  memberId: string,
  placeId: string
): Promise<DogFriendlinessCommandResult<RatingNoteDisposition[]>> {
  try {
    const { data, error } = await client.rpc('list_moderation_rating_note_dispositions', {
      requested_member_id: memberId,
      requested_place_id: placeId
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isDispositionRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        id: row.id,
        dispositionKind: row.disposition_kind,
        notes: row.notes,
        moderatorId: row.moderator_id,
        occurredAt: row.occurred_at
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function excludeRating(
  client: DogFriendlinessRpcClient,
  memberId: string,
  placeId: string,
  exclusionKind: RatingExclusionKind,
  reason: string,
  requestId: string
): Promise<DogFriendlinessCommandResult<{ ratingId: string; excludedAt: string }>> {
  try {
    const { data, error } = await client.rpc('exclude_dog_friendliness_rating', {
      requested_member_id: memberId,
      requested_place_id: placeId,
      exclusion_kind: exclusionKind,
      reason,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isExclusionRow(row)) return { status: 'infrastructure_error' };
    return { status: 'success', value: { ratingId: row.id, excludedAt: row.excluded_at } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function reinstateRating(
  client: DogFriendlinessRpcClient,
  memberId: string,
  placeId: string,
  reason: string,
  requestId: string
): Promise<DogFriendlinessCommandResult<{ ratingId: string; reinstatedAt: string }>> {
  try {
    const { data, error } = await client.rpc('reinstate_dog_friendliness_rating', {
      requested_member_id: memberId,
      requested_place_id: placeId,
      reason,
      command_request_id: requestId
    });
    if (error) return { status: mapError(error.code) };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isReinstatementRow(row)) return { status: 'infrastructure_error' };
    return { status: 'success', value: { ratingId: row.id, reinstatedAt: row.reinstated_at } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<DogFriendlinessCommandResult<never>['status'], 'success'> {
  if (code === '55006' || code === '23505') return 'conflict';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScoreOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value));
}

const privateRatingNoteClassifications = new Set<PrivateRatingNoteClassification>([
  'subjective',
  'inaccurate_info',
  'safety_concern'
]);

function isClassificationOrNull(value: unknown): value is PrivateRatingNoteClassification | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      privateRatingNoteClassifications.has(value as PrivateRatingNoteClassification))
  );
}

interface SubmitRow {
  id: string;
  place_id: string;
  overall_score?: number | null;
  welcome_score: number | null;
  clarity_score: number | null;
  comfort_score: number | null;
  thoughtfulness_score: number | null;
  rated_at: string;
  private_note: string | null;
  private_note_updated_at: string | null;
}

function isSubmitRow(value: unknown): value is SubmitRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.place_id === 'string' &&
    (value.overall_score === undefined || isScoreOrNull(value.overall_score)) &&
    isScoreOrNull(value.welcome_score) &&
    isScoreOrNull(value.clarity_score) &&
    isScoreOrNull(value.comfort_score) &&
    isScoreOrNull(value.thoughtfulness_score) &&
    typeof value.rated_at === 'string' &&
    (value.private_note === null || typeof value.private_note === 'string') &&
    (value.private_note_updated_at === null || typeof value.private_note_updated_at === 'string')
  );
}

function toCurrentRating(row: SubmitRow): CurrentRating {
  return {
    id: row.id,
    placeId: row.place_id,
    overallScore: row.overall_score ?? null,
    scores: {
      welcome: row.welcome_score,
      clarity: row.clarity_score,
      comfort: row.comfort_score,
      thoughtfulness: row.thoughtfulness_score
    },
    ratedAt: row.rated_at,
    privateNote: row.private_note,
    privateNoteUpdatedAt: row.private_note_updated_at
  };
}

interface ModerationRow {
  id: string;
  member_id: string;
  overall_score?: number | null;
  welcome_score: number | null;
  clarity_score: number | null;
  comfort_score: number | null;
  thoughtfulness_score: number | null;
  rated_at: string;
  excluded_at: string | null;
  excluded_kind: RatingExclusionKind | null;
  excluded_reason: string | null;
  private_note: string | null;
  private_note_classification: PrivateRatingNoteClassification | null;
  private_note_updated_at: string | null;
  linked_report_id: string | null;
}

const exclusionKinds = new Set<RatingExclusionKind>(['abuse', 'fraud', 'duplication']);

function isExclusionKindOrNull(value: unknown): value is RatingExclusionKind | null {
  return (
    value === null ||
    (typeof value === 'string' && exclusionKinds.has(value as RatingExclusionKind))
  );
}

function isModerationRow(value: unknown): value is ModerationRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.member_id === 'string' &&
    (value.overall_score === undefined || isScoreOrNull(value.overall_score)) &&
    isScoreOrNull(value.welcome_score) &&
    isScoreOrNull(value.clarity_score) &&
    isScoreOrNull(value.comfort_score) &&
    isScoreOrNull(value.thoughtfulness_score) &&
    typeof value.rated_at === 'string' &&
    (value.excluded_at === null || typeof value.excluded_at === 'string') &&
    isExclusionKindOrNull(value.excluded_kind) &&
    (value.excluded_reason === null || typeof value.excluded_reason === 'string') &&
    (value.private_note === null || typeof value.private_note === 'string') &&
    isClassificationOrNull(value.private_note_classification) &&
    (value.private_note_updated_at === null || typeof value.private_note_updated_at === 'string') &&
    (value.linked_report_id === null || typeof value.linked_report_id === 'string')
  );
}

interface PolicyRow {
  enabled: boolean;
  low_score_threshold: number | null;
}

function isPolicyRow(value: unknown): value is PolicyRow {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    (value.low_score_threshold === null || Number.isInteger(value.low_score_threshold))
  );
}

interface ReportLinkRow {
  flag_id: string;
  status: string;
  submitted_at: string;
}

function isReportLinkRow(value: unknown): value is ReportLinkRow {
  return (
    isRecord(value) &&
    typeof value.flag_id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.submitted_at === 'string'
  );
}

const noteHistoryEventKinds = new Set(['submitted', 'updated', 'note_updated', 'report_linked']);

interface NoteHistoryRow {
  event_kind: 'submitted' | 'updated' | 'note_updated' | 'report_linked';
  private_note: string | null;
  private_note_classification: PrivateRatingNoteClassification | null;
  occurred_at: string;
}

function isNoteHistoryRow(value: unknown): value is NoteHistoryRow {
  return (
    isRecord(value) &&
    typeof value.event_kind === 'string' &&
    noteHistoryEventKinds.has(value.event_kind) &&
    (value.private_note === null || typeof value.private_note === 'string') &&
    isClassificationOrNull(value.private_note_classification) &&
    typeof value.occurred_at === 'string'
  );
}

const dispositionKinds = new Set<RatingNoteDispositionKind>([
  'escalated',
  'feedback_use_permitted',
  'feedback_use_denied'
]);

function isDispositionKind(value: unknown): value is RatingNoteDispositionKind {
  return typeof value === 'string' && dispositionKinds.has(value as RatingNoteDispositionKind);
}

interface DispositionCommandRow {
  id: string;
  occurred_at: string;
}

function isDispositionCommandRow(value: unknown): value is DispositionCommandRow {
  return isRecord(value) && typeof value.id === 'string' && typeof value.occurred_at === 'string';
}

interface DispositionRow {
  id: string;
  disposition_kind: RatingNoteDispositionKind;
  notes: string;
  moderator_id: string;
  occurred_at: string;
}

function isDispositionRow(value: unknown): value is DispositionRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isDispositionKind(value.disposition_kind) &&
    typeof value.notes === 'string' &&
    typeof value.moderator_id === 'string' &&
    typeof value.occurred_at === 'string'
  );
}

interface SummaryRow {
  place_id: string;
  summary_visible: boolean;
  eligible_count: number | null;
  trailing_twelve_month_count: number | null;
  dimensions: unknown;
  overall_mean: number | null;
  overall_visible: boolean;
}

function isSummaryRow(value: unknown): value is SummaryRow {
  return (
    isRecord(value) &&
    typeof value.place_id === 'string' &&
    typeof value.summary_visible === 'boolean' &&
    (value.eligible_count === null || Number.isInteger(value.eligible_count)) &&
    (value.trailing_twelve_month_count === null ||
      Number.isInteger(value.trailing_twelve_month_count)) &&
    (value.overall_mean === null || typeof value.overall_mean === 'number') &&
    typeof value.overall_visible === 'boolean'
  );
}

const dimensionNames = new Set<Dimension>(['welcome', 'clarity', 'comfort', 'thoughtfulness']);

function isDimension(value: unknown): value is Dimension {
  return typeof value === 'string' && dimensionNames.has(value as Dimension);
}

function isDimensionEntry(value: unknown): value is {
  dimension: Dimension;
  applicableCount: number;
  mean: number;
} {
  return (
    isRecord(value) &&
    isDimension(value.dimension) &&
    Number.isInteger(value.applicableCount) &&
    typeof value.mean === 'number'
  );
}

function parseDimensions(value: unknown): SummaryDimension[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDimensionEntry).map((entry) => ({
    dimension: entry.dimension,
    applicableCount: entry.applicableCount,
    mean: entry.mean
  }));
}

interface ExclusionRow {
  id: string;
  excluded_at: string;
}

function isExclusionRow(value: unknown): value is ExclusionRow {
  return isRecord(value) && typeof value.id === 'string' && typeof value.excluded_at === 'string';
}

interface ReinstatementRow {
  id: string;
  reinstated_at: string;
}

function isReinstatementRow(value: unknown): value is ReinstatementRow {
  return isRecord(value) && typeof value.id === 'string' && typeof value.reinstated_at === 'string';
}
