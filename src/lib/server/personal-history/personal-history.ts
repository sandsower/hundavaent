import type { PlaceCategory } from '$domain/place';
import type { Locale } from '$i18n';
import type { RequestSupabaseClient } from '$server/db/clients';
import type { Database } from '$server/db/generated.types';

// Supabase codegen marks every RPC return column as non-null even when the SQL genuinely returns
// null (favourited_at, visit_count, first/last_visited_at, and the successor_* columns here are
// all nullable). The runtime row validators below are the nullability source of truth; never
// trust these generated types for null-safety.
type GeneratedPersonalPlaceRow =
  Database['public']['Functions']['list_personal_places']['Returns'][number];
type GeneratedPersonalCheckInRow =
  Database['public']['Functions']['list_personal_check_ins']['Returns'][number];
type PersonalPlaceRow = Omit<GeneratedPersonalPlaceRow, 'latitude' | 'longitude'> & {
  latitude: number | null;
  longitude: number | null;
};
type PersonalCheckInRow = Omit<GeneratedPersonalCheckInRow, 'latitude' | 'longitude'> & {
  latitude: number | null;
  longitude: number | null;
};

export type PersonalPlaceAvailability = 'available' | 'unavailable' | 'inactive';
export type PersonalPlaceFilter = 'all' | 'favourite' | 'visited';

export interface PersonalPlace {
  placeId: string;
  name: string;
  category: PlaceCategory;
  locality: string;
  latitude: number | null;
  longitude: number | null;
  isFavourite: boolean;
  favouritedAt: string | null;
  visitCount: number | null;
  firstVisitedAt: string | null;
  lastVisitedAt: string | null;
  lastActivityAt: string;
  availability: PersonalPlaceAvailability;
  successorPlaceId: string | null;
  successorName: string | null;
  successorAvailable: boolean;
}

export interface PersonalCheckIn {
  checkInId: string;
  placeId: string;
  name: string;
  category: PlaceCategory;
  locality: string;
  latitude: number | null;
  longitude: number | null;
  checkedInAt: string;
  availability: PersonalPlaceAvailability;
  successorPlaceId: string | null;
  successorName: string | null;
  successorAvailable: boolean;
}

export interface PersonalPlaceCursor {
  filter: PersonalPlaceFilter;
  limit: number;
  beforeActivityAt?: string | null;
  beforePlaceId?: string | null;
}

export interface PersonalCheckInCursor {
  limit: number;
  beforeCheckedInAt?: string | null;
  beforeCheckInId?: string | null;
}

export type PersonalPlacesResult =
  | { status: 'success'; value: PersonalPlace[] }
  | { status: 'invalid_response' | 'authentication_required' | 'infrastructure_error' };

export type PersonalCheckInsResult =
  | { status: 'success'; value: PersonalCheckIn[] }
  | { status: 'invalid_response' | 'authentication_required' | 'infrastructure_error' };

export interface PersonalPlacePage {
  places: PersonalPlace[];
  nextCursor: { beforeActivityAt: string; beforePlaceId: string } | null;
}

export interface PersonalCheckInPage {
  checkIns: PersonalCheckIn[];
  nextCursor: { beforeCheckedInAt: string; beforeCheckInId: string } | null;
}

export async function listPersonalPlaces(
  client: RequestSupabaseClient,
  locale: Locale,
  cursor: PersonalPlaceCursor
): Promise<PersonalPlacesResult> {
  try {
    const { data, error } = await client.rpc('list_personal_places', {
      requested_locale: locale,
      requested_filter: cursor.filter,
      requested_limit: cursor.limit,
      requested_before_activity_at: cursor.beforeActivityAt ?? undefined,
      requested_before_place_id: cursor.beforePlaceId ?? undefined
    });
    if (error) {
      return error.code === '42501'
        ? { status: 'authentication_required' }
        : { status: 'infrastructure_error' };
    }
    if (!Array.isArray(data) || !data.every(isPersonalPlaceRow)) {
      return { status: 'invalid_response' };
    }
    return { status: 'success', value: data.map(toPersonalPlace) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listPersonalCheckIns(
  client: RequestSupabaseClient,
  locale: Locale,
  cursor: PersonalCheckInCursor
): Promise<PersonalCheckInsResult> {
  try {
    const { data, error } = await client.rpc('list_personal_check_ins', {
      requested_locale: locale,
      requested_limit: cursor.limit,
      requested_before_checked_in_at: cursor.beforeCheckedInAt ?? undefined,
      requested_before_check_in_id: cursor.beforeCheckInId ?? undefined
    });
    if (error) {
      return error.code === '42501'
        ? { status: 'authentication_required' }
        : { status: 'infrastructure_error' };
    }
    if (!Array.isArray(data) || !data.every(isPersonalCheckInRow)) {
      return { status: 'invalid_response' };
    }
    return { status: 'success', value: data.map(toPersonalCheckIn) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export function buildPersonalPlacePage(rows: PersonalPlace[], pageSize: number): PersonalPlacePage {
  const places = rows.slice(0, pageSize);
  const last = places.at(-1) ?? null;

  return {
    places,
    nextCursor:
      rows.length > pageSize && last
        ? { beforeActivityAt: last.lastActivityAt, beforePlaceId: last.placeId }
        : null
  };
}

export function buildPersonalCheckInPage(
  rows: PersonalCheckIn[],
  pageSize: number
): PersonalCheckInPage {
  const checkIns = rows.slice(0, pageSize);
  const last = checkIns.at(-1) ?? null;

  return {
    checkIns,
    nextCursor:
      rows.length > pageSize && last
        ? { beforeCheckedInAt: last.checkedInAt, beforeCheckInId: last.checkInId }
        : null
  };
}

function toPersonalPlace(row: PersonalPlaceRow): PersonalPlace {
  return {
    placeId: row.place_id,
    name: row.name,
    category: row.category as PlaceCategory,
    locality: row.locality,
    latitude: row.latitude,
    longitude: row.longitude,
    isFavourite: row.is_favourite,
    favouritedAt: row.favourited_at,
    visitCount: row.visit_count,
    firstVisitedAt: row.first_visited_at,
    lastVisitedAt: row.last_visited_at,
    lastActivityAt: row.last_activity_at,
    availability: row.availability as PersonalPlaceAvailability,
    successorPlaceId: row.successor_place_id,
    successorName: row.successor_name,
    successorAvailable: row.successor_available === true
  };
}

function toPersonalCheckIn(row: PersonalCheckInRow): PersonalCheckIn {
  return {
    checkInId: row.check_in_id,
    placeId: row.place_id,
    name: row.name,
    category: row.category as PlaceCategory,
    locality: row.locality,
    latitude: row.latitude,
    longitude: row.longitude,
    checkedInAt: row.checked_in_at,
    availability: row.availability as PersonalPlaceAvailability,
    successorPlaceId: row.successor_place_id,
    successorName: row.successor_name,
    successorAvailable: row.successor_available === true
  };
}

const categories = new Set<PlaceCategory>([
  'restaurant',
  'cafe',
  'bar',
  'shop',
  'shopping_centre',
  'accommodation',
  'park',
  'recreation',
  'culture',
  'service',
  'other'
]);
const availabilities = new Set<PersonalPlaceAvailability>(['available', 'unavailable', 'inactive']);

function isPersonalPlaceRow(row: unknown): row is PersonalPlaceRow {
  return (
    isRecord(row) &&
    isNonEmptyString(row.place_id) &&
    isNonEmptyString(row.name) &&
    typeof row.category === 'string' &&
    categories.has(row.category as PlaceCategory) &&
    isNonEmptyString(row.locality) &&
    typeof row.is_favourite === 'boolean' &&
    (row.favourited_at === null || isValidDate(row.favourited_at)) &&
    (row.visit_count === null || Number.isInteger(row.visit_count)) &&
    (row.first_visited_at === null || isValidDate(row.first_visited_at)) &&
    (row.last_visited_at === null || isValidDate(row.last_visited_at)) &&
    isValidDate(row.last_activity_at) &&
    typeof row.availability === 'string' &&
    availabilities.has(row.availability as PersonalPlaceAvailability) &&
    isValidCoordinatePair(
      row.latitude,
      row.longitude,
      row.availability as PersonalPlaceAvailability
    ) &&
    (row.successor_place_id === null || isNonEmptyString(row.successor_place_id)) &&
    (row.successor_name === null || isNonEmptyString(row.successor_name)) &&
    (row.successor_available === null || typeof row.successor_available === 'boolean')
  );
}

function isPersonalCheckInRow(row: unknown): row is PersonalCheckInRow {
  return (
    isRecord(row) &&
    isNonEmptyString(row.check_in_id) &&
    isNonEmptyString(row.place_id) &&
    isNonEmptyString(row.name) &&
    typeof row.category === 'string' &&
    categories.has(row.category as PlaceCategory) &&
    isNonEmptyString(row.locality) &&
    isValidDate(row.checked_in_at) &&
    typeof row.availability === 'string' &&
    availabilities.has(row.availability as PersonalPlaceAvailability) &&
    isValidCoordinatePair(
      row.latitude,
      row.longitude,
      row.availability as PersonalPlaceAvailability
    ) &&
    (row.successor_place_id === null || isNonEmptyString(row.successor_place_id)) &&
    (row.successor_name === null || isNonEmptyString(row.successor_name)) &&
    (row.successor_available === null || typeof row.successor_available === 'boolean')
  );
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

function isValidCoordinatePair(
  latitude: unknown,
  longitude: unknown,
  availability: PersonalPlaceAvailability
): boolean {
  const hasCoordinates =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;

  if (availability === 'available') return hasCoordinates;
  return hasCoordinates || (latitude === null && longitude === null);
}
