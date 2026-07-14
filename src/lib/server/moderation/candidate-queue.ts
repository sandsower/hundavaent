import type { PlaceCategory } from '$domain/place';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface CandidateQueueRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

export interface ModerationCandidatePlace {
  placeId: string;
  operatorName: string;
  category: PlaceCategory;
  addressLine: string;
  locality: string;
  municipality: string;
  createdAt: string;
}

export interface CandidateQueueCursor {
  createdAt: string;
  placeId: string;
}

export interface CandidateQueuePage {
  items: ModerationCandidatePlace[];
  nextCursor: CandidateQueueCursor | null;
}

export type CandidateQueueResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' | 'invalid' }
  | { status: 'infrastructure_error' };

export async function listModerationCandidatePlaces(
  client: CandidateQueueRpcClient,
  cursor: CandidateQueueCursor | null = null,
  limit = 20
): Promise<CandidateQueueResult<CandidateQueuePage>> {
  try {
    const pageSize = boundedPageSize(limit);
    const { data, error } = await client.rpc('list_moderation_candidate_places', {
      cursor_created_at: cursor?.createdAt ?? null,
      cursor_place_id: cursor?.placeId ?? null,
      requested_limit: pageSize + 1
    });
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || !data.every(isCandidateRow)) {
      return { status: 'infrastructure_error' };
    }
    return {
      status: 'success',
      value: pageFromRows(
        data,
        pageSize,
        (row) => ({
          placeId: row.place_id,
          operatorName: row.operator_name,
          category: row.category,
          addressLine: row.address_line,
          locality: row.locality,
          municipality: row.municipality,
          createdAt: row.created_at
        }),
        (row) => ({ createdAt: row.created_at, placeId: row.place_id })
      )
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<CandidateQueueResult<never>['status'], 'success'> {
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function isPlaceCategory(value: unknown): value is PlaceCategory {
  return (
    value === 'restaurant' ||
    value === 'cafe' ||
    value === 'bar' ||
    value === 'shop' ||
    value === 'shopping_centre' ||
    value === 'accommodation' ||
    value === 'park' ||
    value === 'recreation' ||
    value === 'culture' ||
    value === 'service' ||
    value === 'other'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCandidateRow(value: unknown): value is Record<string, unknown> & {
  place_id: string;
  operator_name: string;
  category: PlaceCategory;
  address_line: string;
  locality: string;
  municipality: string;
  created_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.place_id === 'string' &&
    typeof value.operator_name === 'string' &&
    isPlaceCategory(value.category) &&
    typeof value.address_line === 'string' &&
    typeof value.locality === 'string' &&
    typeof value.municipality === 'string' &&
    typeof value.created_at === 'string'
  );
}

function boundedPageSize(value: number): number {
  return Math.min(Math.max(Math.trunc(value) || 20, 1), 50);
}

function pageFromRows<TRow extends { created_at: string; place_id: string }>(
  rows: TRow[],
  pageSize: number,
  mapItem: (row: TRow) => ModerationCandidatePlace,
  mapCursor: (row: TRow) => CandidateQueueCursor
): CandidateQueuePage {
  return {
    items: rows.slice(0, pageSize).map(mapItem),
    nextCursor: rows.length > pageSize ? mapCursor(rows[pageSize - 1]) : null
  };
}
