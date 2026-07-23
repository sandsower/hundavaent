import type { PlaceCategory } from '$domain/place';
import type { Locale } from '$i18n';
import {
  roundupCategories,
  roundupMunicipalities,
  type RoundupMunicipality,
  type RoundupPreferenceInput,
  type RoundupPreferences,
  type RoundupPreferencesResult,
  type RoundupReason,
  type RoundupRecommendation,
  type WeeklyRoundupResult
} from '$lib/roundup/types';

export interface RoundupRpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }>;
}

export async function getWeeklyRoundup(
  client: RoundupRpcClient
): Promise<WeeklyRoundupResult> {
  try {
    const [preferenceResponse, roundupResponse] = await Promise.all([
      client.rpc('get_current_member_roundup_preferences'),
      client.rpc('get_current_member_weekly_roundup')
    ]);
    if (preferenceResponse.error || roundupResponse.error) return { status: 'unavailable' };

    const preferences = mapSinglePreference(preferenceResponse.data);
    const rows = roundupResponse.data;
    if (!preferences || !isRoundupRows(rows, preferences)) {
      return { status: 'unavailable' };
    }

    const first = rows[0];
    const recommendations = rows
      .filter(isRecommendationRow)
      .map(mapRecommendation);

    return {
      status: 'success',
      value: {
        status: !preferences.configured
          ? 'unconfigured'
          : recommendations.length === 0
            ? 'empty'
            : recommendations.length < 3
              ? 'sparse'
              : 'populated',
        preferences,
        week: {
          startsOn: first.week_starts_on,
          endsOn: first.week_ends_on
        },
        recommendations
      }
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function saveRoundupPreferences(
  client: RoundupRpcClient,
  input: RoundupPreferenceInput
): Promise<RoundupPreferencesResult> {
  try {
    const { data, error } = await client.rpc('save_current_member_roundup_preferences', {
      requested_municipalities: input.municipalities,
      requested_categories: input.categories,
      requested_locale: input.roundupLocale,
      requested_email_interest: input.emailInterest
    });
    if (error) return { status: 'unavailable' };
    const preferences = mapSinglePreference(data);
    return preferences?.configured
      ? { status: 'success', value: preferences }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function mapSinglePreference(value: unknown): RoundupPreferences | null {
  if (!Array.isArray(value) || value.length !== 1 || !isPreferenceRow(value[0])) {
    return null;
  }
  const row = value[0];
  return {
    configured: row.configured,
    municipalities: row.municipalities,
    categories: row.categories,
    roundupLocale: row.roundup_locale,
    emailInterest: row.email_interest,
    emailInterestChangedAt: row.email_interest_changed_at,
    updatedAt: row.updated_at
  };
}

function isPreferenceRow(value: unknown): value is {
  configured: boolean;
  municipalities: RoundupMunicipality[];
  categories: PlaceCategory[];
  roundup_locale: Locale;
  email_interest: boolean;
  email_interest_changed_at: string | null;
  updated_at: string | null;
} {
  if (!isRecord(value)) return false;

  const configured = value.configured;
  const municipalities = value.municipalities;
  const categories = value.categories;
  const locale = value.roundup_locale;
  const emailInterest = value.email_interest;
  const emailChangedAt = value.email_interest_changed_at;
  const updatedAt = value.updated_at;

  if (
    typeof configured !== 'boolean' ||
    !isCanonicalStringArray(municipalities, roundupMunicipalities, configured ? 1 : 0) ||
    !isCanonicalStringArray(categories, roundupCategories, 0) ||
    (locale !== 'is' && locale !== 'en') ||
    typeof emailInterest !== 'boolean' ||
    !isNullableTimestamp(emailChangedAt) ||
    !isNullableTimestamp(updatedAt)
  ) {
    return false;
  }

  if (!configured) {
    return (
      municipalities.length === 0 &&
      categories.length === 0 &&
      locale === 'is' &&
      emailInterest === false &&
      emailChangedAt === null &&
      updatedAt === null
    );
  }

  return emailChangedAt !== null && updatedAt !== null;
}

function isRoundupRows(
  value: unknown,
  preferences: RoundupPreferences
): value is RoundupRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return false;
  if (!value.every(isRoundupRow)) return false;

  const first = value[0];
  if (
    first.configured !== preferences.configured ||
    first.roundup_locale !== preferences.roundupLocale ||
    !isMondayToSunday(first.week_starts_on, first.week_ends_on) ||
    !value.every(
      (row) =>
        row.configured === first.configured &&
        row.roundup_locale === first.roundup_locale &&
        row.week_starts_on === first.week_starts_on &&
        row.week_ends_on === first.week_ends_on
    )
  ) {
    return false;
  }

  const sentinels = value.filter((row) => row.place_id === null);
  if (sentinels.length > 0) {
    return value.length === 1 && isSentinelRow(value[0]);
  }

  if (!preferences.configured || !value.every(isRecommendationRow)) return false;
  return value.every((row, index) => row.recommendation_rank === index + 1);
}

interface RoundupRow {
  configured: boolean;
  week_starts_on: string;
  week_ends_on: string;
  roundup_locale: Locale;
  place_id: string | null;
  place_name: string | null;
  category: PlaceCategory | null;
  municipality: RoundupMunicipality | null;
  recommendation_reason: RoundupReason | null;
  changed_at: string | null;
  recommendation_rank: number | null;
}

function isRoundupRow(value: unknown): value is RoundupRow {
  return (
    isRecord(value) &&
    typeof value.configured === 'boolean' &&
    isDateOnly(value.week_starts_on) &&
    isDateOnly(value.week_ends_on) &&
    (value.roundup_locale === 'is' || value.roundup_locale === 'en') &&
    (value.place_id === null || isUuid(value.place_id)) &&
    (value.place_name === null || hasText(value.place_name)) &&
    (value.category === null ||
      roundupCategories.includes(value.category as PlaceCategory)) &&
    (value.municipality === null ||
      roundupMunicipalities.includes(value.municipality as RoundupMunicipality)) &&
    (value.recommendation_reason === null ||
      value.recommendation_reason === 'newly_published' ||
      value.recommendation_reason === 'updated') &&
    isNullableTimestamp(value.changed_at) &&
    (value.recommendation_rank === null ||
      (typeof value.recommendation_rank === 'number' &&
        Number.isInteger(value.recommendation_rank) &&
        value.recommendation_rank >= 1 &&
        value.recommendation_rank <= 6))
  );
}

function isSentinelRow(row: RoundupRow): boolean {
  return (
    row.place_id === null &&
    row.place_name === null &&
    row.category === null &&
    row.municipality === null &&
    row.recommendation_reason === null &&
    row.changed_at === null &&
    row.recommendation_rank === null
  );
}

function isRecommendationRow(
  row: RoundupRow
): row is RoundupRow & {
  place_id: string;
  place_name: string;
  category: PlaceCategory;
  municipality: RoundupMunicipality;
  recommendation_reason: RoundupReason;
  changed_at: string;
  recommendation_rank: number;
} {
  return (
    row.place_id !== null &&
    row.place_name !== null &&
    row.category !== null &&
    row.municipality !== null &&
    row.recommendation_reason !== null &&
    row.changed_at !== null &&
    row.recommendation_rank !== null
  );
}

function mapRecommendation(row: ReturnTypeGuardedRecommendation): RoundupRecommendation {
  return {
    placeId: row.place_id,
    name: row.place_name,
    category: row.category,
    municipality: row.municipality,
    reason: row.recommendation_reason,
    changedAt: row.changed_at,
    rank: row.recommendation_rank
  };
}

type ReturnTypeGuardedRecommendation = RoundupRow & {
  place_id: string;
  place_name: string;
  category: PlaceCategory;
  municipality: RoundupMunicipality;
  recommendation_reason: RoundupReason;
  changed_at: string;
  recommendation_rank: number;
};

function isCanonicalStringArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  minimumLength: number
): value is T[] {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    value.length > allowed.length ||
    !value.every((item): item is T => typeof item === 'string' && allowed.includes(item as T))
  ) {
    return false;
  }
  return new Set(value).size === value.length && value.join() === [...value].sort().join();
}

function isMondayToSunday(startsOn: string, endsOn: string): boolean {
  const startsAt = dateValue(startsOn);
  const endsAt = dateValue(endsOn);
  return (
    startsAt !== null &&
    endsAt !== null &&
    endsAt - startsAt === 6 * dayMilliseconds &&
    new Date(startsAt).getUTCDay() === 1 &&
    new Date(endsAt).getUTCDay() === 0
  );
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && dateValue(value) !== null;
}

function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : null;
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const dayMilliseconds = 24 * 60 * 60 * 1000;
