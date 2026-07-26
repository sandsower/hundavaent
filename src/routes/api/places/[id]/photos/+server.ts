import { isAcceptedMemberPhotoType, maxMemberPhotoBytes } from '$lib/contributions/photo';
import { requireMemberResponse } from '$server/auth/require-member-response';
import { privateJson } from '$server/http/private-json';
import { memberPlacePhotoNamespace } from '$server/place-media/place-media-input';
import {
  getMyPlacePhotoAllowance,
  listMyPlacePhotos,
  removePlaceMediaObject,
  signPlaceMediaUrls,
  submitPlacePhoto,
  uploadPlaceMediaObject,
  type MemberPlacePhotoResult
} from '$server/place-media/place-media';
import { createPlacePhotoStorageClient } from '$server/place-media/place-photo-storage';
import { inspectImage, stripImageMetadata } from '$server/place-media/strip-image-metadata';

import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * How much a multipart envelope may add on top of the file itself before the declared length is
 * read as a request too large to bother with. A boundary, one part header and a file name are
 * hundreds of bytes; this is generous enough that no honest browser trips it and tight enough that
 * a caller announcing far more than the cap is refused without the body being read at all.
 */
const multipartOverheadSlackBytes = 16 * 1024;

/**
 * A Member submits a photo of a Place, held for review.
 *
 * The whole point of routing bytes through the server is what happens between reading the file and
 * writing Storage: the container is identified from its own leading bytes rather than the declared
 * type, its dimensions are read from its own header rather than from the client, and its metadata
 * is removed. Handing a Member a direct Storage write would make all three advisory - and an
 * approved photo is served verbatim to anonymous callers, so an unstripped EXIF block would
 * publish wherever its uploader was standing.
 */
export const POST: RequestHandler = async (event) => {
  if (!uuidPattern.test(event.params.id)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const suppliedCommandId = event.request.headers.get('idempotency-key');
  if (suppliedCommandId !== null && !uuidPattern.test(suppliedCommandId)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const authError = await requireMemberResponse(event);
  if (authError) return authError;
  if (!event.locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  // A declared length past the cap is refused before the body is read, so an oversized upload
  // costs the connection rather than the transfer. The declared length is a claim, so the measured
  // size is still checked below; this only saves the obvious case.
  const declaredLength = Number(event.request.headers.get('content-length') ?? '');
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxMemberPhotoBytes + multipartOverheadSlackBytes
  ) {
    return privateJson({ error: 'too_large' }, 413);
  }

  // The caps are enforced inside submit_place_photo, under the actor lock, and that stays the
  // authority. This is the look ahead: a Member already at their limit is told so here, rather
  // than after a multipart read, a metadata strip and a Storage write that all have to be undone.
  const allowance = await getMyPlacePhotoAllowance(event.locals.supabase, event.params.id);
  if (allowance.status !== 'success') {
    return privateJson({ error: allowance.status }, memberPhotoErrorStatus(allowance.status));
  }
  if (allowance.value.remainingPending <= 0 || allowance.value.remainingWindow <= 0) {
    return privateJson({ error: 'rate_limited' }, 429);
  }

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return privateJson({ error: 'invalid_request' }, 400);
  }
  if (file.size > maxMemberPhotoBytes) {
    return privateJson({ error: 'too_large' }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxMemberPhotoBytes) {
    return privateJson({ error: 'too_large' }, 413);
  }

  const inspection = inspectImage(bytes);
  if (!inspection.ok) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  // The declared type has to agree with the bytes. A mismatch is not something to reconcile in the
  // uploader's favour: it is either a broken client or a file pretending to be an image.
  const declaredType = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!isAcceptedMemberPhotoType(declaredType) || declaredType !== inspection.value.container) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  // A file whose container will not parse is answered in the same `invalid_request` vocabulary as
  // a file of the wrong type, and the picker says "Photos have to be JPEG, PNG or WebP." for both.
  // That is imprecise for a corrupt JPEG, and deliberately left so: a second refusal message would
  // have to be worded, translated and tested to tell a Member something they can act on no
  // differently. Choosing another file is the answer either way.
  const stripped = stripImageMetadata(bytes, inspection.value.container);
  if (!stripped.ok) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  // Nothing is stored that cannot be read back. A stripped file whose dimensions moved means the
  // surgery went wrong, which is this server's bug and not the caller's request to retry.
  const restripped = inspectImage(stripped.bytes);
  if (
    !restripped.ok ||
    restripped.value.container !== inspection.value.container ||
    restripped.value.widthPx !== inspection.value.widthPx ||
    restripped.value.heightPx !== inspection.value.heightPx
  ) {
    return privateJson({ error: 'unavailable' }, 503);
  }

  const storageClient = createPlacePhotoStorageClient();
  if (!storageClient) {
    return privateJson({ error: 'unavailable' }, 503);
  }

  const upload = await uploadPlaceMediaObject(
    storageClient,
    'photo',
    event.params.id,
    new File([stripped.bytes], file.name, { type: inspection.value.container }),
    inspection.value.container,
    memberPlacePhotoNamespace
  );
  if (!upload.ok) {
    return privateJson({ error: 'unavailable' }, 503);
  }

  // The registration runs as the Member, not as the service role: `uploaded_by` is derived from
  // the caller inside the RPC, and the abuse policy is counted against them.
  const result = await submitPlacePhoto(
    event.locals.supabase,
    {
      place_id: event.params.id,
      storage_object_path: upload.objectPath,
      mime_type: inspection.value.container,
      byte_size: stripped.bytes.byteLength,
      width_px: inspection.value.widthPx,
      height_px: inspection.value.heightPx
    },
    suppliedCommandId ?? crypto.randomUUID()
  );

  if (result.status !== 'success') {
    await removePlaceMediaObject(storageClient, 'place-photos', upload.objectPath);
    return privateJson({ error: result.status }, memberPhotoErrorStatus(result.status));
  }

  // A replayed request id returns the row the first attempt created, which points at the object
  // that attempt wrote. The one this attempt just wrote is referenced by nothing, so it goes -
  // otherwise every retry of a successful upload leaves a full-sized orphan behind.
  if (result.value.storageObjectPath !== upload.objectPath) {
    await removePlaceMediaObject(storageClient, 'place-photos', upload.objectPath);
  }

  return privateJson({
    status: 'submitted',
    mediaId: result.value.mediaId,
    approvalState: result.value.approvalState,
    uploadedAt: result.value.uploadedAt
  });
};

/**
 * The caller's own photos on this Place, in every approval state, with signed URLs minted through
 * the uploader gateway. `privateJson` sends `private, no-store` and `vary: cookie`, which is what
 * makes a per-caller projection safe on a cached route.
 */
export const GET: RequestHandler = async (event) => {
  if (!uuidPattern.test(event.params.id)) {
    return privateJson({ error: 'invalid_request' }, 400);
  }

  const authError = await requireMemberResponse(event);
  if (authError) return authError;
  if (!event.locals.supabase) return privateJson({ error: 'unavailable' }, 503);

  const result = await listMyPlacePhotos(event.locals.supabase, event.params.id);
  if (result.status !== 'success') {
    return privateJson({ error: result.status }, memberPhotoErrorStatus(result.status));
  }

  const signedUrls = await signPlaceMediaUrls(
    event.locals.supabase,
    'place-photos',
    result.value.map((photo) => photo.storageObjectPath)
  );

  return privateJson({
    photos: result.value.map((photo) => ({
      mediaId: photo.mediaId,
      url: signedUrls.get(photo.storageObjectPath) ?? null,
      approvalState: photo.approvalState,
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
      uploadedAt: photo.uploadedAt
    }))
  });
};

function memberPhotoErrorStatus(
  status: Exclude<MemberPlacePhotoResult<never>['status'], 'success'>
): number {
  switch (status) {
    case 'rate_limited':
      return 429;
    case 'forbidden':
      return 401;
    case 'conflict':
      return 409;
    case 'invalid':
      return 400;
    default:
      return 503;
  }
}
