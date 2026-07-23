import type { PlaceCategory } from '$domain/place';
import type { Locale } from '$i18n';
import type { RequestSupabaseClient } from '$server/db/clients';
import type { Database } from '$server/db/generated.types';
import {
  mapFavouriteRecognition,
  type FavouriteRecognition
} from '$server/member-activity/weekly-rhythm';

type FavouriteIdRow =
  Database['public']['Functions']['list_current_favourite_ids']['Returns'][number];
type FavouriteRow = Database['public']['Functions']['list_current_favourites']['Returns'][number];
export type FavouriteAvailability = 'available' | 'unavailable' | 'inactive';

export interface SavedPlace {
  placeId: string;
  name: string;
  category: PlaceCategory;
  locality: string;
  savedAt: string;
  availability: FavouriteAvailability;
  successorPlaceId: string | null;
  successorName: string | null;
  successorAvailable: boolean;
}

export interface FavouriteCursor {
  limit: number;
  beforeSavedAt?: string | null;
  beforePlaceId?: string | null;
}

export type FavouriteIdsResult =
  { status: 'success'; value: string[] } | { status: 'invalid_response' | 'infrastructure_error' };

export type SavedPlacesResult =
  | { status: 'success'; value: SavedPlace[] }
  | { status: 'invalid_response' | 'infrastructure_error' };

export interface FavouritePage {
  places: SavedPlace[];
  nextCursor: { beforeSavedAt: string; beforePlaceId: string } | null;
}

export type FavouriteMutationResult =
  | {
      status: 'success';
      value: {
        placeId: string;
        isFavourite: boolean;
        changedAt: string;
        recognition: FavouriteRecognition;
      };
    }
  | { status: 'invalid_response' | 'infrastructure_error' };

export async function listFavouriteIds(client: RequestSupabaseClient): Promise<FavouriteIdsResult> {
  try {
    const { data, error } = await client.rpc('list_current_favourite_ids');
    if (error) return { status: 'infrastructure_error' };
    if (!Array.isArray(data) || !data.every(isFavouriteIdRow)) {
      return { status: 'invalid_response' };
    }
    return { status: 'success', value: data.map((row) => row.place_id) };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listFavourites(
  client: RequestSupabaseClient,
  locale: Locale,
  cursor: FavouriteCursor
): Promise<SavedPlacesResult> {
  try {
    const { data, error } = await client.rpc('list_current_favourites', {
      requested_locale: locale,
      requested_limit: cursor.limit,
      requested_before_saved_at: cursor.beforeSavedAt ?? undefined,
      requested_before_place_id: cursor.beforePlaceId ?? undefined
    });
    if (error) return { status: 'infrastructure_error' };
    if (!Array.isArray(data) || !data.every(isFavouriteRow)) {
      return { status: 'invalid_response' };
    }
    return {
      status: 'success',
      value: data.map((row) => ({
        placeId: row.place_id,
        name: row.name,
        category: row.category as PlaceCategory,
        locality: row.locality,
        savedAt: row.saved_at,
        availability: row.availability as FavouriteAvailability,
        successorPlaceId: row.successor_place_id,
        successorName: row.successor_name,
        successorAvailable: row.successor_available === true
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export function buildFavouritePage(rows: SavedPlace[], pageSize: number): FavouritePage {
  const places = rows.slice(0, pageSize);
  const last = places.at(-1) ?? null;

  return {
    places,
    nextCursor:
      rows.length > pageSize && last
        ? { beforeSavedAt: last.savedAt, beforePlaceId: last.placeId }
        : null
  };
}

export async function setFavourite(
  client: RequestSupabaseClient,
  placeId: string,
  desiredState: boolean
): Promise<FavouriteMutationResult> {
  try {
    const { data, error } = await client.rpc('set_current_favourite', {
      requested_place_id: placeId,
      desired_state: desiredState
    });
    if (error) return { status: 'infrastructure_error' };
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    const recognition = mapFavouriteRecognition(row);
    if (
      !isMutationRow(row) ||
      !recognition ||
      row.place_id !== placeId ||
      row.is_favourite !== desiredState
    ) {
      return { status: 'invalid_response' };
    }
    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        isFavourite: row.is_favourite,
        changedAt: row.changed_at,
        recognition
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
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
const availabilities = new Set<FavouriteAvailability>(['available', 'unavailable', 'inactive']);

function isFavouriteIdRow(row: unknown): row is FavouriteIdRow {
  return isRecord(row) && isNonEmptyString(row.place_id);
}

function isFavouriteRow(row: unknown): row is FavouriteRow {
  return (
    isRecord(row) &&
    isNonEmptyString(row.place_id) &&
    isNonEmptyString(row.name) &&
    typeof row.category === 'string' &&
    categories.has(row.category as PlaceCategory) &&
    isNonEmptyString(row.locality) &&
    isValidDate(row.saved_at) &&
    typeof row.availability === 'string' &&
    availabilities.has(row.availability as FavouriteAvailability) &&
    (row.successor_place_id === null || isNonEmptyString(row.successor_place_id)) &&
    (row.successor_name === null || isNonEmptyString(row.successor_name)) &&
    typeof row.successor_available === 'boolean'
  );
}

function isMutationRow(row: unknown): row is Record<string, unknown> & {
  place_id: string;
  is_favourite: boolean;
  changed_at: string;
} {
  return (
    isRecord(row) &&
    isNonEmptyString(row.place_id) &&
    typeof row.is_favourite === 'boolean' &&
    isValidDate(row.changed_at)
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
