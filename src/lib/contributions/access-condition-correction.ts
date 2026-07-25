import type { AccessArea, RestraintCondition } from '$domain/access';

/**
 * The shared contract between the inline affordances and the endpoint that validates them. It
 * lives outside `$lib/server` because the affordances need the same cap and the same choice lists
 * the server enforces, and a browser bundle may not reach into server-only code.
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

/**
 * `other_bounded` is absent for the same reason `other_sourced` is: it says nothing without the
 * sourced area note that explains which bounded area is meant.
 */
export type MemberAreaChoice = Exclude<AccessArea, 'other_bounded'>;

export const memberAreaChoices: readonly MemberAreaChoice[] = [
  'indoors',
  'outdoors',
  'designated_area'
];

/**
 * One arm per Access Condition dimension a Member can edit inline. Widening the surface means
 * adding an arm here, a case in `parseDimensionChange`, a swap case and a change summary, and
 * every one of those is a compile error until it is written.
 */
export type AccessConditionDimensionChange =
  | { dimension: 'restraint'; value: MemberRestraintChoice }
  | { dimension: 'area'; value: MemberAreaChoice };

export type AccessConditionDimension = AccessConditionDimensionChange['dimension'];

export type MemberDimensionChoice = AccessConditionDimensionChange['value'];

export const memberDimensionChoices: Record<
  AccessConditionDimension,
  readonly MemberDimensionChoice[]
> = {
  restraint: memberRestraintChoices,
  area: memberAreaChoices
};

export interface AccessConditionCorrectionTarget {
  target: 'access_condition';
  accessConditionId: string;
}

export type AccessConditionCorrectionInput = AccessConditionCorrectionTarget &
  AccessConditionDimensionChange & { note: string | null };

/**
 * The whole request vocabulary, discriminated on `target`. There is one arm today; a place-field
 * arm joins it beside this one rather than reshaping it.
 */
export type CorrectionInput = AccessConditionCorrectionInput;

/**
 * The single place a dimension name is paired with a value it is allowed to carry. Both the
 * endpoint's parser and the inline editor read it, so a value the group cannot represent is
 * rejected identically at both ends.
 */
export function parseDimensionChange(
  dimension: string,
  value: unknown
): AccessConditionDimensionChange | null {
  if (typeof value !== 'string') return null;
  if (dimension === 'restraint' && isMemberRestraintChoice(value)) {
    return { dimension: 'restraint', value };
  }
  if (dimension === 'area' && isMemberAreaChoice(value)) return { dimension: 'area', value };
  return null;
}

export function isMemberRestraintChoice(value: string): value is MemberRestraintChoice {
  return memberRestraintChoices.some((choice) => choice === value);
}

export function isMemberAreaChoice(value: string): value is MemberAreaChoice {
  return memberAreaChoices.some((choice) => choice === value);
}
