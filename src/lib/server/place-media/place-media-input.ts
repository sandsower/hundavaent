export type PlaceMediaKind = 'evidence_screenshot' | 'photo';

export const placePhotoRightsBases = [
  'explicit_permission',
  'cc0',
  'public_domain',
  'cc_by',
  'cc_by_sa',
  'official_reuse'
] as const;
export type PlacePhotoRightsBasis = (typeof placePhotoRightsBases)[number];

export const completedPlacePhotoPeopleReviews = [
  'no_prominent_people',
  'permission_documented'
] as const;
export type CompletedPlacePhotoPeopleReview = (typeof completedPlacePhotoPeopleReviews)[number];

export type PlaceMediaInputError = 'incomplete' | 'invalid';

export const allowedPlaceMediaMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type PlaceMediaMimeType = (typeof allowedPlaceMediaMimeTypes)[number];

// Mirrors the storage.buckets.file_size_limit configured in the place-media migration.
export const maxPlaceMediaBytes = 15 * 1024 * 1024;

export interface RegisterEvidenceCommand {
  place_id: string;
  kind: 'evidence_screenshot';
  storage_object_path: string;
  mime_type: PlaceMediaMimeType;
  byte_size: number;
  width_px: number;
  height_px: number;
  source_url: string;
  captured_at: string;
}

export interface RegisterPhotoCommand {
  place_id: string;
  kind: 'photo';
  storage_object_path: string;
  mime_type: PlaceMediaMimeType;
  byte_size: number;
  width_px: number;
  height_px: number;
}

export type RegisterPlaceMediaCommand = RegisterEvidenceCommand | RegisterPhotoCommand;

export type RegisterEvidenceInputResult =
  | { ok: true; command: Omit<RegisterEvidenceCommand, 'storage_object_path'> }
  | { ok: false; error: PlaceMediaInputError };

export type RegisterPhotoInputResult =
  | { ok: true; command: Omit<RegisterPhotoCommand, 'storage_object_path'> }
  | { ok: false; error: PlaceMediaInputError };

export interface ApprovePlaceMediaCommand {
  media_id: string;
  photographer_or_uploader: string;
  source_or_capture_date: string;
  license_reference: string;
  rights_basis: PlacePhotoRightsBasis;
  rights_evidence_reference: string;
  source_url: string | null;
  license_url: string | null;
  attribution_text: string;
  attribution_url: string | null;
  people_review: CompletedPlacePhotoPeopleReview;
  make_primary: boolean;
  alt_text_is: string;
  alt_text_en: string;
}

export type ApprovePlaceMediaInputResult =
  { ok: true; command: ApprovePlaceMediaCommand } | { ok: false; error: PlaceMediaInputError };

const mimeExtensions: Record<PlaceMediaMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

export function isAllowedPlaceMediaMimeType(value: string): value is PlaceMediaMimeType {
  return (allowedPlaceMediaMimeTypes as readonly string[]).includes(value);
}

export function extensionForMimeType(mimeType: PlaceMediaMimeType): string {
  return mimeExtensions[mimeType];
}

// Both buckets are keyed by Place so a Moderator can reason about "everything attached to this
// Place" from the object path alone; the trailing UUID keeps concurrent uploads collision-free.
export function buildPlaceMediaObjectPath(
  placeId: string,
  objectId: string,
  mimeType: PlaceMediaMimeType
): string {
  return `${placeId}/${objectId}.${extensionForMimeType(mimeType)}`;
}

export function parseRegisterEvidenceFormData(form: FormData): RegisterEvidenceInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const placeId = value('placeId');
  const mimeType = value('mimeType');
  const byteSize = Number(value('byteSize'));
  const widthPx = Number(value('widthPx'));
  const heightPx = Number(value('heightPx'));
  const sourceUrl = value('sourceUrl');
  const capturedAt = value('capturedAt');

  if (
    !placeId ||
    !isAllowedPlaceMediaMimeType(mimeType) ||
    !Number.isInteger(byteSize) ||
    byteSize <= 0 ||
    byteSize > maxPlaceMediaBytes ||
    !Number.isInteger(widthPx) ||
    widthPx <= 0 ||
    !Number.isInteger(heightPx) ||
    heightPx <= 0 ||
    !sourceUrl ||
    !capturedAt
  ) {
    return { ok: false, error: 'incomplete' };
  }

  if (!/^https?:\/\/\S+$/i.test(sourceUrl)) {
    return { ok: false, error: 'invalid' };
  }

  const capturedAtIso = normalizeDateTimeLocal(capturedAt);
  if (!capturedAtIso) {
    return { ok: false, error: 'invalid' };
  }

  return {
    ok: true,
    command: {
      place_id: placeId,
      kind: 'evidence_screenshot',
      mime_type: mimeType,
      byte_size: byteSize,
      width_px: widthPx,
      height_px: heightPx,
      source_url: sourceUrl,
      captured_at: capturedAtIso
    }
  };
}

export function parseRegisterPhotoFormData(form: FormData): RegisterPhotoInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const placeId = value('placeId');
  const mimeType = value('mimeType');
  const byteSize = Number(value('byteSize'));
  const widthPx = Number(value('widthPx'));
  const heightPx = Number(value('heightPx'));

  if (
    !placeId ||
    !isAllowedPlaceMediaMimeType(mimeType) ||
    !Number.isInteger(byteSize) ||
    byteSize <= 0 ||
    byteSize > maxPlaceMediaBytes ||
    !Number.isInteger(widthPx) ||
    widthPx <= 0 ||
    !Number.isInteger(heightPx) ||
    heightPx <= 0
  ) {
    return { ok: false, error: 'incomplete' };
  }

  return {
    ok: true,
    command: {
      place_id: placeId,
      kind: 'photo',
      mime_type: mimeType,
      byte_size: byteSize,
      width_px: widthPx,
      height_px: heightPx
    }
  };
}

export function parseApprovePlaceMediaFormData(form: FormData): ApprovePlaceMediaInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const mediaId = value('mediaId');
  const photographerOrUploader = value('photographerOrUploader');
  const sourceOrCaptureDate = value('sourceOrCaptureDate');
  const licenseReference = value('licenseReference');
  const rightsBasis = value('rightsBasis');
  const rightsEvidenceReference = value('rightsEvidenceReference');
  const sourceUrl = value('sourceUrl');
  const licenseUrl = value('licenseUrl');
  const attributionText = value('attributionText');
  const attributionUrl = value('attributionUrl');
  const peopleReview = value('peopleReview');
  const makePrimary = value('makePrimary') === 'on';
  const altTextIs = value('altTextIs');
  const altTextEn = value('altTextEn');

  if (
    !mediaId ||
    !photographerOrUploader ||
    !sourceOrCaptureDate ||
    !licenseReference ||
    !placePhotoRightsBases.includes(rightsBasis as PlacePhotoRightsBasis) ||
    !rightsEvidenceReference ||
    !attributionText ||
    !completedPlacePhotoPeopleReviews.includes(peopleReview as CompletedPlacePhotoPeopleReview) ||
    !altTextIs ||
    !altTextEn
  ) {
    return { ok: false, error: 'incomplete' };
  }

  if (rightsBasis !== 'explicit_permission' && (!sourceUrl || !licenseUrl)) {
    return { ok: false, error: 'incomplete' };
  }

  if (
    (sourceUrl && !isHttpUrl(sourceUrl)) ||
    (licenseUrl && !isHttpUrl(licenseUrl)) ||
    (attributionUrl && !isHttpUrl(attributionUrl))
  ) {
    return { ok: false, error: 'invalid' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceOrCaptureDate)) {
    return { ok: false, error: 'invalid' };
  }

  return {
    ok: true,
    command: {
      media_id: mediaId,
      photographer_or_uploader: photographerOrUploader,
      source_or_capture_date: sourceOrCaptureDate,
      license_reference: licenseReference,
      rights_basis: rightsBasis as PlacePhotoRightsBasis,
      rights_evidence_reference: rightsEvidenceReference,
      source_url: sourceUrl || null,
      license_url: licenseUrl || null,
      attribution_text: attributionText,
      attribution_url: attributionUrl || null,
      people_review: peopleReview as CompletedPlacePhotoPeopleReview,
      make_primary: makePrimary,
      alt_text_is: altTextIs,
      alt_text_en: altTextEn
    }
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

// datetime-local inputs (`<input type="datetime-local">`) submit "YYYY-MM-DDTHH:MM" with no
// timezone; treated as UTC to match every other timestamp boundary in this app.
function normalizeDateTimeLocal(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00.000Z`;
  }
  if (!Number.isNaN(Date.parse(value))) {
    return value;
  }
  return null;
}
