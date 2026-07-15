import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import { signPlaceMediaUrls } from '$server/place-media/place-media';
import {
  getPublishedProfile,
  getPublicPlaceStatus,
  listPublished,
  refreshPublishedPhotoUrl
} from '$server/discovery/public-places';

const listRow = {
  place_id: 'place-1',
  name: 'Published Place',
  category: 'cafe',
  locality: 'Reykjavík',
  latitude: 64.1466,
  longitude: -21.9426,
  access_condition_count: 1,
  simple_access_summary: true,
  access_area: 'outdoors',
  restraint_condition: 'leash_required',
  permission_requirement: 'standing_permission',
  access_conditions: [
    {
      accessArea: 'outdoors',
      restraintCondition: 'leash_required',
      permissionRequirement: 'standing_permission',
      dogEligibility: { scope: 'all_dogs' },
      availabilityState: 'not_stated',
      availabilityWindow: {}
    }
  ]
};

const profileRow = {
  place_id: 'place-1',
  name: 'Published Place',
  description: 'A verified Place.',
  category: 'cafe',
  address_line: 'Hundagata 1',
  locality: 'Reykjavík',
  postal_code: '101',
  latitude: 64.1466,
  longitude: -21.9426,
  website_url: 'https://example.invalid/place',
  phone: '+354 555 0101',
  opening_hours: { monday: ['09:00-17:00'] },
  dog_amenities: ['water_bowl'],
  access_condition_id: 'condition-1',
  access_area: 'outdoors',
  access_area_note: null,
  restraint_condition: 'leash_required',
  restraint_note: null,
  dog_eligibility: { scope: 'all_dogs' },
  availability_window: {},
  availability_state: 'not_stated',
  permission_requirement: 'standing_permission',
  access_information_urls: ['https://example.invalid/source']
};

function createClient(
  responses: Partial<
    Record<
      | 'list_published_places'
      | 'list_published_place_primary_photos'
      | 'list_published_place_photos'
      | 'get_published_place_profile'
      | 'get_public_place_status',
      { data: unknown; error: { code: string; message: string } | null }
    >
  >,
  signedUrls: Record<string, string> = {}
) {
  const rpc = vi.fn(
    async (name: keyof typeof responses) =>
      responses[name] ?? { data: null, error: { code: 'XX000', message: 'missing fake' } }
  );

  const createSignedUrl = vi.fn(async (objectPath: string) => ({
    data: signedUrls[objectPath] ? { signedUrl: signedUrls[objectPath] } : null,
    error: signedUrls[objectPath] ? null : { message: 'not signed' }
  }));
  const createSignedUrls = vi.fn(async (objectPaths: string[]) => ({
    data: objectPaths.map((path) => ({
      path,
      signedUrl: signedUrls[path] ?? null,
      error: signedUrls[path] ? null : 'not signed'
    })),
    error: null
  }));

  return {
    client: {
      rpc,
      storage: { from: vi.fn(() => ({ createSignedUrl, createSignedUrls })) }
    } as unknown as RequestSupabaseClient,
    rpc,
    createSignedUrl,
    createSignedUrls
  };
}

describe('listPublished', () => {
  it('maps the fixed localized list projection', async () => {
    const { client, rpc, createSignedUrl, createSignedUrls } = createClient(
      {
        list_published_places: { data: [listRow], error: null },
        list_published_place_primary_photos: {
          data: [
            {
              place_id: 'place-1',
              media_id: 'photo-1',
              storage_bucket: 'place-photos',
              storage_object_path: 'place-1/primary.jpg',
              width_px: 1600,
              height_px: 1200,
              alt_text_is: 'Hundur á kaffihúsi',
              alt_text_en: 'A dog at a cafe',
              rights_basis: 'cc_by',
              source_url: 'https://photos.example.invalid/primary',
              license_reference: 'CC BY 4.0',
              license_url: 'https://creativecommons.org/licenses/by/4.0/',
              attribution_text: 'A. Photographer',
              attribution_url: 'https://photos.example.invalid/a-photographer'
            }
          ],
          error: null
        }
      },
      { 'place-1/primary.jpg': 'https://example.invalid/signed/primary.jpg' }
    );

    await expect(listPublished(client, 'en')).resolves.toEqual({
      status: 'success',
      value: [
        {
          placeId: 'place-1',
          name: 'Published Place',
          category: 'cafe',
          locality: 'Reykjavík',
          latitude: 64.1466,
          longitude: -21.9426,
          accessConditionCount: 1,
          simpleAccessSummary: true,
          accessArea: 'outdoors',
          restraintCondition: 'leash_required',
          permissionRequirement: 'standing_permission',
          accessConditions: [
            {
              accessArea: 'outdoors',
              restraintCondition: 'leash_required',
              permissionRequirement: 'standing_permission',
              dogEligibility: { scope: 'all_dogs' },
              availabilityState: 'not_stated',
              availabilityWindow: {}
            }
          ],
          primaryPhoto: {
            mediaId: 'photo-1',
            url: 'https://example.invalid/signed/primary.jpg',
            widthPx: 1600,
            heightPx: 1200,
            altTextIs: 'Hundur á kaffihúsi',
            altTextEn: 'A dog at a cafe',
            rightsBasis: 'cc_by',
            sourceUrl: 'https://photos.example.invalid/primary',
            licenseReference: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attributionText: 'A. Photographer',
            attributionUrl: 'https://photos.example.invalid/a-photographer',
            urlExpiresAt: expect.any(String)
          },
          verifiedAt: '2026-07-09T11:00:00.000Z'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_published_places', {
      requested_locale: 'en'
    });
    expect(rpc).toHaveBeenCalledWith('list_published_place_primary_photos', {
      requested_place_ids: ['place-1']
    });
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['place-1/primary.jpg'], 300);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('loads primary photo metadata in one batch and degrades individual signing failures', async () => {
    const secondRow = { ...listRow, place_id: 'place-2', name: 'Second Place' };
    const { client, rpc, createSignedUrls } = createClient(
      {
        list_published_places: { data: [listRow, secondRow], error: null },
        list_published_place_primary_photos: {
          data: [
            {
              place_id: 'place-1',
              media_id: 'photo-1',
              storage_bucket: 'place-photos',
              storage_object_path: 'place-1/primary.jpg',
              width_px: 1600,
              height_px: 1200,
              alt_text_is: 'Hundur á kaffihúsi',
              alt_text_en: 'A dog at a cafe',
              rights_basis: 'cc_by',
              source_url: 'https://photos.example.invalid/primary',
              license_reference: 'CC BY 4.0',
              license_url: 'https://creativecommons.org/licenses/by/4.0/',
              attribution_text: 'A. Photographer',
              attribution_url: null
            },
            {
              place_id: 'place-2',
              media_id: 'photo-2',
              storage_bucket: 'place-photos',
              storage_object_path: 'place-2/primary.jpg',
              width_px: 1200,
              height_px: 900,
              alt_text_is: 'Hundur í garði',
              alt_text_en: 'A dog in a park',
              rights_basis: 'explicit_permission',
              source_url: null,
              license_reference: 'Owner supplied',
              license_url: null,
              attribution_text: 'Place owner',
              attribution_url: null
            }
          ],
          error: null
        }
      },
      { 'place-1/primary.jpg': 'https://example.invalid/signed/primary.jpg' }
    );

    const result = await listPublished(client, 'en');

    expect(result).toMatchObject({
      status: 'success',
      value: [{ primaryPhoto: { mediaId: 'photo-1' } }, { primaryPhoto: null }]
    });
    expect(rpc).toHaveBeenCalledWith('list_published_place_primary_photos', {
      requested_place_ids: ['place-1', 'place-2']
    });
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ['place-1/primary.jpg', 'place-2/primary.jpg'],
      300
    );
  });

  it('maps verified condition tuples while preserving null multi-condition summary fields', async () => {
    const multiConditionRow = {
      ...listRow,
      access_condition_count: 2,
      simple_access_summary: false,
      access_area: null,
      restraint_condition: null,
      permission_requirement: null,
      access_conditions: [
        {
          accessArea: 'indoors',
          restraintCondition: 'carrier_required',
          permissionRequirement: 'standing_permission',
          dogEligibility: { scope: 'restricted', maximumWeightKg: 10 },
          availabilityState: 'limited',
          availabilityWindow: { endsAt: '17:00' }
        },
        {
          accessArea: 'outdoors',
          restraintCondition: 'leash_required',
          permissionRequirement: 'ask_on_arrival',
          dogEligibility: { scope: 'all_dogs' },
          availabilityState: 'not_stated',
          availabilityWindow: {}
        }
      ]
    };
    const { client } = createClient({
      list_published_places: { data: [multiConditionRow], error: null }
    });

    await expect(listPublished(client, 'en')).resolves.toEqual({
      status: 'success',
      value: [
        expect.objectContaining({
          accessConditionCount: 2,
          simpleAccessSummary: false,
          accessArea: null,
          restraintCondition: null,
          permissionRequirement: null,
          accessConditions: multiConditionRow.access_conditions
        })
      ]
    });
  });

  it('accepts an empty list, omits invalid coordinates, and rejects malformed public fields', async () => {
    const empty = createClient({
      list_published_places: { data: [], error: null }
    }).client;
    const invalidCoordinates = createClient({
      list_published_places: {
        data: [{ ...listRow, latitude: 'private provider shape' }],
        error: null
      }
    }).client;
    const malformed = createClient({
      list_published_places: {
        data: [{ ...listRow, name: '' }],
        error: null
      }
    }).client;
    const malformedDimensions = createClient({
      list_published_places: {
        data: [
          {
            ...listRow,
            access_conditions: [
              {
                accessArea: 'private_value',
                restraintCondition: 'leash_required',
                permissionRequirement: 'standing_permission',
                dogEligibility: { scope: 'all_dogs' },
                availabilityState: 'not_stated',
                availabilityWindow: {}
              }
            ]
          }
        ],
        error: null
      }
    }).client;

    await expect(listPublished(empty, 'is')).resolves.toEqual({
      status: 'success',
      value: []
    });
    await expect(listPublished(invalidCoordinates, 'is')).resolves.toEqual({
      status: 'success',
      value: []
    });
    await expect(listPublished(malformed, 'is')).resolves.toEqual({
      status: 'invalid_response'
    });
    await expect(listPublished(malformedDimensions, 'is')).resolves.toEqual({
      status: 'invalid_response'
    });
  });

  it('redacts provider and thrown failures', async () => {
    const failed = createClient({
      list_published_places: {
        data: null,
        error: { code: 'XX000', message: 'private database detail' }
      }
    }).client;
    const thrown = {
      rpc: vi.fn(async () => {
        throw new Error('network detail');
      })
    } as unknown as RequestSupabaseClient;

    const failure = await listPublished(failed, 'en');
    expect(failure).toEqual({ status: 'infrastructure_error' });
    expect(JSON.stringify(failure)).not.toContain('private database detail');
    await expect(listPublished(thrown, 'en')).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});

describe('refreshPublishedPhotoUrl', () => {
  it('revalidates the current public projection before refreshing a short-lived URL', async () => {
    const { client, rpc, createSignedUrl } = createClient(
      {
        list_published_place_photos: {
          data: [
            {
              media_id: 'photo-1',
              storage_bucket: 'place-photos',
              storage_object_path: 'place-1/primary.jpg',
              width_px: 1600,
              height_px: 1200,
              alt_text_is: 'Hundur á kaffihúsi',
              alt_text_en: 'A dog at a cafe',
              rights_basis: 'cc_by',
              source_url: 'https://photos.example.invalid/primary',
              license_reference: 'CC BY 4.0',
              license_url: 'https://creativecommons.org/licenses/by/4.0/',
              attribution_text: 'A. Photographer',
              attribution_url: null,
              is_primary: true
            }
          ],
          error: null
        }
      },
      { 'place-1/primary.jpg': 'https://example.invalid/signed/refreshed.jpg' }
    );

    await expect(refreshPublishedPhotoUrl(client, 'place-1', 'photo-1')).resolves.toEqual({
      status: 'success',
      value: {
        url: 'https://example.invalid/signed/refreshed.jpg',
        urlExpiresAt: expect.any(String)
      }
    });
    expect(rpc).toHaveBeenCalledWith('list_published_place_photos', {
      requested_place_id: 'place-1'
    });
    expect(createSignedUrl).toHaveBeenCalledWith('place-1/primary.jpg', 300);
  });

  it('does not sign a photo absent from the current public projection', async () => {
    const { client, createSignedUrl } = createClient({
      list_published_place_photos: { data: [], error: null }
    });

    await expect(refreshPublishedPhotoUrl(client, 'place-1', 'retired-photo')).resolves.toEqual({
      status: 'not_found'
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('signPlaceMediaUrls', () => {
  it('degrades a thrown batch-signing failure to an empty result', async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrls: async () => {
            throw new Error('storage unavailable');
          }
        })
      }
    } as unknown as RequestSupabaseClient;

    await expect(
      signPlaceMediaUrls(client, 'place-photos', ['one.jpg', 'two.jpg'])
    ).resolves.toEqual(new Map());
  });
});

describe('getPublishedProfile', () => {
  it('maps the fixed localized profile and its access facts', async () => {
    const { client, rpc } = createClient({
      get_published_place_profile: { data: [profileRow], error: null }
    });

    const result = await getPublishedProfile(client, 'place-1', 'is');

    expect(result).toMatchObject({
      status: 'success',
      value: {
        placeId: 'place-1',
        name: 'Published Place',
        category: 'cafe',
        location: {
          addressLine: 'Hundagata 1',
          locality: 'Reykjavík',
          postalCode: '101'
        },
        accessConditions: [
          {
            id: 'condition-1',
            availabilityState: 'not_stated',
            accessInformationUrls: ['https://example.invalid/source']
          }
        ],
        accessInformationUrls: ['https://example.invalid/source']
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_published_place_profile', {
      requested_place_id: 'place-1',
      requested_locale: 'is'
    });
  });

  it('returns not found without revealing private Place existence', async () => {
    const { client } = createClient({
      get_published_place_profile: { data: [], error: null }
    });

    await expect(getPublishedProfile(client, 'private-place', 'en')).resolves.toEqual({
      status: 'not_found'
    });
  });

  it('rejects inconsistent rows and redacts provider failures', async () => {
    const malformed = createClient({
      get_published_place_profile: {
        data: [profileRow, { ...profileRow, place_id: 'other-place' }],
        error: null
      }
    }).client;
    const failed = createClient({
      get_published_place_profile: {
        data: null,
        error: { code: 'XX000', message: 'private database detail' }
      }
    }).client;

    await expect(getPublishedProfile(malformed, 'place-1', 'en')).resolves.toEqual({
      status: 'invalid_response'
    });
    await expect(getPublishedProfile(failed, 'place-1', 'en')).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });

  it.each([
    { dog_eligibility: { scope: 'all_dogs', maximumDogs: 1 } },
    { dog_eligibility: { scope: 'restricted' } },
    { dog_eligibility: { scope: 'restricted', maximumDogs: 1, privateNote: 'hidden' } },
    { availability_window: { startsOn: '2026-09-01', endsOn: '2026-06-01' } },
    { availability_window: { days: [] } },
    { availability_window: { startsAt: '10:00', unknownRule: true } }
  ])('returns invalid_response for malformed structured access RPC data', async (override) => {
    const { client } = createClient({
      get_published_place_profile: { data: [{ ...profileRow, ...override }], error: null }
    });

    await expect(getPublishedProfile(client, 'place-1', 'en')).resolves.toEqual({
      status: 'invalid_response'
    });
  });

  it('rejects access-information projections containing undeclared private fields', async () => {
    const { client } = createClient({
      get_published_place_profile: {
        data: [
          {
            ...profileRow,
            access_information_urls: [
              { url: 'https://example.invalid/source', privateModeratorNote: 'never public' }
            ]
          }
        ],
        error: null
      }
    });

    await expect(getPublishedProfile(client, 'place-1', 'en')).resolves.toEqual({
      status: 'invalid_response'
    });
  });
});

describe('getPublicPlaceStatus', () => {
  it('maps only the safe localized identity and public status', async () => {
    const { client, rpc } = createClient({
      get_public_place_status: {
        data: [
          {
            place_id: 'place-1',
            name: 'Published Place',
            public_status: 'access_under_review'
          }
        ],
        error: null
      }
    });

    await expect(getPublicPlaceStatus(client, 'place-1', 'en')).resolves.toEqual({
      status: 'success',
      value: {
        placeId: 'place-1',
        name: 'Published Place',
        publicStatus: 'access_under_review'
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_public_place_status', {
      requested_place_id: 'place-1',
      requested_locale: 'en'
    });
  });

  it('does not reveal Candidates and rejects malformed private statuses', async () => {
    const missing = createClient({
      get_public_place_status: { data: [], error: null }
    }).client;
    const malformed = createClient({
      get_public_place_status: {
        data: [{ place_id: 'place-1', name: 'Place', public_status: 'candidate' }],
        error: null
      }
    }).client;

    await expect(getPublicPlaceStatus(missing, 'place-1', 'en')).resolves.toEqual({
      status: 'not_found'
    });
    await expect(getPublicPlaceStatus(malformed, 'place-1', 'en')).resolves.toEqual({
      status: 'invalid_response'
    });
  });
});
