import {
  maxMemberPhotoBytes,
  type MemberPhotoApprovalState,
  type MemberPlacePhoto
} from '$lib/contributions/photo';

/**
 * The correction vocabulary plus `too_large`. A file over the cap is the one refusal the picker
 * can explain in terms the Member controls, so it does not get folded into `invalid`.
 */
export type PlacePhotoUploadResult =
  | { status: 'submitted'; mediaId: string; approvalState: MemberPhotoApprovalState }
  | { status: 'authentication_required' }
  | { status: 'rate_limited' }
  | { status: 'too_large' }
  | { status: 'invalid' }
  | { status: 'unavailable' };

export type MyPlacePhotosResult =
  | { status: 'loaded'; photos: MemberPlacePhoto[] }
  | { status: 'authentication_required' }
  | { status: 'invalid' }
  | { status: 'unavailable' };

/**
 * The transport for a Member photo. The file goes up as multipart because the server has to see
 * the real bytes: it identifies the container, reads the dimensions and strips the metadata
 * itself, so nothing the client could describe about the file would be believed anyway.
 *
 * The cap is checked here as well as on the server, to spend nothing uploading a file that is
 * already known to be refused. The server's copy is the one that decides.
 */
export async function uploadPlacePhoto(
  placeId: string,
  file: File
): Promise<PlacePhotoUploadResult> {
  if (file.size > maxMemberPhotoBytes) return { status: 'too_large' };

  const body = new FormData();
  body.set('file', file);

  let response: Response;
  try {
    response = await fetch(`/api/places/${encodeURIComponent(placeId)}/photos`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) return { status: 'authentication_required' };
  if (response.status === 413) return { status: 'too_large' };
  if (response.status === 429) return { status: 'rate_limited' };
  if (response.status === 400) return { status: 'invalid' };
  if (!response.ok) return { status: 'unavailable' };

  let payload: { status?: unknown; mediaId?: unknown; approvalState?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { status: 'unavailable' };
  }

  if (
    payload.status !== 'submitted' ||
    typeof payload.mediaId !== 'string' ||
    !isApprovalState(payload.approvalState)
  ) {
    return { status: 'unavailable' };
  }

  return { status: 'submitted', mediaId: payload.mediaId, approvalState: payload.approvalState };
}

/**
 * The caller's own photos on one Place. A signed-out reader has none to fetch, so the caller
 * decides whether to ask at all and reads `authentication_required` as "nothing pending".
 */
export async function fetchMyPlacePhotos(placeId: string): Promise<MyPlacePhotosResult> {
  let response: Response;
  try {
    response = await fetch(`/api/places/${encodeURIComponent(placeId)}/photos`);
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401) return { status: 'authentication_required' };
  if (response.status === 400) return { status: 'invalid' };
  if (!response.ok) return { status: 'unavailable' };

  let payload: { photos?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { status: 'unavailable' };
  }

  if (!Array.isArray(payload.photos) || !payload.photos.every(isMemberPlacePhoto)) {
    return { status: 'unavailable' };
  }

  return { status: 'loaded', photos: payload.photos };
}

function isApprovalState(value: unknown): value is MemberPhotoApprovalState {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

function isMemberPlacePhoto(value: unknown): value is MemberPlacePhoto {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.mediaId === 'string' &&
    (candidate.url === null || typeof candidate.url === 'string') &&
    isApprovalState(candidate.approvalState) &&
    typeof candidate.widthPx === 'number' &&
    typeof candidate.heightPx === 'number' &&
    typeof candidate.uploadedAt === 'string'
  );
}
