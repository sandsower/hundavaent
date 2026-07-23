import type { RequestSupabaseClient } from '$server/db/clients';
import type {
  FavouriteRecognition,
  QualifyingAction,
  WeeklyRhythmHistoryWeek,
  WeeklyRhythmRecognition,
  WeeklyRhythmWeek
} from '$lib/member-activity/types';

export type WeeklyRhythmResult =
  { status: 'available'; currentWeek: WeeklyRhythmWeek } | { status: 'unavailable' };

export type WeeklyRhythmHistoryResult =
  { status: 'available'; weeks: WeeklyRhythmHistoryWeek[] } | { status: 'unavailable' };

export async function getWeeklyRhythm(client: RequestSupabaseClient): Promise<WeeklyRhythmResult> {
  try {
    const { data, error } = await client.rpc('get_current_member_weekly_rhythm');
    if (error) return { status: 'unavailable' };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isCurrentWeekRow(row)) return { status: 'unavailable' };

    return {
      status: 'available',
      currentWeek: mapCurrentWeek(row)
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function getWeeklyRhythmHistory(
  client: RequestSupabaseClient
): Promise<WeeklyRhythmHistoryResult> {
  try {
    const { data, error } = await client.rpc('list_current_member_weekly_rhythm');
    if (error || !isEightWeekHistory(data)) return { status: 'unavailable' };

    return {
      status: 'available',
      weeks: data.map((row) => ({
        ...mapCurrentWeek(row),
        current: row.current
      }))
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export function mapFavouriteRecognition(row: unknown): FavouriteRecognition | null {
  if (!isRecord(row) || typeof row.first_time_for_place !== 'boolean') {
    return null;
  }

  const recognition = mapWeeklyRhythmRecognitionRow(row, 'favourite', row.first_time_for_place);
  if (!recognition) return null;

  return {
    ...recognition,
    action: 'favourite',
    firstTimeForPlace: row.first_time_for_place
  };
}

export function mapWeeklyRhythmRecognition(
  row: unknown,
  expectedAction: Exclude<QualifyingAction, 'favourite'>
): WeeklyRhythmRecognition | null {
  if (!isRecord(row) || typeof row.qualifying_action_recorded !== 'boolean') return null;
  return mapWeeklyRhythmRecognitionRow(row, expectedAction, row.qualifying_action_recorded);
}

function mapWeeklyRhythmRecognitionRow(
  row: Record<string, unknown>,
  action: QualifyingAction,
  recognized: boolean
): WeeklyRhythmRecognition | null {
  if (
    typeof row.activated_current_week !== 'boolean' ||
    !isDateOnly(row.current_week_starts_on) ||
    !isDateOnly(row.current_week_ends_on) ||
    typeof row.current_week_active !== 'boolean' ||
    dateValue(row.current_week_ends_on)! - dateValue(row.current_week_starts_on)! !==
      6 * dayMilliseconds ||
    !hasMondayToSundayBoundary(row.current_week_starts_on, row.current_week_ends_on) ||
    (row.activated_current_week && !recognized) ||
    (recognized && !row.current_week_active)
  ) {
    return null;
  }

  return {
    action,
    recognized,
    activatedCurrentWeek: row.activated_current_week,
    currentWeek: {
      startsOn: row.current_week_starts_on,
      endsOn: row.current_week_ends_on,
      active: row.current_week_active
    }
  };
}

function isEightWeekHistory(value: unknown): value is Array<{
  starts_on: string;
  ends_on: string;
  current: boolean;
  active: boolean;
}> {
  if (!Array.isArray(value) || value.length !== 8 || !value.every(isHistoryWeekRow)) {
    return false;
  }

  const currentIndexes = value.flatMap((week, index) => (week.current ? [index] : []));
  if (currentIndexes.length !== 1 || currentIndexes[0] !== 7) return false;

  return value.every((week, index) => {
    const startsAt = dateValue(week.starts_on);
    const endsAt = dateValue(week.ends_on);
    if (startsAt === null || endsAt === null || endsAt - startsAt !== 6 * dayMilliseconds) {
      return false;
    }
    if (!hasMondayToSundayBoundary(week.starts_on, week.ends_on)) return false;
    if (index === 0) return true;
    const precedingStart = dateValue(value[index - 1].starts_on);
    return precedingStart !== null && startsAt - precedingStart === 7 * dayMilliseconds;
  });
}

function isCurrentWeekRow(
  value: unknown
): value is { starts_on: string; ends_on: string; active: boolean } {
  if (
    !isRecord(value) ||
    !isDateOnly(value.starts_on) ||
    !isDateOnly(value.ends_on) ||
    typeof value.active !== 'boolean'
  ) {
    return false;
  }

  return (
    dateValue(value.ends_on)! - dateValue(value.starts_on)! === 6 * dayMilliseconds &&
    hasMondayToSundayBoundary(value.starts_on, value.ends_on)
  );
}

function isHistoryWeekRow(
  value: unknown
): value is { starts_on: string; ends_on: string; current: boolean; active: boolean } {
  if (!isRecord(value) || typeof value.current !== 'boolean') return false;
  return isCurrentWeekRow(value);
}

function hasMondayToSundayBoundary(startsOn: string, endsOn: string): boolean {
  return (
    new Date(`${startsOn}T00:00:00.000Z`).getUTCDay() === 1 &&
    new Date(`${endsOn}T00:00:00.000Z`).getUTCDay() === 0
  );
}

function mapCurrentWeek(row: {
  starts_on: string;
  ends_on: string;
  active: boolean;
}): WeeklyRhythmWeek {
  return {
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    active: row.active
  };
}

const dayMilliseconds = 24 * 60 * 60 * 1000;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && dateOnlyPattern.test(value) && dateValue(value) !== null;
}

function dateValue(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
