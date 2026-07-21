import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';

const operations = vi.hoisted(() => ({
  getCandidatePublicationReview: vi.fn(),
  updateCandidatePlaceLocation: vi.fn(),
  updatePlaceWheelchairAccessibility: vi.fn(),
  verifyAndPublish: vi.fn(),
  getModerationPlaceMedia: vi.fn(),
  signPlaceMediaUrl: vi.fn(),
  uploadPlaceMediaObject: vi.fn(),
  registerPlaceMedia: vi.fn(),
  approvePlaceMedia: vi.fn(),
  rejectPlaceMedia: vi.fn(),
  retirePlaceMedia: vi.fn()
}));

vi.mock('$server/moderation/place-moderation', async (importOriginal) => ({
  ...(await importOriginal()),
  getCandidatePublicationReview: operations.getCandidatePublicationReview,
  updateCandidatePlaceLocation: operations.updateCandidatePlaceLocation,
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
  loadModerationCandidateQueue,
  loadModerationCandidateReview,
  parseModerationCandidateQueueCursor
} from '$server/moderation/candidate-workspace';

const placeId = '70000000-0000-4000-8000-000000000001';
const conditionId = '70000000-0000-4000-8000-000000000002';
const evidenceId = '70000000-0000-4000-8000-000000000003';

const review = {
  placeId,
  version: 3,
  lifecycle: 'candidate',
  wheelchairAccessibility: 'unknown' as const,
  operatorName: 'Candidate operator',
  category: 'cafe',
  addressLine: 'Candidate street 1',
  locality: 'Reykjavik',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: 64.1466,
  longitude: -21.9426,
  geometryPrecision: 'official_address_point' as const,
  geometrySource: 'test fixture',
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
    accessCondition: false,
    evidence: false
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
          created_at: '2026-07-13T09:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      loadModerationCandidateQueue({ rpc }, { cursor: null, hasPrevious: false })
    ).resolves.toMatchObject({
      status: 'success',
      value: { items: [{ placeId }], nextCursor: null, hasPrevious: false }
    });
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

  it('keeps a corrected Candidate selected after the server confirms the location', async () => {
    operations.updateCandidatePlaceLocation.mockResolvedValue({
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
    expect(operations.updateCandidatePlaceLocation).toHaveBeenCalledWith(
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
      freshnessUntil: '2027-07-13'
    });
    formData.append('accessConditionId', conditionId);
    formData.append(`conditionEvidence.${conditionId}`, evidenceId);

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
      expect.objectContaining({ placeId, expectedVersion: 3 }),
      'request-1'
    );
  });

  it.each([
    ['incomplete', 400, 'incomplete'],
    ['stale', 409, 'conflict'],
    ['already_published', 409, 'already_published'],
    ['forbidden', 403, 'forbidden'],
    ['infrastructure_error', 503, 'unavailable']
  ] as const)(
    'keeps the Candidate selected when publication returns %s',
    async (status, httpStatus, error) => {
      operations.verifyAndPublish.mockResolvedValue({ status });
      const formData = actionForm({ expectedVersion: '3', freshnessUntil: '2027-07-13' });
      formData.append('accessConditionId', conditionId);
      formData.append(`conditionEvidence.${conditionId}`, evidenceId);

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
      photographerOrUploader: 'Photographer',
      sourceOrCaptureDate: '2026-07-01',
      licenseReference: 'Permission on file',
      rightsBasis: 'explicit_permission',
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
});
