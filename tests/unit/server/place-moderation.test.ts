import { describe, expect, it, vi } from 'vitest';

import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import type { CallerScopedSupabaseClient } from '$server/auth/session';
import type { RequestSupabaseClient } from '$server/db/clients';
import type { Json } from '$server/db/generated.types';
import {
  createCandidatePlace,
  type CandidatePlaceCommand,
  getCandidatePublicationReview,
  type LocationCorrectionCommand,
  type PublishPlaceCommand,
  updateCandidatePlaceLocation,
  verifyAndPublish
} from '$server/moderation/place-moderation';

function createClient({
  userId,
  hasRole = false,
  userError = null,
  roleError = null
}: {
  userId: string | null;
  hasRole?: boolean;
  userError?: { message: string; name?: string } | null;
  roleError?: { message: string } | null;
}) {
  const getUser = vi.fn(async () => ({
    data: { user: userId === null ? null : { id: userId } },
    error: userError
  }));
  const rpc = vi.fn(async () => ({ data: hasRole, error: roleError }));

  return {
    client: { auth: { getUser }, rpc } as CallerScopedSupabaseClient,
    getUser,
    rpc
  };
}

describe('requireRole', () => {
  it('reports an unauthenticated caller without attempting role lookup', async () => {
    const { client, rpc } = createClient({ userId: null });

    await expect(requireRole(client, 'moderator')).rejects.toBeInstanceOf(
      AuthenticationRequiredError
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats Supabase's explicit missing-session response as unauthenticated", async () => {
    const { client, rpc } = createClient({
      userId: null,
      userError: {
        name: 'AuthSessionMissingError',
        message: 'Auth session missing!'
      }
    });

    await expect(requireRole(client, 'moderator')).rejects.toBeInstanceOf(
      AuthenticationRequiredError
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports an authenticated caller who lacks the required role', async () => {
    const { client, rpc } = createClient({
      userId: 'member-1',
      hasRole: false
    });

    await expect(requireRole(client, 'moderator')).rejects.toBeInstanceOf(RoleRequiredError);
    expect(rpc).toHaveBeenCalledWith('has_current_user_role', {
      required_role: 'moderator'
    });
  });

  it('returns the authenticated Moderator identity', async () => {
    const { client } = createClient({ userId: 'moderator-1', hasRole: true });

    await expect(requireRole(client, 'moderator')).resolves.toEqual({
      id: 'moderator-1'
    });
  });

  it('redacts provider failures behind a stable unavailable error', async () => {
    const { client } = createClient({
      userId: 'moderator-1',
      roleError: { message: 'database detail that must not escape' }
    });

    await expect(requireRole(client, 'moderator')).rejects.toEqual(
      new AuthenticationUnavailableError()
    );
  });
});

const candidateCommand: CandidatePlaceCommand = {
  operator: { name: 'Candidate operator' },
  location: {
    address_line: 'Tillögugata 7',
    locality: 'Reykjavík',
    postal_code: '101',
    municipality: 'reykjavik',
    latitude: 64.1466,
    longitude: -21.9426,
    geometry_precision: 'moderator_confirmed_point',
    geometry_source: 'Moderator placed the point on the venue entrance'
  },
  category: 'restaurant',
  website_url: null,
  phone: null,
  opening_hours: {},
  translations: {
    is: { name: 'Tillögustaður', description: 'Íslensk lýsing.' },
    en: { name: 'Candidate venue', description: 'English description.' }
  },
  evidence_records: [
    {
      kind: 'official_website',
      source_url: 'https://example.invalid/candidate',
      source_citation: null,
      source_label: 'Official website',
      observed_at: '2026-07-09T10:00:00.000Z',
      source_metadata: {}
    }
  ],
  dog_amenities: [],
  access_conditions: [
    {
      access_area: 'outdoors',
      restraint_condition: 'leash_required',
      dog_eligibility: { scope: 'all_dogs' },
      availability_window: {},
      permission_requirement: 'standing_permission'
    }
  ]
};

function createModerationClient({
  data = null,
  error = null
}: {
  data?: Array<{ place_id: string; version: number }> | null;
  error?: { code: string; message: string } | null;
}) {
  const rpc = vi.fn(async () => ({ data, error }));

  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

describe('createCandidatePlace', () => {
  it('returns a typed success without exposing the database row shape', async () => {
    const { client, rpc } = createModerationClient({
      data: [{ place_id: 'place-1', version: 1 }]
    });

    await expect(createCandidatePlace(client, candidateCommand, 'request-1')).resolves.toEqual({
      status: 'success',
      value: { placeId: 'place-1', version: 1 }
    });
    expect(rpc).toHaveBeenCalledWith('create_candidate_place', {
      command_payload: candidateCommand,
      command_request_id: 'request-1'
    });
  });

  it.each(['22023', '23502', '23514'])('maps database code %s to validation', async (code) => {
    const { client } = createModerationClient({
      error: { code, message: 'private database validation detail' }
    });

    const result = await createCandidatePlace(client, candidateCommand, 'request-2');

    expect(result).toEqual({ status: 'validation_error' });
    expect(JSON.stringify(result)).not.toContain('private database validation detail');
  });

  it('maps role denial to forbidden', async () => {
    const { client } = createModerationClient({
      error: { code: '42501', message: 'private role detail' }
    });

    await expect(createCandidatePlace(client, candidateCommand, 'request-3')).resolves.toEqual({
      status: 'forbidden'
    });
  });

  it.each(['23505', '40001'])('maps concurrency code %s to conflict', async (code) => {
    const { client } = createModerationClient({
      error: { code, message: 'private conflict detail' }
    });

    await expect(createCandidatePlace(client, candidateCommand, 'request-4')).resolves.toEqual({
      status: 'conflict'
    });
  });

  it('maps unknown failures and malformed success data to infrastructure error', async () => {
    const failedClient = createModerationClient({
      error: { code: 'XX000', message: 'secret provider failure' }
    }).client;
    const malformedClient = createModerationClient({ data: [] }).client;

    const failure = await createCandidatePlace(failedClient, candidateCommand, 'request-5');

    expect(failure).toEqual({ status: 'infrastructure_error' });
    expect(JSON.stringify(failure)).not.toContain('secret provider failure');
    await expect(
      createCandidatePlace(malformedClient, candidateCommand, 'request-6')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});

const correctionCommand: LocationCorrectionCommand = {
  placeId: 'place-1',
  expectedVersion: 1,
  addressLine: 'Aðalstræti 16',
  locality: 'Reykjavík',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: 64.1475091,
  longitude: -21.9420614,
  geometryPrecision: 'official_address_point',
  geometrySource: 'HMS Staðfangaskrá coordinate 10000001'
};

describe('updateCandidatePlaceLocation', () => {
  it('sends one version-checked geometry correction command', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ place_id: 'place-1', geometry_precision: 'official_address_point', version: 2 }],
      error: null
    }));
    const client = { rpc } as unknown as RequestSupabaseClient;

    await expect(
      updateCandidatePlaceLocation(client, correctionCommand, 'request-location')
    ).resolves.toEqual({
      status: 'success',
      value: { placeId: 'place-1', geometryPrecision: 'official_address_point', version: 2 }
    });
    expect(rpc).toHaveBeenCalledWith('update_candidate_place_location', {
      command_payload: {
        place_id: 'place-1',
        expected_version: 1,
        address_line: 'Aðalstræti 16',
        locality: 'Reykjavík',
        postal_code: '101',
        municipality: 'reykjavik',
        latitude: 64.1475091,
        longitude: -21.9420614,
        geometry_precision: 'official_address_point',
        geometry_source: 'HMS Staðfangaskrá coordinate 10000001'
      },
      command_request_id: 'request-location'
    });
  });
});

const publishCommand: PublishPlaceCommand = {
  placeId: 'place-1',
  expectedVersion: 1,
  expectedItemVersion: 3,
  expectedDraftVersion: 2,
  conditionVerifications: [{ accessConditionId: 'condition-1', evidenceIds: ['evidence-1'] }],
  freshnessUntil: '2099-01-01T00:00:00.000Z',
  decisionMetadata: { basis: 'official_source' }
};

function createPublicationClient({
  data = null,
  error = null
}: {
  data?: Array<{
    place_id: string;
    verification_ids: string[];
    version: number;
    published_at: string;
  }> | null;
  error?: { code: string; message: string } | null;
}) {
  const rpc = vi.fn(async () => ({ data, error }));

  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

describe('verifyAndPublish', () => {
  it('returns a typed publication without exposing the database row shape', async () => {
    const { client, rpc } = createPublicationClient({
      data: [
        {
          place_id: 'place-1',
          verification_ids: ['verification-1'],
          version: 2,
          published_at: '2026-07-10T06:30:00.000Z'
        }
      ]
    });

    await expect(verifyAndPublish(client, publishCommand, 'request-7')).resolves.toEqual({
      status: 'success',
      value: {
        placeId: 'place-1',
        verificationIds: ['verification-1'],
        version: 2,
        publishedAt: '2026-07-10T06:30:00.000Z'
      }
    });
    expect(rpc).toHaveBeenCalledWith('verify_and_publish_place', {
      command_payload: {
        place_id: 'place-1',
        expected_version: 1,
        expected_item_version: 3,
        expected_draft_version: 2,
        condition_verifications: [
          { access_condition_id: 'condition-1', evidence_ids: ['evidence-1'] }
        ],
        freshness_until: '2099-01-01T00:00:00.000Z',
        decision_metadata: { basis: 'official_source' }
      },
      command_request_id: 'request-7'
    });
  });

  it.each(['22023', '22007', '23502', '23514'])(
    'maps incomplete publication code %s without leaking detail',
    async (code) => {
      const { client } = createPublicationClient({
        error: { code, message: 'private invariant detail' }
      });

      const result = await verifyAndPublish(client, publishCommand, 'request-8');

      expect(result).toEqual({ status: 'incomplete' });
      expect(JSON.stringify(result)).not.toContain('private invariant detail');
    }
  );

  it('maps optimistic concurrency failure to stale', async () => {
    const { client } = createPublicationClient({
      error: { code: '40001', message: 'private version detail' }
    });

    await expect(verifyAndPublish(client, publishCommand, 'request-9')).resolves.toEqual({
      status: 'stale'
    });
  });

  it('maps role denial to forbidden', async () => {
    const { client } = createPublicationClient({
      error: { code: '42501', message: 'private role detail' }
    });

    await expect(verifyAndPublish(client, publishCommand, 'request-10')).resolves.toEqual({
      status: 'forbidden'
    });
  });

  it('maps Candidate lifecycle failure to not publishable', async () => {
    const { client } = createPublicationClient({
      error: { code: '55000', message: 'private lifecycle detail' }
    });

    await expect(verifyAndPublish(client, publishCommand, 'request-11')).resolves.toEqual({
      status: 'not_publishable'
    });
  });

  it('maps unknown failures, thrown calls, and malformed rows to infrastructure error', async () => {
    const failedClient = createPublicationClient({
      error: { code: 'XX000', message: 'secret provider failure' }
    }).client;
    const malformedClient = createPublicationClient({ data: [] }).client;
    const thrownClient = {
      rpc: vi.fn(async () => {
        throw new Error('network detail');
      })
    } as unknown as RequestSupabaseClient;

    const failure = await verifyAndPublish(failedClient, publishCommand, 'request-12');

    expect(failure).toEqual({ status: 'infrastructure_error' });
    expect(JSON.stringify(failure)).not.toContain('secret provider failure');
    await expect(verifyAndPublish(malformedClient, publishCommand, 'request-13')).resolves.toEqual({
      status: 'infrastructure_error'
    });
    await expect(verifyAndPublish(thrownClient, publishCommand, 'request-14')).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});

function createReviewClient({
  data = null,
  error = null
}: {
  data?: Array<{
    place_id: string;
    version: number;
    lifecycle: string;
    candidate_status: string;
    item_version: number;
    draft_version: number;
    draft_payload: Json | null;
    draft_updated_by: string | null;
    draft_updated_at: string | null;
    readiness_state: string;
    readiness_issues: Json;
    originating_suggestion_id: string | null;
    contributor_id: string | null;
    operator_name: string;
    category: string;
    website_url: string | null;
    phone: string | null;
    opening_hours: Json;
    dog_amenities: Json;
    address_line: string;
    locality: string;
    postal_code: string;
    municipality: string;
    latitude: number;
    longitude: number;
    geometry_precision: string;
    geometry_source: string;
    name_is: string | null;
    description_is: string | null;
    name_en: string | null;
    description_en: string | null;
    access_conditions: Json;
    evidence_records: Json;
  }> | null;
  error?: { code: string; message: string } | null;
}) {
  const rpc = vi.fn(async () => ({ data, error }));

  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

const completeReviewRow = {
  place_id: 'place-1',
  version: 1,
  lifecycle: 'candidate',
  candidate_status: 'pending',
  item_version: 2,
  draft_version: 1,
  draft_payload: { translations: { en: { name: 'Candidate venue' } } },
  draft_updated_by: 'moderator-1',
  draft_updated_at: '2026-07-21T20:00:00Z',
  readiness_state: 'ready',
  readiness_issues: [],
  originating_suggestion_id: 'suggestion-1',
  contributor_id: 'member-1',
  operator_name: 'Candidate operator',
  category: 'restaurant',
  website_url: 'https://example.invalid/place',
  phone: '+354 555 0100',
  opening_hours: { monday: ['09:00', '17:00'] },
  dog_amenities: ['water_bowl'],
  address_line: 'Tillögugata 7',
  locality: 'Reykjavík',
  postal_code: '101',
  municipality: 'reykjavik',
  latitude: 64.1466,
  longitude: -21.9426,
  geometry_precision: 'official_address_point',
  geometry_source: 'HMS Staðfangaskrá coordinate 10000001',
  name_is: 'Tillögustaður',
  description_is: 'Íslensk lýsing.',
  name_en: 'Candidate venue',
  description_en: 'English description.',
  access_conditions: [
    {
      id: 'condition-1',
      accessArea: 'outdoors',
      accessAreaNote: null,
      restraintCondition: 'leash_required',
      restraintNote: null,
      dogEligibility: { scope: 'all_dogs' },
      availabilityWindow: {},
      permissionRequirement: 'standing_permission'
    }
  ],
  evidence_records: [
    {
      id: 'evidence-1',
      kind: 'official_website',
      sourceUrl: 'https://example.invalid/source',
      sourceCitation: 'Section 4, patio rule',
      sourceLabel: 'Official website',
      observedAt: '2026-07-09T10:00:00Z',
      sourceMetadata: { section: 'dogs' }
    }
  ]
};

describe('getCandidatePublicationReview', () => {
  it('maps a fixed review row and derives every publication check', async () => {
    const { client, rpc } = createReviewClient({ data: [completeReviewRow] });

    const result = await getCandidatePublicationReview(client, 'place-1');

    expect(result).toMatchObject({
      status: 'success',
      value: {
        placeId: 'place-1',
        version: 1,
        lifecycle: 'candidate',
        candidateStatus: 'pending',
        itemVersion: 2,
        draftVersion: 1,
        draftPayload: { translations: { en: { name: 'Candidate venue' } } },
        draftUpdatedBy: 'moderator-1',
        draftUpdatedAt: '2026-07-21T20:00:00Z',
        readinessState: 'ready',
        readinessIssues: [],
        originatingSuggestionId: 'suggestion-1',
        contributorId: 'member-1',
        websiteUrl: 'https://example.invalid/place',
        phone: '+354 555 0100',
        openingHours: { monday: ['09:00', '17:00'] },
        dogAmenities: ['water_bowl'],
        latitude: 64.1466,
        longitude: -21.9426,
        geometryPrecision: 'official_address_point',
        geometrySource: 'HMS Staðfangaskrá coordinate 10000001',
        accessConditions: [{ id: 'condition-1' }],
        evidenceRecords: [
          {
            id: 'evidence-1',
            kind: 'official_website',
            sourceUrl: 'https://example.invalid/source',
            sourceCitation: 'Section 4, patio rule',
            sourceLabel: 'Official website',
            observedAt: '2026-07-09T10:00:00Z',
            sourceMetadata: { section: 'dogs' }
          }
        ],
        ready: true,
        checks: {
          candidate: true,
          operatorAndCategory: true,
          capitalRegionLocation: true,
          geometryQuality: true,
          icelandicTranslation: true,
          englishTranslation: true,
          accessCondition: true,
          evidence: true
        }
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_moderation_place_review', {
      requested_place_id: 'place-1'
    });
  });

  it('normalizes canonical snake-case draft children into the review DTO', async () => {
    const draftRow = {
      ...completeReviewRow,
      access_conditions: [
        {
          id: 'condition-1',
          access_area: 'outdoors',
          access_area_note: null,
          restraint_condition: 'leash_required',
          restraint_note: null,
          dog_eligibility: { scope: 'all_dogs' },
          availability_state: 'whenever_open',
          availability_window: {},
          permission_requirement: 'standing_permission'
        }
      ],
      evidence_records: [
        {
          id: 'evidence-1',
          kind: 'official_website',
          source_url: 'https://example.invalid/source',
          source_citation: 'Section 4',
          source_label: 'Official website',
          observed_at: '2026-07-09T10:00:00Z',
          source_metadata: { section: 'dogs' }
        }
      ]
    };

    await expect(
      getCandidatePublicationReview(createReviewClient({ data: [draftRow] }).client, 'place-1')
    ).resolves.toMatchObject({
      status: 'success',
      value: {
        accessConditions: [
          {
            id: 'condition-1',
            accessArea: 'outdoors',
            availabilityState: 'whenever_open'
          }
        ],
        evidenceRecords: [
          {
            id: 'evidence-1',
            sourceUrl: 'https://example.invalid/source',
            sourceMetadata: { section: 'dogs' }
          }
        ]
      }
    });
  });

  it('keeps an incomplete review inspectable and not ready', async () => {
    const { client } = createReviewClient({
      data: [
        {
          ...completeReviewRow,
          name_en: null,
          description_en: null,
          access_conditions: [],
          evidence_records: []
        }
      ]
    });

    const result = await getCandidatePublicationReview(client, 'place-1');

    expect(result).toMatchObject({
      status: 'success',
      value: {
        ready: false,
        checks: {
          englishTranslation: false,
          accessCondition: false,
          evidence: false
        }
      }
    });
  });

  it('keeps pending municipality-anchor geometry inspectable but blocks readiness', async () => {
    const { client } = createReviewClient({
      data: [
        {
          ...completeReviewRow,
          geometry_precision: 'municipality_anchor_pending_geocode',
          geometry_source: 'Launch inventory municipality anchor'
        }
      ]
    });

    await expect(getCandidatePublicationReview(client, 'place-1')).resolves.toMatchObject({
      status: 'success',
      value: {
        geometryPrecision: 'municipality_anchor_pending_geocode',
        checks: { geometryQuality: false },
        ready: false
      }
    });
  });

  it('maps absence, role denial, malformed rows, and provider failures safely', async () => {
    const absent = createReviewClient({ data: [] }).client;
    const denied = createReviewClient({
      error: { code: '42501', message: 'private role detail' }
    }).client;
    const failed = createReviewClient({
      error: { code: 'XX000', message: 'secret provider detail' }
    }).client;
    const malformed = createReviewClient({
      data: [{ ...completeReviewRow, version: 0 }]
    }).client;

    await expect(getCandidatePublicationReview(absent, 'missing')).resolves.toEqual({
      status: 'not_found'
    });
    await expect(getCandidatePublicationReview(denied, 'place-1')).resolves.toEqual({
      status: 'forbidden'
    });
    await expect(getCandidatePublicationReview(failed, 'place-1')).resolves.toEqual({
      status: 'infrastructure_error'
    });
    await expect(getCandidatePublicationReview(malformed, 'place-1')).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});
