import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import {
  getPublishedProfile,
  getPublicPlaceStatus,
  listPublished
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
      permissionRequirement: 'standing_permission'
    }
  ],
  verified_at: '2026-07-09T11:00:00.000Z'
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
  permission_requirement: 'standing_permission',
  evidence_sources: [
    {
      kind: 'official_website',
      sourceUrl: 'https://example.invalid/source',
      sourceCitation: null,
      sourceLabel: 'Official website',
      observedAt: '2026-07-09T10:00:00Z'
    }
  ],
  verified_at: '2026-07-09T11:00:00.000Z',
  freshness_until: '2099-01-01T00:00:00.000Z'
};

function createClient(
  responses: Partial<
    Record<
      'list_published_places' | 'get_published_place_profile' | 'get_public_place_status',
      { data: unknown; error: { code: string; message: string } | null }
    >
  >
) {
  const rpc = vi.fn(
    async (name: keyof typeof responses) =>
      responses[name] ?? { data: null, error: { code: 'XX000', message: 'missing fake' } }
  );

  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

describe('listPublished', () => {
  it('maps the fixed localized list projection', async () => {
    const { client, rpc } = createClient({
      list_published_places: { data: [listRow], error: null }
    });

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
              permissionRequirement: 'standing_permission'
            }
          ],
          verifiedAt: '2026-07-09T11:00:00.000Z'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_published_places', {
      requested_locale: 'en'
    });
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
          permissionRequirement: 'standing_permission'
        },
        {
          accessArea: 'outdoors',
          restraintCondition: 'leash_required',
          permissionRequirement: 'ask_on_arrival'
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
                permissionRequirement: 'standing_permission'
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
            evidenceSources: [
              {
                kind: 'official_website',
                sourceUrl: 'https://example.invalid/source',
                sourceCitation: null,
                sourceLabel: 'Official website',
                observedAt: '2026-07-09T10:00:00Z'
              }
            ],
            freshnessUntil: '2099-01-01T00:00:00.000Z'
          }
        ]
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

  it('rejects Evidence projections containing undeclared private fields', async () => {
    const { client } = createClient({
      get_published_place_profile: {
        data: [
          {
            ...profileRow,
            evidence_sources: [
              { ...profileRow.evidence_sources[0], privateModeratorNote: 'never public' }
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
