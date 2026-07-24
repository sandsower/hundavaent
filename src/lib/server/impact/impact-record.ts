export type ImpactContributionKind =
  'accepted_suggestion' | 'applied_correction' | 'confirmed_report';
export type ImpactOutcomeState = 'confirmed' | 'revoked';
export type ImpactPlaceAvailability = 'available' | 'inactive' | 'unavailable';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface ImpactRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export interface ImpactOutcome {
  contributionId: string;
  kind: ImpactContributionKind;
  state: ImpactOutcomeState;
  confirmedAt: string;
  revokedAt: string | null;
  subjectPlaceId: string | null;
  placeName: string | null;
  availability: ImpactPlaceAvailability;
  successorPlaceId: string | null;
  successorName: string | null;
  successorAvailable: boolean;
  suggestionId: string | null;
  placeFlagId: string | null;
}

export interface ImpactRecord {
  memberSince: string;
  activeWeeks: number;
  activeMonths: number;
  creditedPlaces: number;
  creditedCategoryGroups: number;
  creditedMunicipalities: number;
  validRatings: number;
  submissionsTotal: number;
  pendingSubmissions: number;
  rejectedSubmissions: number;
  resolvedWithoutContribution: number;
  confirmedContributions: number;
  revokedContributions: number;
  recentOutcomes: ImpactOutcome[];
}

export type ImpactCommandResult =
  | { status: 'success'; value: ImpactRecord }
  | { status: 'forbidden' | 'invalid' | 'infrastructure_error' };

const recordKeys = [
  'member_since',
  'active_weeks',
  'active_months',
  'credited_places',
  'credited_category_groups',
  'credited_municipalities',
  'valid_ratings',
  'submissions_total',
  'pending_submissions',
  'rejected_submissions',
  'resolved_without_contribution',
  'confirmed_contributions',
  'revoked_contributions',
  'recent_outcomes'
] as const;

const outcomeKeys = [
  'contribution_id',
  'kind',
  'state',
  'confirmed_at',
  'revoked_at',
  'subject_place_id',
  'place_name',
  'availability',
  'successor_place_id',
  'successor_name',
  'successor_available',
  'suggestion_id',
  'place_flag_id'
] as const;

const countKeys = [
  'active_weeks',
  'active_months',
  'credited_places',
  'credited_category_groups',
  'credited_municipalities',
  'valid_ratings',
  'submissions_total',
  'pending_submissions',
  'rejected_submissions',
  'resolved_without_contribution',
  'confirmed_contributions',
  'revoked_contributions'
] as const;

export async function getMyImpactRecord(
  client: ImpactRpcClient,
  locale: 'is' | 'en'
): Promise<ImpactCommandResult> {
  try {
    const { data, error } = await client.rpc('get_my_impact_record', {
      requested_locale: locale
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length !== 1) {
      return { status: 'infrastructure_error' };
    }

    const record = parseRecord(data[0]);
    return record ? { status: 'success', value: record } : { status: 'infrastructure_error' };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function parseRecord(value: unknown): ImpactRecord | null {
  if (
    !isExactRecord(value, recordKeys) ||
    !isDateTime(value.member_since) ||
    !countKeys.every((key) => isNonnegativeInteger(value[key])) ||
    !Array.isArray(value.recent_outcomes) ||
    value.recent_outcomes.length > 6
  ) {
    return null;
  }

  const outcomes = value.recent_outcomes.map(parseOutcome);
  if (outcomes.some((outcome) => outcome === null)) return null;

  return {
    memberSince: value.member_since,
    activeWeeks: value.active_weeks as number,
    activeMonths: value.active_months as number,
    creditedPlaces: value.credited_places as number,
    creditedCategoryGroups: value.credited_category_groups as number,
    creditedMunicipalities: value.credited_municipalities as number,
    validRatings: value.valid_ratings as number,
    submissionsTotal: value.submissions_total as number,
    pendingSubmissions: value.pending_submissions as number,
    rejectedSubmissions: value.rejected_submissions as number,
    resolvedWithoutContribution: value.resolved_without_contribution as number,
    confirmedContributions: value.confirmed_contributions as number,
    revokedContributions: value.revoked_contributions as number,
    recentOutcomes: outcomes as ImpactOutcome[]
  };
}

function parseOutcome(value: unknown): ImpactOutcome | null {
  if (
    !isExactRecord(value, outcomeKeys) ||
    !isUuid(value.contribution_id) ||
    !isContributionKind(value.kind) ||
    !isOutcomeState(value.state) ||
    !isDateTime(value.confirmed_at) ||
    !isNullableDateTime(value.revoked_at) ||
    !isNullableUuid(value.subject_place_id) ||
    !isNullableString(value.place_name) ||
    !isAvailability(value.availability) ||
    !isNullableUuid(value.successor_place_id) ||
    !isNullableString(value.successor_name) ||
    typeof value.successor_available !== 'boolean' ||
    !isNullableUuid(value.suggestion_id) ||
    !isNullableUuid(value.place_flag_id)
  ) {
    return null;
  }

  if (
    (value.state === 'confirmed' && value.revoked_at !== null) ||
    (value.state === 'revoked' && value.revoked_at === null) ||
    (value.revoked_at !== null &&
      Date.parse(value.revoked_at as string) < Date.parse(value.confirmed_at as string)) ||
    (value.successor_place_id === null) !== (value.successor_name === null) ||
    (value.successor_place_id === null && value.successor_available) ||
    (value.subject_place_id === null &&
      (value.place_name !== null ||
        value.availability !== 'unavailable' ||
        value.successor_place_id !== null)) ||
    (value.availability === 'available' && value.subject_place_id === null) ||
    (value.place_name !== null && value.place_name.trim().length === 0) ||
    (value.successor_name !== null && value.successor_name.trim().length === 0) ||
    (value.kind === 'accepted_suggestion' &&
      (value.suggestion_id === null || value.place_flag_id !== null)) ||
    (value.kind !== 'accepted_suggestion' &&
      (value.suggestion_id !== null || value.place_flag_id === null))
  ) {
    return null;
  }

  return {
    contributionId: value.contribution_id,
    kind: value.kind,
    state: value.state,
    confirmedAt: value.confirmed_at,
    revokedAt: value.revoked_at,
    subjectPlaceId: value.subject_place_id,
    placeName: value.place_name,
    availability: value.availability,
    successorPlaceId: value.successor_place_id,
    successorName: value.successor_name,
    successorAvailable: value.successor_available,
    suggestionId: value.suggestion_id,
    placeFlagId: value.place_flag_id
  };
}

function isExactRecord<K extends string>(
  value: unknown,
  expectedKeys: readonly K[]
): value is Record<K, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isContributionKind(value: unknown): value is ImpactContributionKind {
  return (
    value === 'accepted_suggestion' ||
    value === 'applied_correction' ||
    value === 'confirmed_report'
  );
}

function isOutcomeState(value: unknown): value is ImpactOutcomeState {
  return value === 'confirmed' || value === 'revoked';
}

function isAvailability(value: unknown): value is ImpactPlaceAvailability {
  return value === 'available' || value === 'inactive' || value === 'unavailable';
}

function mapError(code: string | undefined): Exclude<ImpactCommandResult['status'], 'success'> {
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}
