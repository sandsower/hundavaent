import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';

const operations = vi.hoisted(() => ({
  getCandidatePublicationReview: vi.fn(),
  updateModeratedPlaceLocation: vi.fn(),
  updatePlaceWheelchairAccessibility: vi.fn(),
  verifyAndPublish: vi.fn(),
  getModerationPlaceMedia: vi.fn(),
  signPlaceMediaUrl: vi.fn(),
  uploadPlaceMediaObject: vi.fn(),
  registerPlaceMedia: vi.fn(),
  approvePlaceMedia: vi.fn(),
  rejectPlaceMedia: vi.fn(),
  retirePlaceMedia: vi.fn(),
  saveCandidateModerationDraft: vi.fn(),
  decideCandidatePlace: vi.fn()
}));

vi.mock('$server/moderation/moderation-drafts', async (importOriginal) => ({
  ...(await importOriginal()),
  saveCandidateModerationDraft: operations.saveCandidateModerationDraft,
  decideCandidatePlace: operations.decideCandidatePlace
}));

vi.mock('$server/moderation/place-moderation', async (importOriginal) => ({
  ...(await importOriginal()),
  getCandidatePublicationReview: operations.getCandidatePublicationReview,
  updateModeratedPlaceLocation: operations.updateModeratedPlaceLocation,
  updatePlaceWheelchairAccessibility: operations.updatePlaceWheelchairAccessibility,
  verifyAndPublish: operations.verifyAndPublish
}));

vi.mock('$server/place-media/place-media', async (importOriginal) => ({
  ...(await importOriginal()),
  getModerationPlaceMedia: operations.getModerationPlaceMedia,
  signPlaceMediaUrl: operations.signPlaceMediaUrl,
  uploadPlaceMediaObject: operations.uploadPlaceMediaObject,
  registerPlaceMedia: operations.registerPlaceMedia,
  approvePlaceMedia: operations.approvePlaceMedia,
  rejectPlaceMedia: operations.rejectPlaceMedia,
  retirePlaceMedia: operations.retirePlaceMedia
}));

import {
  executeModerationCandidateAction,
  executeCandidateDecision,
  saveCandidateDraftSection,
  loadModerationCandidateQueue,
  loadModerationCandidateReview,
  parseModerationCandidateQueueCursor
} from '$server/moderation/candidate-workspace';

const placeId = '70000000-0000-4000-8000-000000000001';

const review = {
  placeId,
  version: 3,
  lifecycle: 'candidate',
  candidateStatus: 'pending',
  itemVersion: 2,
  draftVersion: 1,
  draftPayload: null,
  draftUpdatedBy: null,
  draftUpdatedAt: null,
  readinessState: 'blocked',
  readinessIssues: ['access_condition'],
  originatingSuggestionId: null,
  contributorId: null,
  wheelchairAccessibility: 'unknown' as const,
  operatorName: 'Candidate operator',
  category: 'cafe',
  websiteUrl: null,
  phone: null,
  openingHours: {},
  dogAmenities: [],
  addressLine: 'Candidate street 1',
  locality: 'Reykjavik',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: 64.1466,
  longitude: -21.9426,
  geometryPrecision: 'moderator_confirmed_point',
  geometrySource: 'Moderator verification',
  nameIs: 'Tillogustadur',
  descriptionIs: 'Lysing',
  nameEn: 'Candidate Place',
  descriptionEn: 'Description',
  accessConditions: [],
  evidenceRecords: [],
  checks: {
    candidate: true,
    operatorAndCategory: true,
    capitalRegionLocation: true,
    geometryQuality: true,
    icelandicTranslation: true,
    englishTranslation: true,
    accessCondition: false
  },
  ready: false
};

const client = {
  rpc: vi.fn(),
  storage: { from: vi.fn() }
} as unknown as RequestSupabaseClient;

function actionForm(values: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set('placeId', placeId);
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe('Candidate workspace queue assembly', () => {
  it('parses a complete Candidate cursor and retains legacy previous-page state', () => {
    expect(
      parseModerationCandidateQueueCursor(
        new URLSearchParams({ cursorTime: '2026-07-13T09:00:00Z', cursorId: placeId })
      )
    ).toEqual({
      cursor: { createdAt: '2026-07-13T09:00:00Z', placeId },
      hasPrevious: true
    });

    expect(
      parseModerationCandidateQueueCursor(new URLSearchParams({ cursorTime: 'invalid' }))
    ).toEqual({ cursor: null, hasPrevious: false });
  });

  it('loads the Candidate queue through the existing bounded adapter', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          place_id: placeId,
          operator_name: 'Candidate operator',
          category: 'cafe',
          address_line: 'Candidate street 1',
          locality: 'Reykjavik',
          municipality: 'reykjavik',
          created_at: '2026-07-13T09:00:00Z',
          candidate_status: 'published',
          item_version: 3,
          draft_version: 1,
          draft_updated_by: 'moderator-1',
          draft_updated_at: '2026-07-13T10:00:00Z',
          readiness_state: 'ready',
          readiness_issue_count: 0
        }
      ],
      error: null
    });

    await expect(
      loadModerationCandidateQueue({ rpc }, 'resolved', { cursor: null, hasPrevious: false })
    ).resolves.toMatchObject({
      status: 'success',
      value: { items: [{ placeId }], nextCursor: null, hasPrevious: false }
    });
    expect(rpc).toHaveBeenCalledWith(
      'list_moderation_candidate_places',
      expect.objectContaining({ requested_filter: 'resolved' })
    );
  });
});

describe('Candidate workspace review assembly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operations.getCandidatePublicationReview.mockResolvedValue({
      status: 'success',
      value: review
    });
    operations.getModerationPlaceMedia.mockResolvedValue({
      status: 'success',
      value: [
        {
          mediaId: 'media-1',
          kind: 'photo',
          storageBucket: 'place-photos',
          storageObjectPath: `${placeId}/media-1.jpg`
        }
      ]
    });
    operations.signPlaceMediaUrl.mockResolvedValue('https://example.invalid/signed.jpg');
  });

  it('loads readiness and signed media as one route-neutral review model', async () => {
    await expect(loadModerationCandidateReview(client, placeId)).resolves.toMatchObject({
      status: 'success',
      value: {
        review: { placeId, ready: false },
        media: [{ mediaId: 'media-1', signedUrl: 'https://example.invalid/signed.jpg' }]
      }
    });
    expect(operations.signPlaceMediaUrl).toHaveBeenCalledWith(
      client,
      'place-photos',
      `${placeId}/media-1.jpg`
    );
  });

  it('preserves the direct route best-effort media behavior', async () => {
    operations.getModerationPlaceMedia.mockResolvedValue({ status: 'infrastructure_error' });

    await expect(loadModerationCandidateReview(client, placeId)).resolves.toMatchObject({
      status: 'success',
      value: { review: { placeId }, media: [] }
    });
  });

  it('propagates not found, authorization, and infrastructure review failures', async () => {
    for (const status of ['not_found', 'forbidden', 'infrastructure_error'] as const) {
      operations.getCandidatePublicationReview.mockResolvedValueOnce({ status });
      await expect(loadModerationCandidateReview(client, placeId)).resolves.toEqual({ status });
    }
  });
});

describe('Candidate workspace action orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a parsed location section against item and draft versions', async () => {
    operations.saveCandidateModerationDraft.mockResolvedValue({
      status: 'success',
      value: {
        targetId: placeId,
        version: 2,
        payload: { location: { address_line: 'Corrected street 2' } },
        updatedBy: 'moderator-1',
        updatedAt: '2026-07-21T20:00:00Z'
      }
    });
    const formData = actionForm({
      expectedItemVersion: '3',
      expectedDraftVersion: '1',
      sectionId: 'location',
      currentDraftPayload: '{"translations":{"en":{"name":"must not be echoed"}}}',
      addressLine: 'Corrected street 2',
      locality: 'Reykjavík',
      postalCode: '101',
      municipality: 'reykjavik',
      latitude: '64.1466',
      longitude: '-21.9426',
      geometryPrecision: 'moderator_confirmed_point',
      geometrySource: 'Moderator verification'
    });

    await expect(
      saveCandidateDraftSection({
        client,
        placeId,
        requestId: 'request-draft',
        formData
      })
    ).resolves.toMatchObject({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'draft_saved', sectionId: 'location', draftVersion: 2 }
    });
    expect(operations.saveCandidateModerationDraft).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        expectedItemVersion: 3,
        expectedDraftVersion: 1,
        sectionId: 'location',
        payload: expect.objectContaining({
          location: expect.objectContaining({ address_line: 'Corrected street 2' })
        })
      })
    );
    expect(operations.saveCandidateModerationDraft.mock.calls[0]?.[1].payload).not.toHaveProperty(
      'translations'
    );
  });

  it('requires a confirmed structured bilingual rejection', async () => {
    const incomplete = actionForm({
      decision: 'rejected',
      expectedItemVersion: '2',
      expectedDraftVersion: '1',
      reasonCode: 'insufficient_evidence',
      memberReasonIs: 'Heimildir vantar.',
      memberReasonEn: 'Evidence is missing.'
    });
    await expect(
      executeCandidateDecision({
        client,
        placeId,
        requestId: 'request-reject',
        formData: incomplete
      })
    ).resolves.toMatchObject({ status: 'failure', error: 'confirmation_required' });

    incomplete.set('confirmedDecision', 'rejected');
    operations.decideCandidatePlace.mockResolvedValue({
      status: 'success',
      value: { placeId, status: 'rejected', itemVersion: 3, draftVersion: 1 }
    });
    await expect(
      executeCandidateDecision({
        client,
        placeId,
        requestId: 'request-reject',
        formData: incomplete
      })
    ).resolves.toMatchObject({
      status: 'confirmed',
      terminal: true,
      effect: { kind: 'rejected', itemVersion: 3 }
    });
  });

  it('keeps a corrected Candidate selected after the server confirms the location', async () => {
    operations.updateModeratedPlaceLocation.mockResolvedValue({
      status: 'success',
      value: {
        placeId,
        geometryPrecision: 'moderator_confirmed_point',
        version: 4
      }
    });
    const formData = actionForm({
      expectedVersion: '3',
      addressLine: 'Corrected street 2',
      locality: 'Reykjavík',
      postalCode: '101',
      municipality: 'reykjavik',
      latitude: '64.1466',
      longitude: '-21.9426',
      geometryPrecision: 'moderator_confirmed_point',
      geometrySource: 'Moderator verification'
    });

    await expect(
      executeModerationCandidateAction('correctLocation', {
        client,
        placeId,
        requestId: 'request-location',
        formData
      })
    ).resolves.toEqual({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'location_corrected' }
    });
    expect(operations.updateModeratedPlaceLocation).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        placeId,
        expectedVersion: 3,
        addressLine: 'Corrected street 2'
      }),
      'request-location'
    );
  });

  it('keeps the Place selected after saving its wheelchair accessibility', async () => {
    operations.updatePlaceWheelchairAccessibility.mockResolvedValue({
      status: 'success',
      value: {
        placeId,
        wheelchairAccessibility: 'not_accessible',
        version: 4
      }
    });
    const formData = actionForm({
      expectedVersion: '3',
      wheelchairAccessibility: 'not_accessible'
    });

    await expect(
      executeModerationCandidateAction('updateWheelchairAccessibility', {
        client,
        placeId,
        requestId: 'request-accessibility',
        formData
      })
    ).resolves.toEqual({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'wheelchair_accessibility_updated' }
    });
    expect(operations.updatePlaceWheelchairAccessibility).toHaveBeenCalledWith(
      client,
      {
        placeId,
        expectedVersion: 3,
        wheelchairAccessibility: 'not_accessible'
      },
      'request-accessibility'
    );
  });

  it('rejects accessibility values outside the approved three-state contract', async () => {
    const formData = actionForm({
      expectedVersion: '3',
      wheelchairAccessibility: 'partial'
    });

    await expect(
      executeModerationCandidateAction('updateWheelchairAccessibility', {
        client,
        placeId,
        requestId: 'request-accessibility-invalid',
        formData
      })
    ).resolves.toEqual({
      status: 'failure',
      terminal: false,
      httpStatus: 400,
      error: 'incomplete'
    });
    expect(operations.updatePlaceWheelchairAccessibility).not.toHaveBeenCalled();
  });

  it('reports confirmed publication as terminal only after the server publishes', async () => {
    operations.verifyAndPublish.mockResolvedValue({
      status: 'success',
      value: {
        placeId,
        verificationIds: ['verification-1'],
        version: 4,
        publishedAt: '2026-07-13T12:00:00Z'
      }
    });
    const formData = actionForm({
      expectedVersion: '3',
      expectedItemVersion: '2',
      expectedDraftVersion: '1',
      freshnessUntil: '2027-07-13',
      publicationReason: 'The Place details and access rules have been reviewed.'
    });

    await expect(
      executeModerationCandidateAction('publish', {
        client,
        placeId,
        requestId: 'request-1',
        formData
      })
    ).resolves.toEqual({
      status: 'confirmed',
      terminal: true,
      effect: { kind: 'published', publishedAt: '2026-07-13T12:00:00Z' }
    });
    expect(operations.verifyAndPublish).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        placeId,
        expectedVersion: 3,
        expectedItemVersion: 2,
        publicationReason: 'The Place details and access rules have been reviewed.'
      }),
      'request-1'
    );
  });

  it.each([
    ['incomplete', 400, 'incomplete'],
    ['stale', 409, 'conflict'],
    ['not_publishable', 409, 'not_publishable'],
    ['forbidden', 403, 'forbidden'],
    ['infrastructure_error', 503, 'unavailable']
  ] as const)(
    'keeps the Candidate selected when publication returns %s',
    async (status, httpStatus, error) => {
      operations.verifyAndPublish.mockResolvedValue({ status });
      const formData = actionForm({
        expectedVersion: '3',
        expectedItemVersion: '2',
        expectedDraftVersion: '1',
        freshnessUntil: '2027-07-13',
        publicationReason: 'The Place details and access rules have been reviewed.'
      });

      await expect(
        executeModerationCandidateAction('publish', {
          client,
          placeId,
          requestId: 'request-2',
          formData
        })
      ).resolves.toEqual({ status: 'failure', terminal: false, httpStatus, error });
    }
  );

  it('rejects publication without the Candidate review version before calling the RPC', async () => {
    const formData = actionForm({
      expectedVersion: '3',
      expectedDraftVersion: '1',
      freshnessUntil: '2027-07-13',
      publicationReason: 'The Place details and access rules have been reviewed.'
    });

    await expect(
      executeModerationCandidateAction('publish', {
        client,
        placeId,
        requestId: 'request-missing-item-version',
        formData
      })
    ).resolves.toMatchObject({ status: 'failure', error: 'incomplete' });
    expect(operations.verifyAndPublish).not.toHaveBeenCalled();
  });

  it('rejects publication without an internal Moderator rationale', async () => {
    const formData = actionForm({
      expectedVersion: '3',
      expectedItemVersion: '2',
      expectedDraftVersion: '1',
      freshnessUntil: '2027-07-13'
    });

    await expect(
      executeModerationCandidateAction('publish', {
        client,
        placeId,
        requestId: 'request-missing-publication-reason',
        formData
      })
    ).resolves.toMatchObject({ status: 'failure', error: 'incomplete' });
    expect(operations.verifyAndPublish).not.toHaveBeenCalled();
  });

  it('rejects a mismatched form Place before executing a Candidate action', async () => {
    const formData = actionForm();
    formData.set('placeId', 'another-place');

    await expect(
      executeModerationCandidateAction('retireMedia', {
        client,
        placeId,
        requestId: 'request-3',
        formData
      })
    ).resolves.toEqual({ status: 'failure', terminal: false, httpStatus: 400, error: 'invalid' });
    expect(operations.retirePlaceMedia).not.toHaveBeenCalled();
  });

  it.each([
    ['approveMedia', operations.approvePlaceMedia],
    ['rejectMedia', operations.rejectPlaceMedia],
    ['retireMedia', operations.retirePlaceMedia]
  ] as const)('keeps successful %s work nonterminal', async (action, operation) => {
    operation.mockResolvedValue({ status: 'success', value: {} });
    const formData = actionForm({
      mediaId: 'media-1',
      rightsChoice: 'permission',
      photographerOrUploader: 'Photographer',
      sourceOrCaptureDate: '2026-07-01',
      licenseReference: 'Permission on file',
      rightsEvidenceReference: 'Email 2026-07-01',
      attributionText: 'Photo by Photographer',
      peopleReview: 'no_prominent_people',
      altTextIs: 'Ljósmynd',
      altTextEn: 'Photo'
    });

    await expect(
      executeModerationCandidateAction(action, {
        client,
        placeId,
        requestId: 'request-4',
        formData
      })
    ).resolves.toMatchObject({ status: 'confirmed', terminal: false });
  });

  it('validates upload files before storage and registration', async () => {
    await expect(
      executeModerationCandidateAction('uploadEvidence', {
        client,
        placeId,
        requestId: 'request-5',
        formData: actionForm()
      })
    ).resolves.toEqual({
      status: 'failure',
      terminal: false,
      httpStatus: 400,
      error: 'media_incomplete'
    });
    expect(operations.uploadPlaceMediaObject).not.toHaveBeenCalled();
  });

  it('uploads and publishes a moderator photo in one action', async () => {
    operations.uploadPlaceMediaObject.mockResolvedValue({
      ok: true,
      objectPath: `${placeId}/photo.jpg`
    });
    operations.registerPlaceMedia.mockResolvedValue({
      status: 'success',
      value: {
        mediaId: 'media-photo-1',
        kind: 'photo',
        approvalState: 'pending',
        uploadedAt: '2026-07-22T12:00:00Z'
      }
    });
    operations.approvePlaceMedia.mockResolvedValue({ status: 'success', value: {} });
    const formData = actionForm({
      widthPx: '1200',
      heightPx: '800',
      rightsChoice: 'own_photo',
      peopleReview: 'no_prominent_people',
      makePrimary: 'on',
      defaultAltTextIs: 'Ljósmynd af Tillögustað',
      defaultAltTextEn: 'Photo of Candidate Place'
    });
    formData.set('file', new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }));

    await expect(
      executeModerationCandidateAction('uploadPhoto', {
        client,
        placeId,
        requestId: 'request-photo',
        formData
      })
    ).resolves.toMatchObject({
      status: 'confirmed',
      effect: { kind: 'media_approved' }
    });
    expect(operations.approvePlaceMedia).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        mediaId: 'media-photo-1',
        rightsBasis: 'explicit_permission',
        peopleReview: 'no_prominent_people',
        makePrimary: true,
        altTextEn: 'Photo of Candidate Place'
      }),
      'request-photo'
    );
  });
});
