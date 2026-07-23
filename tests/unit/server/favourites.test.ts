import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import {
  buildFavouritePage,
  listFavouriteIds,
  listFavourites,
  setFavourite,
  type SavedPlace
} from '$server/favourites/favourites';

function createClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string) => responses[name]);
  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

describe('Favourite server boundary', () => {
  it('maps only caller-owned identifiers', async () => {
    const { client, rpc } = createClient({
      list_current_favourite_ids: {
        data: [{ place_id: '30000000-0000-4000-8000-000000000003' }],
        error: null
      }
    });

    await expect(listFavouriteIds(client)).resolves.toEqual({
      status: 'success',
      value: ['30000000-0000-4000-8000-000000000003']
    });
    expect(rpc).toHaveBeenCalledWith('list_current_favourite_ids');
  });

  it('maps a bounded public-safe saved projection and cursor', async () => {
    const row = {
      place_id: '30000000-0000-4000-8000-000000000003',
      name: 'Published Place',
      category: 'park',
      locality: 'Reykjavík',
      saved_at: '2026-07-11T10:00:00Z',
      availability: 'inactive',
      successor_place_id: '30000000-0000-4000-8000-000000000004',
      successor_name: 'Successor Place',
      successor_available: true
    };
    const { client, rpc } = createClient({
      list_current_favourites: { data: [row], error: null }
    });

    await expect(
      listFavourites(client, 'en', {
        limit: 20,
        beforeSavedAt: '2026-07-12T10:00:00Z',
        beforePlaceId: '30000000-0000-4000-8000-000000000004'
      })
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          placeId: row.place_id,
          name: row.name,
          category: 'park',
          locality: row.locality,
          savedAt: row.saved_at,
          availability: 'inactive',
          successorPlaceId: row.successor_place_id,
          successorName: row.successor_name,
          successorAvailable: true
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_current_favourites', {
      requested_before_place_id: '30000000-0000-4000-8000-000000000004',
      requested_before_saved_at: '2026-07-12T10:00:00Z',
      requested_limit: 20,
      requested_locale: 'en'
    });
  });

  it.each([
    [24, [24]],
    [25, [24, 1]],
    [48, [24, 24]],
    [49, [24, 24, 1]]
  ] as const)(
    'paginates %i tied-order rows without skipping or inventing a page',
    (count, sizes) => {
      const source = savedRows(count);
      const pages: SavedPlace[][] = [];
      let remaining = source;

      while (remaining.length > 0) {
        const page = buildFavouritePage(remaining.slice(0, 25), 24);
        pages.push(page.places);
        if (!page.nextCursor) break;
        remaining = remaining.filter(
          (row) =>
            row.savedAt < page.nextCursor!.beforeSavedAt ||
            (row.savedAt === page.nextCursor!.beforeSavedAt &&
              row.placeId < page.nextCursor!.beforePlaceId)
        );
      }

      expect(pages.map((page) => page.length)).toEqual(sizes);
      expect(pages.flat().map((row) => row.placeId)).toEqual(source.map((row) => row.placeId));
    }
  );

  it('applies desired state and rejects malformed provider responses', async () => {
    const success = createClient({
      set_current_favourite: {
        data: [
          {
            place_id: '30000000-0000-4000-8000-000000000003',
            is_favourite: true,
            changed_at: '2026-07-11T10:00:00Z',
            first_time_for_place: true,
            activated_current_week: true,
            current_week_starts_on: '2026-07-06',
            current_week_ends_on: '2026-07-12',
            current_week_active: true
          }
        ],
        error: null
      }
    }).client;
    const malformed = createClient({
      set_current_favourite: { data: [{ private_member_id: 'leak' }], error: null }
    }).client;

    await expect(
      setFavourite(success, '30000000-0000-4000-8000-000000000003', true)
    ).resolves.toEqual({
      status: 'success',
      value: {
        placeId: '30000000-0000-4000-8000-000000000003',
        isFavourite: true,
        changedAt: '2026-07-11T10:00:00Z',
        recognition: {
          action: 'favourite',
          recognized: true,
          firstTimeForPlace: true,
          activatedCurrentWeek: true,
          currentWeek: {
            startsOn: '2026-07-06',
            endsOn: '2026-07-12',
            active: true
          }
        }
      }
    });
    await expect(
      setFavourite(malformed, '30000000-0000-4000-8000-000000000003', true)
    ).resolves.toEqual({ status: 'invalid_response' });
  });

  it('redacts database failures', async () => {
    const failed = createClient({
      list_current_favourite_ids: {
        data: null,
        error: { code: '42501', message: 'private database detail' }
      }
    }).client;

    const result = await listFavouriteIds(failed);
    expect(result).toEqual({ status: 'infrastructure_error' });
    expect(JSON.stringify(result)).not.toContain('private database detail');
  });
});

function savedRows(count: number): SavedPlace[] {
  return Array.from({ length: count }, (_, index) => ({
    placeId: `30000000-0000-4000-8000-${String(999999999999 - index).padStart(12, '0')}`,
    name: `Place ${index + 1}`,
    category: 'park' as const,
    locality: 'Reykjavík',
    savedAt: new Date(Date.UTC(2026, 6, 11, 10, 0, -Math.floor(index / 5))).toISOString(),
    availability: 'available' as const,
    successorPlaceId: null,
    successorName: null,
    successorAvailable: false
  }));
}
