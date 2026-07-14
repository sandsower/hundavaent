import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import {
  buildPersonalCheckInPage,
  buildPersonalPlacePage,
  listPersonalCheckIns,
  listPersonalPlaces,
  type PersonalCheckIn,
  type PersonalPlace
} from '$server/personal-history/personal-history';

function createClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string) => responses[name]);
  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

const placeRow = {
  place_id: '87000000-0000-4000-8000-000000000001',
  name: 'History Predecessor',
  category: 'cafe',
  locality: 'Reykjavík',
  latitude: 64.147,
  longitude: -21.933,
  is_favourite: true,
  favourited_at: '2026-07-01T10:00:00Z',
  visit_count: 2,
  first_visited_at: '2026-06-01T09:00:00Z',
  last_visited_at: '2026-07-10T09:00:00Z',
  last_activity_at: '2026-07-10T09:00:00Z',
  availability: 'inactive',
  successor_place_id: '87000000-0000-4000-8000-000000000002',
  successor_name: 'History Successor',
  successor_available: false
};

const checkInRow = {
  check_in_id: '90000000-0000-4000-8000-000000000009',
  place_id: '87000000-0000-4000-8000-000000000003',
  name: 'Repeat-visit Park',
  category: 'park',
  locality: 'Reykjavík',
  latitude: 64.132,
  longitude: -21.902,
  checked_in_at: '2026-07-11T09:00:00Z',
  availability: 'available',
  successor_place_id: null,
  successor_name: null,
  successor_available: null
};

describe('Personal history server boundary', () => {
  it('maps the combined Favourite/visited/map projection, including successor identity', async () => {
    const { client, rpc } = createClient({
      list_personal_places: { data: [placeRow], error: null }
    });

    const result = await listPersonalPlaces(client, 'en', {
      filter: 'all',
      limit: 25,
      beforeActivityAt: '2026-07-12T00:00:00Z',
      beforePlaceId: '87000000-0000-4000-8000-000000000004'
    });

    expect(result).toEqual({
      status: 'success',
      value: [
        {
          placeId: placeRow.place_id,
          name: placeRow.name,
          category: 'cafe',
          locality: placeRow.locality,
          latitude: placeRow.latitude,
          longitude: placeRow.longitude,
          isFavourite: true,
          favouritedAt: placeRow.favourited_at,
          visitCount: 2,
          firstVisitedAt: placeRow.first_visited_at,
          lastVisitedAt: placeRow.last_visited_at,
          lastActivityAt: placeRow.last_activity_at,
          availability: 'inactive',
          successorPlaceId: placeRow.successor_place_id,
          successorName: placeRow.successor_name,
          successorAvailable: false
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_personal_places', {
      requested_locale: 'en',
      requested_filter: 'all',
      requested_limit: 25,
      requested_before_activity_at: '2026-07-12T00:00:00Z',
      requested_before_place_id: '87000000-0000-4000-8000-000000000004'
    });
  });

  it('reports authentication_required for a signed-out or non-Member caller', async () => {
    const { client } = createClient({
      list_personal_places: { data: null, error: { code: '42501', message: 'denied' } }
    });

    await expect(listPersonalPlaces(client, 'en', { filter: 'all', limit: 25 })).resolves.toEqual({
      status: 'authentication_required'
    });
  });

  it('rejects a malformed row as an invalid_response rather than trusting it', async () => {
    const { client } = createClient({
      list_personal_places: { data: [{ place_id: '' }], error: null }
    });

    await expect(
      listPersonalPlaces(client, 'en', { filter: 'favourite', limit: 25 })
    ).resolves.toEqual({ status: 'invalid_response' });
  });

  it('retains unavailable personal history while accepting a fully withheld coordinate pair', async () => {
    const withheldPlaceRow = {
      ...placeRow,
      latitude: null,
      longitude: null,
      availability: 'unavailable'
    };
    const withheldCheckInRow = {
      ...checkInRow,
      latitude: null,
      longitude: null,
      availability: 'unavailable'
    };
    const { client } = createClient({
      list_personal_places: { data: [withheldPlaceRow], error: null },
      list_personal_check_ins: { data: [withheldCheckInRow], error: null }
    });

    await expect(listPersonalPlaces(client, 'en', { filter: 'all', limit: 25 })).resolves.toEqual({
      status: 'success',
      value: [expect.objectContaining({ latitude: null, longitude: null })]
    });
    await expect(listPersonalCheckIns(client, 'en', { limit: 25 })).resolves.toEqual({
      status: 'success',
      value: [expect.objectContaining({ latitude: null, longitude: null })]
    });
  });

  it('rejects partial coordinate withholding and available rows without coordinates', async () => {
    const partialClient = createClient({
      list_personal_places: {
        data: [{ ...placeRow, latitude: null, availability: 'unavailable' }],
        error: null
      }
    }).client;
    const availableClient = createClient({
      list_personal_check_ins: {
        data: [{ ...checkInRow, latitude: null, longitude: null }],
        error: null
      }
    }).client;

    await expect(
      listPersonalPlaces(partialClient, 'en', { filter: 'all', limit: 25 })
    ).resolves.toEqual({ status: 'invalid_response' });
    await expect(listPersonalCheckIns(availableClient, 'en', { limit: 25 })).resolves.toEqual({
      status: 'invalid_response'
    });
  });

  it('maps the chronological Check-in log using only the Place public Location', async () => {
    const { client, rpc } = createClient({
      list_personal_check_ins: { data: [checkInRow], error: null }
    });

    const result = await listPersonalCheckIns(client, 'is', { limit: 25 });

    expect(result).toEqual({
      status: 'success',
      value: [
        {
          checkInId: checkInRow.check_in_id,
          placeId: checkInRow.place_id,
          name: checkInRow.name,
          category: 'park',
          locality: checkInRow.locality,
          latitude: checkInRow.latitude,
          longitude: checkInRow.longitude,
          checkedInAt: checkInRow.checked_in_at,
          availability: 'available',
          successorPlaceId: null,
          successorName: null,
          successorAvailable: false
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_personal_check_ins', {
      requested_locale: 'is',
      requested_limit: 25,
      requested_before_checked_in_at: undefined,
      requested_before_check_in_id: undefined
    });
  });

  it('reports infrastructure_error on an unexpected RPC failure', async () => {
    const { client } = createClient({
      list_personal_check_ins: { data: null, error: { code: '500', message: 'boom' } }
    });

    await expect(listPersonalCheckIns(client, 'en', { limit: 25 })).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});

describe('Personal Place keyset pagination', () => {
  const places: PersonalPlace[] = Array.from({ length: 3 }, (_, index) => ({
    placeId: `place-${index}`,
    name: `Place ${index}`,
    category: 'cafe',
    locality: 'Reykjavík',
    latitude: 64,
    longitude: -21,
    isFavourite: true,
    favouritedAt: '2026-07-01T00:00:00Z',
    visitCount: null,
    firstVisitedAt: null,
    lastVisitedAt: null,
    lastActivityAt: `2026-07-0${3 - index}T00:00:00Z`,
    availability: 'available',
    successorPlaceId: null,
    successorName: null,
    successorAvailable: false
  }));

  it('returns a next cursor only when a page boundary is crossed', () => {
    const page = buildPersonalPlacePage(places, 2);
    expect(page.places).toHaveLength(2);
    expect(page.nextCursor).toEqual({
      beforeActivityAt: places[1].lastActivityAt,
      beforePlaceId: places[1].placeId
    });
  });

  it('returns no next cursor once every row fits on the page', () => {
    const page = buildPersonalPlacePage(places, 10);
    expect(page.places).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });
});

describe('Personal Check-in keyset pagination', () => {
  const checkIns: PersonalCheckIn[] = Array.from({ length: 2 }, (_, index) => ({
    checkInId: `check-in-${index}`,
    placeId: `place-${index}`,
    name: `Place ${index}`,
    category: 'park',
    locality: 'Reykjavík',
    latitude: 64,
    longitude: -21,
    checkedInAt: `2026-07-0${2 - index}T00:00:00Z`,
    availability: 'available',
    successorPlaceId: null,
    successorName: null,
    successorAvailable: false
  }));

  it('returns a next cursor only when a page boundary is crossed', () => {
    const page = buildPersonalCheckInPage(checkIns, 1);
    expect(page.checkIns).toHaveLength(1);
    expect(page.nextCursor).toEqual({
      beforeCheckedInAt: checkIns[0].checkedInAt,
      beforeCheckInId: checkIns[0].checkInId
    });
  });

  it('returns no next cursor once every row fits on the page', () => {
    const page = buildPersonalCheckInPage(checkIns, 10);
    expect(page.checkIns).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});
