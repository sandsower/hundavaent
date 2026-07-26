/**
 * The shared vocabulary of a Member photo submission: what the endpoint accepts and what the card
 * renders. Kept out of the transport module so the endpoint can hold the same cap the picker
 * advertises without importing a browser-facing `fetch` wrapper.
 */

export type MemberPhotoApprovalState = 'pending' | 'approved' | 'rejected';

/** The approved per-file cap, and the default of `private.place_media_member_policy.byte_limit`. */
export const maxMemberPhotoBytes = 8 * 1024 * 1024;

export const acceptedMemberPhotoTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedMemberPhotoType = (typeof acceptedMemberPhotoTypes)[number];

/**
 * One of the caller's own photos on a Place. `url` is a freshly minted signed URL and can be null
 * when signing failed, so a strip renders the rest rather than nothing.
 */
export interface MemberPlacePhoto {
  mediaId: string;
  url: string | null;
  approvalState: MemberPhotoApprovalState;
  widthPx: number;
  heightPx: number;
  uploadedAt: string;
}

export function isAcceptedMemberPhotoType(value: string): value is AcceptedMemberPhotoType {
  return (acceptedMemberPhotoTypes as readonly string[]).includes(value);
}
