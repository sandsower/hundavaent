import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import { loadModerationPendingPhotoPlaces } from '$server/moderation/pending-photo-places';
import { listPlacesWithPendingPhotos } from '$server/place-media/place-media';

/**
 * The Moderator discovery read and the name join over it. The database function knows which Places
 * are holding photos and nothing about what they are called, so everything below is about the seam
 * between those two facts.
 */

const firstPlaceId = '30000000-0000-4000-8000-000000000001';
const secondPlaceId = '30000000-0000-4000-8000-000000000002';

function listRow(placeId: string, count = 2, uploadedAt = '2026-07-26T09:00:00Z') {
  return { place_id: placeId, pending_photo_count: count, newest_uploaded_at: uploadedAt };
}

function reviewRow(placeId: string, nameEn: string) {
  return {
    place_id: placeId,
    version: 1,
    lifecycle: 'published',
    candidate_status: 'published',
    item_version: 1,
    draft_version: 0,
    draft_payload: null,
    draft_updated_by: null,
    draft_updated_at: null,
    readiness_state: 'ready',
    readiness_issues: [],
    originating_suggestion_id: null,
    contributor_id: null,
    wheelchair_accessibility: 'accessible',
    operator_name: 'Fixture operator',
    category: 'cafe',
    website_url: null,
    phone: null,
    opening_hours: {},
    dog_amenities: [],
    address_line: 'Hundagata 1',
    locality: 'Reykjavík',
    postal_code: '101',
    municipality: 'reykjavik',
    latitude: 64.1423,
    longitude: -21.9555,
    geometry_precision: 'moderator_confirmed_point',
    geometry_source: 'Fixture',
    name_is: `${nameEn} IS`,
    description_is: 'Lýsing.',
    name_en: nameEn,
    description_en: 'Description.',
    access_conditions: [],
    evidence_records: [],
    freshness_until: null
  };
}

function client(handlers: Record<string, () => { data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      void args;
      const handler = handlers[name];
      if (!handler) throw new Error(`Unexpected RPC ${name}`);
      return handler();
    })
  } as unknown as RequestSupabaseClient;
}

describe('the Places holding Member photos', () => {
  it('maps the discovery read into identifiers, counts and a newest timestamp', async () => {
    const result = await listPlacesWithPendingPhotos(
      client({
        list_places_with_pending_photos: () => ({
          data: [listRow(firstPlaceId, 3, '2026-07-26T10:00:00Z')],
          error: null
        })
      })
    );

    expect(result).toEqual({
      status: 'success',
      value: [
        {
          placeId: firstPlaceId,
          pendingPhotoCount: 3,
          newestUploadedAt: '2026-07-26T10:00:00Z'
        }
      ]
    });
  });

  it('refuses a row it could not turn into a link a Moderator can follow', async () => {
    const result = await listPlacesWithPendingPhotos(
      client({
        list_places_with_pending_photos: () => ({
          data: [{ place_id: 'not-a-place', pending_photo_count: 1, newest_uploaded_at: 'now' }],
          error: null
        })
      })
    );

    expect(result).toEqual({ status: 'infrastructure_error' });
  });

  it('reports a refusal as forbidden rather than as an outage', async () => {
    const result = await listPlacesWithPendingPhotos(
      client({
        list_places_with_pending_photos: () => ({ data: null, error: { code: '42501' } })
      })
    );

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('names each Place from the review read a Moderator already uses', async () => {
    const reviews = [reviewRow(firstPlaceId, 'Brikk'), reviewRow(secondPlaceId, 'Kaffi Lóa')];
    let call = 0;
    const result = await loadModerationPendingPhotoPlaces(
      client({
        list_places_with_pending_photos: () => ({
          data: [listRow(firstPlaceId), listRow(secondPlaceId, 1)],
          error: null
        }),
        get_moderation_place_review_v2: () => ({ data: [reviews[call++]], error: null })
      })
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(
      result.value.map((place) => [place.placeId, place.nameEn, place.pendingPhotoCount])
    ).toEqual([
      [firstPlaceId, 'Brikk', 2],
      [secondPlaceId, 'Kaffi Lóa', 1]
    ]);
  });

  it('drops a Place whose review cannot be read rather than listing it unnamed', async () => {
    const result = await loadModerationPendingPhotoPlaces(
      client({
        list_places_with_pending_photos: () => ({ data: [listRow(firstPlaceId)], error: null }),
        get_moderation_place_review_v2: () => ({ data: [], error: null })
      })
    );

    expect(result).toEqual({ status: 'success', value: [] });
  });
});
