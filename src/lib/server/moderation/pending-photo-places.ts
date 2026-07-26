import type { RequestSupabaseClient } from '$server/db/clients';
import { listPlacesWithPendingPhotos } from '$server/place-media/place-media';

import { getCandidatePublicationReview } from './place-moderation';

/**
 * The Places holding Member photos, named.
 *
 * `list_places_with_pending_photos` returns identifiers and counts and nothing else, because the
 * database function that knows about photos has no business deciding what a Place is called. The
 * names come from the review read a Moderator already uses, which is the one read that answers for
 * a Candidate and a published Place alike.
 */
export interface ModerationPendingPhotoPlace {
  readonly placeId: string;
  readonly nameIs: string | null;
  readonly nameEn: string | null;
  readonly operatorName: string;
  readonly pendingPhotoCount: number;
  readonly newestUploadedAt: string;
}

export type ModerationPendingPhotoPlacesResult =
  | { status: 'success'; value: ModerationPendingPhotoPlace[] }
  | { status: 'forbidden' | 'infrastructure_error' };

/**
 * How many Places the section names at once. The work list is a place to start from, not an
 * inventory, and every entry beyond this one costs a review read on a page that already makes
 * several. A Moderator who clears these sees the next ones on the following load.
 *
 * The number travels to the database rather than trimming the answer here, so a backlog of a
 * thousand waiting Places is never aggregated and returned only to be thrown away.
 */
export const moderationPendingPhotoPlaceLimit = 6;

export async function loadModerationPendingPhotoPlaces(
  client: RequestSupabaseClient
): Promise<ModerationPendingPhotoPlacesResult> {
  const listed = await listPlacesWithPendingPhotos(client, moderationPendingPhotoPlaceLimit);
  if (listed.status !== 'success') return { status: listed.status };

  const named = await Promise.all(
    listed.value.map(async (place) => {
      const review = await getCandidatePublicationReview(client, place.placeId);
      if (review.status !== 'success') return null;
      return {
        placeId: place.placeId,
        nameIs: review.value.nameIs,
        nameEn: review.value.nameEn,
        operatorName: review.value.operatorName,
        pendingPhotoCount: place.pendingPhotoCount,
        newestUploadedAt: place.newestUploadedAt
      };
    })
  );

  // A Place whose review cannot be read is not one this Moderator could act on anyway, so it is
  // dropped rather than listed under a name nobody could supply.
  return { status: 'success', value: named.filter((place) => place !== null) };
}
