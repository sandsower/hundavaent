import type { RequestSupabaseClient } from '$server/db/clients';
import type { Json } from '$server/db/generated.types';
import type { CommandResult } from '$domain/results';

import {
  buildPlaceMediaObjectPath,
  type CompletedPlacePhotoPeopleReview,
  type PlacePhotoRightsBasis,
  type PlaceMediaMimeType,
  type RegisterEvidenceCommand,
  type RegisterPhotoCommand
} from './place-media-input';

export type PlaceMediaKind = 'evidence_screenshot' | 'photo';
export type PlaceMediaApprovalState = 'pending' | 'approved' | 'rejected';
export type PlacePhotoPeopleReview = 'unknown' | CompletedPlacePhotoPeopleReview;

export interface RegisteredPlaceMedia {
  mediaId: string;
  kind: PlaceMediaKind;
  approvalState: PlaceMediaApprovalState;
  uploadedAt: string;
}

export interface ModerationPlaceMediaItem {
  mediaId: string;
  kind: PlaceMediaKind;
  storageBucket: string;
  storageObjectPath: string;
  mimeType: string;
  byteSize: number;
  widthPx: number;
  heightPx: number;
  sourceUrl: string | null;
  capturedAt: string | null;
  capturedBy: string | null;
  photographerOrUploader: string | null;
  sourceOrCaptureDate: string | null;
  licenseReference: string | null;
  rightsBasis: PlacePhotoRightsBasis | null;
  rightsEvidenceReference: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  attributionUrl: string | null;
  contentSha256: string | null;
  peopleReview: PlacePhotoPeopleReview | null;
  isPrimary: boolean;
  altTextIs: string | null;
  altTextEn: string | null;
  approvalState: PlaceMediaApprovalState;
  approvedBy: string | null;
  approvedAt: string | null;
  uploadedBy: string;
  uploadedAt: string;
  retiredAt: string | null;
  retiredBy: string | null;
}

export interface PublicPlacePhoto {
  mediaId: string;
  storageBucket: string;
  storageObjectPath: string;
  widthPx: number;
  heightPx: number;
  altTextIs: string;
  altTextEn: string;
  rightsBasis: PlacePhotoRightsBasis | null;
  sourceUrl: string | null;
  licenseReference: string;
  licenseUrl: string | null;
  attributionText: string;
  attributionUrl: string | null;
  isPrimary: boolean;
}

export type ModerationPlaceMediaResult =
  | { status: 'success'; value: ModerationPlaceMediaItem[] }
  | { status: 'forbidden' }
  | { status: 'infrastructure_error' };

export type PublicPlacePhotosResult =
  { status: 'success'; value: PublicPlacePhoto[] } | { status: 'infrastructure_error' };

export interface ApprovedPlaceMedia {
  mediaId: string;
  approvalState: PlaceMediaApprovalState;
  approvedAt: string;
}

export interface RejectedPlaceMedia {
  mediaId: string;
  approvalState: PlaceMediaApprovalState;
}

export interface RetiredPlaceMedia {
  mediaId: string;
  retiredAt: string;
}

// Registers a Storage object that has already been uploaded (see uploadPlaceMediaObject) as
// Evidence or a candidate Photo. The Storage upload and this registration call are two separate
// round trips; an upload that succeeds but never gets registered leaves an orphan object that is
// unreachable to every role except a Moderator (evidence bucket) or nobody at all (photos bucket,
// since the public read policy requires a matching row).
export async function registerPlaceMedia(
  client: RequestSupabaseClient,
  command: RegisterEvidenceCommand | RegisterPhotoCommand,
  requestId: string
): Promise<CommandResult<RegisteredPlaceMedia>> {
  try {
    const { data, error } = await client.rpc('register_place_media', {
      command_payload: command as unknown as Json,
      command_request_id: requestId
    });

    if (error) {
      return mapCommandError(error.code);
    }

    if (data.length !== 1 || !data[0]) {
      return { status: 'infrastructure_error' };
    }

    const row = data[0];
    return {
      status: 'success',
      value: {
        mediaId: row.media_id,
        kind: row.kind as PlaceMediaKind,
        approvalState: row.approval_state as PlaceMediaApprovalState,
        uploadedAt: row.uploaded_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getModerationPlaceMedia(
  client: RequestSupabaseClient,
  placeId: string
): Promise<ModerationPlaceMediaResult> {
  try {
    const { data, error } = await client.rpc('get_moderation_place_media', {
      requested_place_id: placeId
    });

    if (error) {
      return error.code === '42501' ? { status: 'forbidden' } : { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: data.map((row) => ({
        mediaId: row.media_id,
        kind: row.kind as PlaceMediaKind,
        storageBucket: row.storage_bucket,
        storageObjectPath: row.storage_object_path,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        widthPx: row.width_px,
        heightPx: row.height_px,
        sourceUrl: row.source_url,
        capturedAt: row.captured_at,
        capturedBy: row.captured_by,
        photographerOrUploader: row.photographer_or_uploader,
        sourceOrCaptureDate: row.source_or_capture_date,
        licenseReference: row.license_reference,
        rightsBasis: row.rights_basis as PlacePhotoRightsBasis | null,
        rightsEvidenceReference: row.rights_evidence_reference,
        licenseUrl: row.license_url,
        attributionText: row.attribution_text,
        attributionUrl: row.attribution_url,
        contentSha256: row.content_sha256,
        peopleReview: row.people_review as PlacePhotoPeopleReview | null,
        isPrimary: row.is_primary,
        altTextIs: row.alt_text_is,
        altTextEn: row.alt_text_en,
        approvalState: row.approval_state as PlaceMediaApprovalState,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        uploadedBy: row.uploaded_by,
        uploadedAt: row.uploaded_at,
        retiredAt: row.retired_at,
        retiredBy: row.retired_by
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function approvePlaceMedia(
  client: RequestSupabaseClient,
  command: {
    mediaId: string;
    photographerOrUploader: string;
    sourceOrCaptureDate: string;
    licenseReference: string;
    rightsBasis: PlacePhotoRightsBasis;
    rightsEvidenceReference: string;
    sourceUrl: string | null;
    licenseUrl: string | null;
    attributionText: string;
    attributionUrl: string | null;
    peopleReview: CompletedPlacePhotoPeopleReview;
    makePrimary: boolean;
    altTextIs: string;
    altTextEn: string;
  },
  requestId: string
): Promise<CommandResult<ApprovedPlaceMedia>> {
  try {
    const { data, error } = await client.rpc('approve_place_media', {
      command_payload: {
        media_id: command.mediaId,
        photographer_or_uploader: command.photographerOrUploader,
        source_or_capture_date: command.sourceOrCaptureDate,
        license_reference: command.licenseReference,
        rights_basis: command.rightsBasis,
        rights_evidence_reference: command.rightsEvidenceReference,
        source_url: command.sourceUrl,
        license_url: command.licenseUrl,
        attribution_text: command.attributionText,
        attribution_url: command.attributionUrl,
        people_review: command.peopleReview,
        make_primary: command.makePrimary,
        alt_text_is: command.altTextIs,
        alt_text_en: command.altTextEn
      } as Json,
      command_request_id: requestId
    });

    if (error) {
      return mapCommandError(error.code);
    }

    if (data.length !== 1 || !data[0]) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: {
        mediaId: data[0].media_id,
        approvalState: data[0].approval_state as PlaceMediaApprovalState,
        approvedAt: data[0].approved_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function rejectPlaceMedia(
  client: RequestSupabaseClient,
  mediaId: string,
  requestId: string
): Promise<CommandResult<RejectedPlaceMedia>> {
  try {
    const { data, error } = await client.rpc('reject_place_media', {
      command_payload: { media_id: mediaId } as Json,
      command_request_id: requestId
    });

    if (error) {
      return mapCommandError(error.code);
    }

    if (data.length !== 1 || !data[0]) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: {
        mediaId: data[0].media_id,
        approvalState: data[0].approval_state as PlaceMediaApprovalState
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function retirePlaceMedia(
  client: RequestSupabaseClient,
  mediaId: string,
  requestId: string
): Promise<CommandResult<RetiredPlaceMedia>> {
  try {
    const { data, error } = await client.rpc('retire_place_media', {
      command_payload: { media_id: mediaId } as Json,
      command_request_id: requestId
    });

    if (error) {
      return mapCommandError(error.code);
    }

    if (data.length !== 1 || !data[0] || !data[0].retired_at) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: { mediaId: data[0].media_id, retiredAt: data[0].retired_at }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function listPublishedPlacePhotos(
  client: RequestSupabaseClient,
  placeId: string
): Promise<PublicPlacePhotosResult> {
  try {
    const { data, error } = await client.rpc('list_published_place_photos', {
      requested_place_id: placeId
    });

    if (error) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: data.map((row) => ({
        mediaId: row.media_id,
        storageBucket: row.storage_bucket,
        storageObjectPath: row.storage_object_path,
        widthPx: row.width_px,
        heightPx: row.height_px,
        altTextIs: row.alt_text_is,
        altTextEn: row.alt_text_en,
        rightsBasis: row.rights_basis as PlacePhotoRightsBasis | null,
        sourceUrl: row.source_url,
        licenseReference: row.license_reference,
        licenseUrl: row.license_url,
        attributionText: row.attribution_text,
        attributionUrl: row.attribution_url,
        isPrimary: row.is_primary
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export type PlaceMediaUploadResult =
  { ok: true; objectPath: string } | { ok: false; error: 'infrastructure_error' };

// Uploads bytes already validated (type, size) by the caller to the bucket implied by `kind`.
// Storage authorization is enforced by the storage.objects RLS policies from the place-media
// migration (Moderator-only for both buckets at write time), not by this helper.
export async function uploadPlaceMediaObject(
  client: RequestSupabaseClient,
  kind: PlaceMediaKind,
  placeId: string,
  file: File,
  mimeType: PlaceMediaMimeType
): Promise<PlaceMediaUploadResult> {
  const bucket = kind === 'evidence_screenshot' ? 'place-evidence' : 'place-photos';
  const objectPath = buildPlaceMediaObjectPath(placeId, crypto.randomUUID(), mimeType);

  const { error } = await client.storage.from(bucket).upload(objectPath, file, {
    contentType: mimeType,
    upsert: false
  });

  if (error) {
    return { ok: false, error: 'infrastructure_error' };
  }

  return { ok: true, objectPath };
}

// Short-lived signed URLs, minted fresh on every render from the request-scoped (RLS-respecting)
// client: signing itself re-checks the same storage.objects policy that gates a direct fetch, so
// a bug that let an unapproved path through the RPC layer still cannot produce a working URL.
//
// RLS is evaluated once, at mint time, not on every subsequent fetch of the signed URL - a signed
// URL is a bearer token, so anyone holding it can fetch the object until it expires, even if the
// underlying row is retired or rejected a second later. The 5-minute TTL below is the resulting
// takedown-latency bound: a retired/rejected photo remains fetchable through an already-issued URL
// for at most 300 seconds, and the next page render (which mints fresh URLs from the current RLS
// state) will not reissue one at all. Immediate revocation would require app-proxied delivery
// (streaming bytes through our own server instead of a redirect to Storage), which is out of scope
// for this implementation.
export async function signPlaceMediaUrl(
  client: RequestSupabaseClient,
  bucket: 'place-evidence' | 'place-photos',
  objectPath: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

/**
 * Signs several objects from one bucket through Storage's batch boundary.
 * Missing or rejected paths are omitted so one unavailable photo does not suppress its siblings.
 */
export async function signPlaceMediaUrls(
  client: RequestSupabaseClient,
  bucket: 'place-evidence' | 'place-photos',
  objectPaths: readonly string[],
  expiresInSeconds = 300
): Promise<Map<string, string>> {
  const signedUrls = new Map<string, string>();
  if (objectPaths.length === 0) return signedUrls;

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls([...objectPaths], expiresInSeconds);
    if (error || !Array.isArray(data)) return signedUrls;

    for (const result of data) {
      if (typeof result.path === 'string' && typeof result.signedUrl === 'string') {
        signedUrls.set(result.path, result.signedUrl);
      }
    }
  } catch {
    // Media is supplementary. Callers receive an empty set and retain their core content.
  }
  return signedUrls;
}

function mapCommandError(code: string): CommandResult<never> {
  if (code === '42501') {
    return { status: 'forbidden' };
  }

  if (code === '22023' || code === '23502' || code === '23514') {
    return { status: 'validation_error' };
  }

  if (code === '23505' || code === '55006' || code === '40001') {
    return { status: 'conflict' };
  }

  return { status: 'infrastructure_error' };
}
