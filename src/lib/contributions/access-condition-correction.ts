import type { RestraintCondition } from '$domain/access';

/**
 * The shared contract between the inline affordance and the endpoint that validates it. It lives
 * outside `$lib/server` because the form needs the same cap and the same choice list the server
 * enforces, and a browser bundle may not reach into server-only code.
 */

/**
 * A one-line note, not an essay. The Member is telling a Moderator what they saw, and the
 * database rejects an empty explanation, so the cap keeps the field honest at both ends.
 */
export const memberNoteMaximumLength = 280;

/**
 * `other_sourced` is deliberately absent. It is only valid alongside a sourced restraint note,
 * which is the Moderator worksheet this whole phase exists to stop asking Members to fill in.
 */
export type MemberRestraintChoice = Exclude<RestraintCondition, 'other_sourced'>;

export const memberRestraintChoices: readonly MemberRestraintChoice[] = [
  'leash_required',
  'off_leash_permitted',
  'carrier_required'
];

export interface AccessConditionCorrectionInput {
  accessConditionId: string;
  restraintCondition: MemberRestraintChoice;
  note: string | null;
}
