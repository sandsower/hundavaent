import { env } from '$env/dynamic/public';

import type { RequestSupabaseClient } from '$server/db/clients';
import type { Json } from '$server/db/generated.types';
import {
  listModerationCandidatePlaces,
  type CandidateQueueCursor,
  type CandidateQueueRpcClient,
  type ModerationCandidatePlace
} from '$server/moderation/candidate-queue';
import {
  isCandidateDecisionOutcome,
  isCandidateRejectionReasonCode,
  type CandidateRejectionReasonCode,
  type ModerationFilterId
} from '$server/moderation/moderation-contract';
import {
  decideCandidatePlace,
  saveCandidateModerationDraft
} from '$server/moderation/moderation-drafts';
import {
  getCandidatePublicationReview,
  updateCandidatePlaceLocation,
  verifyAndPublish,
  type CandidatePublicationReview,
  type LocationCorrectionCommand,
  type PublishPlaceCommand
} from '$server/moderation/place-moderation';
import {
  approvePlaceMedia,
  getModerationPlaceMedia,
  registerPlaceMedia,
  rejectPlaceMedia,
  retirePlaceMedia,
  signPlaceMediaUrl,
  uploadPlaceMediaObject,
  type ModerationPlaceMediaItem
} from '$server/place-media/place-media';
import {
  isAllowedPlaceMediaMimeType,
  maxPlaceMediaBytes,
  parseApprovePlaceMediaFormData,
  parseRegisterEvidenceFormData,
  parseRegisterPhotoFormData
} from '$server/place-media/place-media-input';

export interface ModerationPlaceMediaView extends ModerationPlaceMediaItem {
  readonly signedUrl: string | null;
}

export interface ModerationCandidateQueueCursorState {
  readonly cursor: CandidateQueueCursor | null;
  readonly hasPrevious: boolean;
}

export interface ModerationCandidateQueueData {
  readonly items: ModerationCandidatePlace[];
  readonly nextCursor: CandidateQueueCursor | null;
  readonly hasPrevious: boolean;
}

export interface ModerationCandidateReviewData {
  readonly review: CandidatePublicationReview;
  readonly defaultFreshnessUntil: string;
  readonly mapStyleUrl: string | null;
  readonly media: ModerationPlaceMediaView[];
}

export type CandidateWorkspaceLoadResult<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'not_found' | 'forbidden' | 'invalid' | 'infrastructure_error' };

export type ModerationCandidateActionName =
  | 'correctLocation'
  | 'publish'
  | 'uploadEvidence'
  | 'uploadPhoto'
  | 'approveMedia'
  | 'rejectMedia'
  | 'retireMedia';

export type ModerationCandidateActionError =
  | 'invalid'
  | 'incomplete'
  | 'conflict'
  | 'already_published'
  | 'forbidden'
  | 'unavailable'
  | 'media_incomplete'
  | 'media_invalid'
  | 'media_file_type'
  | 'media_file_size'
  | 'media_upload'
  | 'resolved'
  | 'confirmation_required';

export interface ModerationCandidateActionContext {
  readonly client: RequestSupabaseClient;
  readonly placeId: string;
  readonly requestId: string;
  readonly formData: FormData;
}

export type ModerationCandidateActionResult =
  | {
      readonly status: 'confirmed';
      readonly terminal: boolean;
      readonly effect:
        | { readonly kind: 'published'; readonly publishedAt: string }
        | {
            readonly kind: 'draft_saved';
            readonly sectionId: CandidateDraftSectionId;
            readonly draftVersion: number;
          }
        | {
            readonly kind: 'needs_information' | 'rejected' | 'reopened';
            readonly itemVersion: number;
          }
        | {
            readonly kind:
              | 'location_corrected'
              | 'evidence_uploaded'
              | 'photo_uploaded'
              | 'media_approved'
              | 'media_rejected'
              | 'media_retired';
          };
    }
  | {
      readonly status: 'failure';
      readonly terminal: false;
      readonly httpStatus: 400 | 403 | 409 | 502 | 503;
      readonly error: ModerationCandidateActionError;
    };

export type CandidateDraftSectionId =
  'identity' | 'location' | 'translations' | 'details' | 'access_conditions' | 'evidence_records';

export function parseModerationCandidateQueueCursor(
  params: URLSearchParams
): ModerationCandidateQueueCursorState {
  const createdAt = params.get('cursorTime');
  const placeId = params.get('cursorId');
  const valid =
    createdAt !== null &&
    placeId !== null &&
    createdAt.trim().length > 0 &&
    placeId.trim().length > 0 &&
    Number.isFinite(Date.parse(createdAt));

  return {
    cursor: valid ? { createdAt, placeId } : null,
    hasPrevious: valid
  };
}

export async function loadModerationCandidateQueue(
  client: CandidateQueueRpcClient,
  filter: ModerationFilterId,
  cursorState: ModerationCandidateQueueCursorState
): Promise<CandidateWorkspaceLoadResult<ModerationCandidateQueueData>> {
  const result = await listModerationCandidatePlaces(client, filter, cursorState.cursor);
  if (result.status !== 'success') return { status: result.status };

  return {
    status: 'success',
    value: {
      items: result.value.items,
      nextCursor: result.value.nextCursor,
      hasPrevious: cursorState.hasPrevious
    }
  };
}

export async function loadModerationCandidateReview(
  client: RequestSupabaseClient,
  placeId: string
): Promise<CandidateWorkspaceLoadResult<ModerationCandidateReviewData>> {
  const [reviewResult, mediaResult] = await Promise.all([
    getCandidatePublicationReview(client, placeId),
    getModerationPlaceMedia(client, placeId)
  ]);
  if (reviewResult.status !== 'success') return { status: reviewResult.status };

  const mediaItems = mediaResult.status === 'success' ? mediaResult.value : [];
  const media = await Promise.all(
    mediaItems.map(async (item) => ({
      ...item,
      signedUrl: await signPlaceMediaUrl(
        client,
        item.storageBucket as 'place-evidence' | 'place-photos',
        item.storageObjectPath
      )
    }))
  );

  return {
    status: 'success',
    value: {
      review: reviewResult.value,
      defaultFreshnessUntil: defaultFreshnessDate(),
      mapStyleUrl: env.PUBLIC_MAP_STYLE_URL?.trim() || null,
      media
    }
  };
}

export async function executeModerationCandidateAction(
  action: ModerationCandidateActionName,
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  if (String(context.formData.get('placeId') ?? '').trim() !== context.placeId) {
    return failure(400, 'invalid');
  }

  switch (action) {
    case 'correctLocation':
      return correctCandidateLocation(context);
    case 'publish':
      return publishCandidate(context);
    case 'uploadEvidence':
      return uploadCandidateMedia(context, 'evidence_screenshot');
    case 'uploadPhoto':
      return uploadCandidateMedia(context, 'photo');
    case 'approveMedia':
      return approveCandidateMedia(context);
    case 'rejectMedia':
      return rejectCandidateMedia(context);
    case 'retireMedia':
      return retireCandidateMedia(context);
  }
}

export async function saveCandidateDraftSection(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  if (String(context.formData.get('placeId') ?? '').trim() !== context.placeId) {
    return failure(400, 'invalid');
  }
  const command = readCandidateDraftCommand(context);
  if (!command) return failure(400, 'incomplete');

  const result = await saveCandidateModerationDraft(
    context.client as unknown as Parameters<typeof saveCandidateModerationDraft>[0],
    command
  );
  if (result.status === 'success') {
    return {
      status: 'confirmed',
      terminal: false,
      effect: {
        kind: 'draft_saved',
        sectionId: command.sectionId,
        draftVersion: result.value.version
      }
    };
  }
  if (result.status === 'conflict') return failure(409, 'conflict');
  if (result.status === 'resolved') return failure(409, 'resolved');
  if (result.status === 'forbidden') return failure(403, 'forbidden');
  if (result.status === 'invalid') return failure(400, 'invalid');
  return failure(503, 'unavailable');
}

export async function executeCandidateDecision(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  if (String(context.formData.get('placeId') ?? '').trim() !== context.placeId) {
    return failure(400, 'invalid');
  }
  const command = readCandidateDecisionCommand(context);
  if (!command) return failure(400, 'incomplete');
  if (
    command.outcome === 'rejected' &&
    String(context.formData.get('confirmedDecision') ?? '') !== 'rejected'
  ) {
    return failure(400, 'confirmation_required');
  }

  const result = await decideCandidatePlace(
    context.client as unknown as Parameters<typeof decideCandidatePlace>[0],
    command
  );
  if (result.status === 'success') {
    const kind =
      command.outcome === 'reopen'
        ? 'reopened'
        : command.outcome === 'rejected'
          ? 'rejected'
          : 'needs_information';
    return {
      status: 'confirmed',
      terminal: true,
      effect: { kind, itemVersion: result.value.itemVersion }
    };
  }
  if (result.status === 'conflict') return failure(409, 'conflict');
  if (result.status === 'resolved') return failure(409, 'resolved');
  if (result.status === 'forbidden') return failure(403, 'forbidden');
  if (result.status === 'invalid') return failure(400, 'invalid');
  return failure(503, 'unavailable');
}

async function correctCandidateLocation(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  const command = readLocationCorrectionCommand(context.placeId, context.formData);
  if (!command) return failure(400, 'incomplete');

  const result = await updateCandidatePlaceLocation(context.client, command, context.requestId);
  if (result.status === 'success') {
    return {
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'location_corrected' }
    };
  }
  if (result.status === 'conflict') return failure(409, 'conflict');
  if (result.status === 'forbidden') return failure(403, 'forbidden');
  if (result.status === 'validation_error') return failure(400, 'incomplete');
  return failure(503, 'unavailable');
}

async function publishCandidate(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  const command = readPublicationCommand(context.placeId, context.formData);
  if (!command) return failure(400, 'incomplete');

  const result = await verifyAndPublish(context.client, command, context.requestId);
  if (result.status === 'success') {
    return {
      status: 'confirmed',
      terminal: true,
      effect: { kind: 'published', publishedAt: result.value.publishedAt }
    };
  }
  if (result.status === 'stale') return failure(409, 'conflict');
  if (result.status === 'already_published') return failure(409, 'already_published');
  if (result.status === 'forbidden') return failure(403, 'forbidden');
  if (result.status === 'incomplete') return failure(400, 'incomplete');
  return failure(503, 'unavailable');
}

async function uploadCandidateMedia(
  context: ModerationCandidateActionContext,
  kind: 'evidence_screenshot' | 'photo'
): Promise<ModerationCandidateActionResult> {
  const file = context.formData.get('file');
  const fileError = validateMediaFile(file);
  if (fileError) return fileError;

  const mediaFile = file as File;
  context.formData.set('mimeType', mediaFile.type);
  context.formData.set('byteSize', String(mediaFile.size));
  const parsed =
    kind === 'evidence_screenshot'
      ? parseRegisterEvidenceFormData(context.formData)
      : parseRegisterPhotoFormData(context.formData);
  if (!parsed.ok) {
    return failure(400, parsed.error === 'incomplete' ? 'media_incomplete' : 'media_invalid');
  }

  const upload = await uploadPlaceMediaObject(
    context.client,
    kind,
    context.placeId,
    mediaFile,
    parsed.command.mime_type
  );
  if (!upload.ok) return failure(502, 'media_upload');

  const result = await registerPlaceMedia(
    context.client,
    { ...parsed.command, storage_object_path: upload.objectPath },
    context.requestId
  );
  if (result.status !== 'success') return mediaCommandFailure(result.status);

  return {
    status: 'confirmed',
    terminal: false,
    effect: { kind: kind === 'evidence_screenshot' ? 'evidence_uploaded' : 'photo_uploaded' }
  };
}

async function approveCandidateMedia(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  const parsed = parseApprovePlaceMediaFormData(context.formData);
  if (!parsed.ok) {
    return failure(400, parsed.error === 'incomplete' ? 'media_incomplete' : 'media_invalid');
  }

  const result = await approvePlaceMedia(
    context.client,
    {
      mediaId: parsed.command.media_id,
      photographerOrUploader: parsed.command.photographer_or_uploader,
      sourceOrCaptureDate: parsed.command.source_or_capture_date,
      licenseReference: parsed.command.license_reference,
      rightsBasis: parsed.command.rights_basis,
      rightsEvidenceReference: parsed.command.rights_evidence_reference,
      sourceUrl: parsed.command.source_url,
      licenseUrl: parsed.command.license_url,
      attributionText: parsed.command.attribution_text,
      attributionUrl: parsed.command.attribution_url,
      peopleReview: parsed.command.people_review,
      makePrimary: parsed.command.make_primary,
      altTextIs: parsed.command.alt_text_is,
      altTextEn: parsed.command.alt_text_en
    },
    context.requestId
  );
  if (result.status !== 'success') return mediaCommandFailure(result.status);

  return { status: 'confirmed', terminal: false, effect: { kind: 'media_approved' } };
}

async function rejectCandidateMedia(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  const mediaId = String(context.formData.get('mediaId') ?? '').trim();
  if (!mediaId) return failure(400, 'media_incomplete');
  const result = await rejectPlaceMedia(context.client, mediaId, context.requestId);
  if (result.status !== 'success') return mediaCommandFailure(result.status);
  return { status: 'confirmed', terminal: false, effect: { kind: 'media_rejected' } };
}

async function retireCandidateMedia(
  context: ModerationCandidateActionContext
): Promise<ModerationCandidateActionResult> {
  const mediaId = String(context.formData.get('mediaId') ?? '').trim();
  if (!mediaId) return failure(400, 'media_incomplete');
  const result = await retirePlaceMedia(context.client, mediaId, context.requestId);
  if (result.status !== 'success') return mediaCommandFailure(result.status);
  return { status: 'confirmed', terminal: false, effect: { kind: 'media_retired' } };
}

function validateMediaFile(
  file: FormDataEntryValue | null
): ModerationCandidateActionResult | null {
  if (!(file instanceof File) || file.size === 0) return failure(400, 'media_incomplete');
  if (!isAllowedPlaceMediaMimeType(file.type)) return failure(400, 'media_file_type');
  if (file.size > maxPlaceMediaBytes) return failure(400, 'media_file_size');
  return null;
}

function mediaCommandFailure(status: string): ModerationCandidateActionResult {
  if (status === 'forbidden') return failure(403, 'forbidden');
  if (status === 'conflict') return failure(409, 'conflict');
  if (status === 'validation_error') return failure(400, 'media_invalid');
  return failure(503, 'unavailable');
}

function failure(
  httpStatus: 400 | 403 | 409 | 502 | 503,
  error: ModerationCandidateActionError
): ModerationCandidateActionResult {
  return { status: 'failure', terminal: false, httpStatus, error };
}

function readCandidateDraftCommand(context: ModerationCandidateActionContext) {
  const expectedItemVersion = Number(context.formData.get('expectedItemVersion'));
  const expectedDraftVersion = Number(context.formData.get('expectedDraftVersion'));
  const sectionId = String(context.formData.get('sectionId') ?? '').trim();
  if (
    !Number.isInteger(expectedItemVersion) ||
    expectedItemVersion < 1 ||
    !Number.isInteger(expectedDraftVersion) ||
    expectedDraftVersion < 0 ||
    !isCandidateDraftSectionId(sectionId)
  ) {
    return null;
  }

  const currentPayload = parseJsonObject(context.formData.get('currentDraftPayload')) ?? {};
  const suppliedSection = parseJsonObject(context.formData.get('sectionPayload'));
  let sectionPayload: Record<string, Json> | null = suppliedSection;
  if (sectionId === 'location') {
    const location = readDraftLocation(context.formData);
    if (!location) return null;
    sectionPayload = { location };
  }
  if (!sectionPayload) return null;

  return {
    placeId: context.placeId,
    expectedItemVersion,
    expectedDraftVersion,
    sectionId,
    payload: { ...currentPayload, ...sectionPayload },
    requestId: context.requestId
  };
}

function readCandidateDecisionCommand(context: ModerationCandidateActionContext) {
  const outcome = String(context.formData.get('decision') ?? '').trim();
  const expectedItemVersion = Number(context.formData.get('expectedItemVersion'));
  const expectedDraftVersion = Number(context.formData.get('expectedDraftVersion'));
  if (
    !isCandidateDecisionOutcome(outcome) ||
    !Number.isInteger(expectedItemVersion) ||
    expectedItemVersion < 1 ||
    !Number.isInteger(expectedDraftVersion) ||
    expectedDraftVersion < 0
  ) {
    return null;
  }
  if (outcome === 'reopen') {
    return {
      placeId: context.placeId,
      outcome,
      expectedItemVersion,
      expectedDraftVersion,
      reasonCode: null,
      contributorExplanationIs: null,
      contributorExplanationEn: null,
      privateNote: null,
      requestId: context.requestId
    };
  }

  const contributorExplanationIs = String(context.formData.get('memberReasonIs') ?? '').trim();
  const contributorExplanationEn = String(context.formData.get('memberReasonEn') ?? '').trim();
  const requestedReason = String(context.formData.get('reasonCode') ?? '').trim();
  if (!contributorExplanationIs || !contributorExplanationEn) return null;
  if (outcome === 'rejected' && !isCandidateRejectionReasonCode(requestedReason)) return null;

  const reasonCode: CandidateRejectionReasonCode | null =
    outcome === 'rejected' ? (requestedReason as CandidateRejectionReasonCode) : null;
  return {
    placeId: context.placeId,
    outcome,
    expectedItemVersion,
    expectedDraftVersion,
    reasonCode,
    contributorExplanationIs,
    contributorExplanationEn,
    privateNote: String(context.formData.get('privateNote') ?? '').trim() || null,
    requestId: context.requestId
  };
}

function readDraftLocation(formData: FormData): Record<string, Json> | null {
  const addressLine = String(formData.get('addressLine') ?? '').trim();
  const locality = String(formData.get('locality') ?? '').trim();
  const postalCode = String(formData.get('postalCode') ?? '').trim();
  const municipality = String(formData.get('municipality') ?? '').trim();
  const latitude = Number(formData.get('latitude'));
  const longitude = Number(formData.get('longitude'));
  const geometryPrecision = String(formData.get('geometryPrecision') ?? '').trim();
  const geometrySource = String(formData.get('geometrySource') ?? '').trim();
  if (
    !addressLine ||
    !locality ||
    !/^\d{3}$/.test(postalCode) ||
    !capitalRegionMunicipalities.has(municipality) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !geometryPrecisions.has(geometryPrecision) ||
    !geometrySource
  ) {
    return null;
  }
  return {
    address_line: addressLine,
    locality,
    postal_code: postalCode,
    municipality,
    latitude,
    longitude,
    geometry_precision: geometryPrecision,
    geometry_source: geometrySource
  };
}

function parseJsonObject(value: FormDataEntryValue | null): Record<string, Json> | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, Json>)
      : null;
  } catch {
    return null;
  }
}

function isCandidateDraftSectionId(value: string): value is CandidateDraftSectionId {
  return [
    'identity',
    'location',
    'translations',
    'details',
    'access_conditions',
    'evidence_records'
  ].includes(value);
}

function readPublicationCommand(placeId: string, formData: FormData): PublishPlaceCommand | null {
  const expectedVersion = Number(formData.get('expectedVersion'));
  const expectedDraftVersion = Number(formData.get('expectedDraftVersion'));
  const accessConditionIds = formData
    .getAll('accessConditionId')
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
  const conditionVerifications = accessConditionIds.map((accessConditionId) => ({
    accessConditionId,
    evidenceIds: formData
      .getAll(`conditionEvidence.${accessConditionId}`)
      .map(String)
      .map((value) => value.trim())
      .filter(Boolean)
  }));
  const freshnessDate = String(formData.get('freshnessUntil') ?? '').trim();

  if (
    !uuidPattern.test(placeId) ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !Number.isInteger(expectedDraftVersion) ||
    expectedDraftVersion < 0 ||
    conditionVerifications.length === 0 ||
    conditionVerifications.some(
      (verification) =>
        !uuidPattern.test(verification.accessConditionId) ||
        verification.evidenceIds.length === 0 ||
        verification.evidenceIds.some((evidenceId) => !uuidPattern.test(evidenceId))
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(freshnessDate)
  ) {
    return null;
  }

  return {
    placeId,
    expectedVersion,
    expectedDraftVersion,
    conditionVerifications,
    freshnessUntil: `${freshnessDate}T23:59:59.999Z`,
    decisionMetadata: { source: 'moderation_checklist' }
  };
}

function readLocationCorrectionCommand(
  placeId: string,
  formData: FormData
): LocationCorrectionCommand | null {
  const expectedVersion = Number(formData.get('expectedVersion'));
  const addressLine = String(formData.get('addressLine') ?? '').trim();
  const locality = String(formData.get('locality') ?? '').trim();
  const postalCode = String(formData.get('postalCode') ?? '').trim();
  const municipality = String(formData.get('municipality') ?? '').trim();
  const latitude = Number(formData.get('latitude'));
  const longitude = Number(formData.get('longitude'));
  const geometryPrecision = String(formData.get('geometryPrecision') ?? '').trim();
  const geometrySource = String(formData.get('geometrySource') ?? '').trim();
  if (
    !uuidPattern.test(placeId) ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !addressLine ||
    !locality ||
    !/^\d{3}$/.test(postalCode) ||
    !capitalRegionMunicipalities.has(municipality) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !geometryPrecisions.has(geometryPrecision) ||
    !geometrySource
  ) {
    return null;
  }

  return {
    placeId,
    expectedVersion,
    addressLine,
    locality,
    postalCode,
    municipality,
    latitude,
    longitude,
    geometryPrecision: geometryPrecision as LocationCorrectionCommand['geometryPrecision'],
    geometrySource
  };
}

function defaultFreshnessDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const capitalRegionMunicipalities = new Set([
  'reykjavik',
  'kopavogur',
  'seltjarnarnes',
  'gardabaer',
  'hafnarfjordur',
  'mosfellsbaer',
  'kjosarhreppur'
]);
const geometryPrecisions = new Set([
  'moderator_confirmed_point',
  'official_address_point',
  'official_representative_centroid',
  'municipality_anchor_pending_geocode'
]);
