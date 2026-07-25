import type {
  AccessArea,
  DogEligibility,
  PermissionRequirement,
  RestraintCondition
} from '$domain/access';

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
 * Free text a Member types into a place-field editor. The database puts no ceiling on any of
 * these, so the ceiling has to live here or there is none: a Correction body is stored verbatim
 * in jsonb and read by a Moderator, and neither should have to absorb an essay.
 */
export const memberFieldTextMaximumLength = 200;
export const memberUrlMaximumLength = 2048;
export const memberAmenityMaximumCount = 20;

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
 * Permission has no sourced-note escape hatch in the domain, so every value it can hold is a value
 * a Member may choose.
 */
export type MemberPermissionChoice = PermissionRequirement;

export const memberPermissionChoices: readonly MemberPermissionChoice[] = [
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
];

/**
 * The radio key for eligibility, which is the one dimension whose choice is not its stored value:
 * "restricted" means nothing without the number that bounds it, and that number is a separate
 * control. `notes` is absent on purpose, because a sourced eligibility note is Moderator text.
 */
export type MemberEligibilityChoice = 'all_dogs' | 'maximum_weight_kg' | 'maximum_dogs';

export const memberEligibilityChoices: readonly MemberEligibilityChoice[] = [
  'all_dogs',
  'maximum_weight_kg',
  'maximum_dogs'
];

/**
 * Mirrors `private.is_valid_dog_eligibility` minus the notes shape: exactly one limit, or none.
 */
export type MemberEligibilityValue =
  | { scope: 'all_dogs' }
  | { scope: 'restricted'; maximumWeightKg: number }
  | { scope: 'restricted'; maximumDogs: number };

/**
 * One arm per Access Condition dimension a Member can edit inline. Widening the surface means
 * adding an arm here, a case in `parseDimensionChange`, a swap case and a change summary, and
 * every one of those is a compile error until it is written.
 */
export type AccessConditionDimensionChange =
  | { dimension: 'restraint'; value: MemberRestraintChoice }
  | { dimension: 'area'; value: MemberAreaChoice }
  | { dimension: 'permission'; value: MemberPermissionChoice }
  | { dimension: 'eligibility'; value: MemberEligibilityValue };

export type AccessConditionDimension = AccessConditionDimensionChange['dimension'];

export type MemberDimensionChoice =
  MemberRestraintChoice | MemberAreaChoice | MemberPermissionChoice | MemberEligibilityChoice;

// `satisfies` rather than an annotation: every dimension must still be listed, and an editor that
// reads one dimension's choices still gets that dimension's own type rather than the whole union.
export const memberDimensionChoices = {
  restraint: memberRestraintChoices,
  area: memberAreaChoices,
  permission: memberPermissionChoices,
  eligibility: memberEligibilityChoices
} satisfies Record<AccessConditionDimension, readonly MemberDimensionChoice[]>;

export interface AccessConditionCorrectionTarget {
  target: 'access_condition';
  accessConditionId: string;
}

export type AccessConditionCorrectionInput = AccessConditionCorrectionTarget &
  AccessConditionDimensionChange & { note: string | null };

/**
 * The Place fields a Member edits inline. `description` and `opening_hours` are deliberately
 * absent: the card does not render either, and opening hours have no schema an editor could be
 * built over.
 */
export type MemberPlaceField = 'name' | 'website_url' | 'phone' | 'dog_amenities';

export const memberPlaceFields: readonly MemberPlaceField[] = [
  'name',
  'website_url',
  'phone',
  'dog_amenities'
];

/**
 * The name arm carries the Member's single-locale text, never a locale map. The endpoint knows the
 * locale from its `lang` parameter and builds the omitted-locale hatch from it, so a client cannot
 * name which language it is writing, let alone write both.
 */
export type PlaceFieldChange =
  | { field: 'name'; value: string }
  | { field: 'website_url'; value: string | null }
  | { field: 'phone'; value: string | null }
  | { field: 'dog_amenities'; value: string[] };

export interface PlaceFieldCorrectionTarget {
  target: 'place_field';
}

export type PlaceFieldCorrectionInput = PlaceFieldCorrectionTarget &
  PlaceFieldChange & { note: string | null };

/**
 * The whole request vocabulary, discriminated on `target`.
 */
export type CorrectionInput = AccessConditionCorrectionInput | PlaceFieldCorrectionInput;

/**
 * Every Place field a flag can target, not only the four a Member edits inline: a pending
 * Correction raised on the legacy form still has to reach the reader. The server's `PlaceField`
 * mirrors the same database enum, and a type test holds the two together.
 */
export type PendingPlaceField = MemberPlaceField | 'description' | 'opening_hours';

/**
 * One open flag of the caller's on one Place, as the pending read returns it. Only the addressing
 * travels: what was proposed is not needed to say "pending", and the reader already sees the
 * published value.
 */
export interface PendingPlaceFlag {
  kind: 'correction' | 'report';
  targetKind: 'place_field' | 'access_condition';
  targetField: PendingPlaceField | null;
  accessConditionId: string | null;
  reportReason: string | null;
  status: 'submitted' | 'needs_information';
}

/**
 * What a Correction the card has just sent looks like to the pending markers, before any read of
 * the server comes back.
 *
 * The card already knows everything suppression needs: a new flag is created `submitted`, and only
 * the addressing is ever read. So the editor that sent it hands one of these up and the card
 * appends it, which is what makes the three sibling editors on the same Condition say "pending"
 * the moment the fourth is sent rather than after a round trip nobody asked for.
 */
export function submittedPlaceFieldFlag(field: MemberPlaceField): PendingPlaceFlag {
  return {
    kind: 'correction',
    targetKind: 'place_field',
    targetField: field,
    accessConditionId: null,
    reportReason: null,
    status: 'submitted'
  };
}

export function submittedAccessConditionFlag(accessConditionId: string): PendingPlaceFlag {
  return {
    kind: 'correction',
    targetKind: 'access_condition',
    targetField: null,
    accessConditionId,
    reportReason: null,
    status: 'submitted'
  };
}

/**
 * Suppression is per Access Condition, not per dimension, because a flag targeting a Condition
 * records no dimension: its proposed value is the whole Condition object. A second dimension edit
 * raised while one is open would build from the stored Condition and propose reverting the first,
 * so every affordance on a Condition with anything open says "pending" instead.
 */
export function hasPendingAccessCondition(
  pending: readonly PendingPlaceFlag[],
  accessConditionId: string
): boolean {
  return pending.some(
    (flag) => flag.targetKind === 'access_condition' && flag.accessConditionId === accessConditionId
  );
}

/**
 * Place fields carry their own target, so their markers are per field: a pending name Correction
 * says nothing about the phone number and must not silence it.
 */
export function hasPendingPlaceField(
  pending: readonly PendingPlaceFlag[],
  field: PendingPlaceField
): boolean {
  return pending.some((flag) => flag.targetKind === 'place_field' && flag.targetField === field);
}

/**
 * The single place a dimension name is paired with a value it is allowed to carry. Both the
 * endpoint's parser and the inline editor read it, so a value the group cannot represent is
 * rejected identically at both ends.
 */
export function parseDimensionChange(
  dimension: string,
  value: unknown
): AccessConditionDimensionChange | null {
  if (dimension === 'eligibility') {
    const eligibility = parseEligibilityValue(value);
    return eligibility ? { dimension: 'eligibility', value: eligibility } : null;
  }
  if (typeof value !== 'string') return null;
  if (dimension === 'restraint' && isMemberRestraintChoice(value)) {
    return { dimension: 'restraint', value };
  }
  if (dimension === 'area' && isMemberAreaChoice(value)) return { dimension: 'area', value };
  if (dimension === 'permission' && isMemberPermissionChoice(value)) {
    return { dimension: 'permission', value };
  }
  return null;
}

/**
 * The counterpart for Place fields: the field name is paired with the one value shape it accepts,
 * and the same function decides it for the editor and for the endpoint.
 */
export function parseFieldChange(field: string, value: unknown): PlaceFieldChange | null {
  switch (field) {
    case 'name': {
      const text = parseFieldText(value, memberFieldTextMaximumLength);
      // A Place always has a name, so an empty one is a rejection rather than a removal.
      return text === null || text.value === null ? null : { field: 'name', value: text.value };
    }
    case 'website_url': {
      const text = parseFieldText(value, memberUrlMaximumLength);
      if (!text) return null;
      if (text.value !== null && !/^https?:\/\/\S+$/i.test(text.value)) return null;
      return { field: 'website_url', value: text.value };
    }
    case 'phone': {
      const text = parseFieldText(value, memberFieldTextMaximumLength);
      return text ? { field: 'phone', value: text.value } : null;
    }
    case 'dog_amenities': {
      const amenities = parseAmenities(value);
      return amenities ? { field: 'dog_amenities', value: amenities } : null;
    }
    default:
      return null;
  }
}

/**
 * The seeded-choice rule for eligibility: an eligibility the radio group cannot represent, such as
 * a Moderator's sourced note or two limits at once, seeds nothing rather than pre-checking a
 * substitute the Member never claimed.
 */
export function memberEligibilityChoiceFor(
  eligibility: DogEligibility
): MemberEligibilityChoice | null {
  if (eligibility.notes !== undefined) return null;
  if (eligibility.scope === 'all_dogs') {
    return eligibility.maximumWeightKg === undefined && eligibility.maximumDogs === undefined
      ? 'all_dogs'
      : null;
  }
  if (eligibility.maximumWeightKg !== undefined && eligibility.maximumDogs !== undefined) {
    return null;
  }
  if (eligibility.maximumWeightKg !== undefined) return 'maximum_weight_kg';
  if (eligibility.maximumDogs !== undefined) return 'maximum_dogs';
  return null;
}

export function isMemberRestraintChoice(value: string): value is MemberRestraintChoice {
  return memberRestraintChoices.some((choice) => choice === value);
}

export function isMemberAreaChoice(value: string): value is MemberAreaChoice {
  return memberAreaChoices.some((choice) => choice === value);
}

export function isMemberPermissionChoice(value: string): value is MemberPermissionChoice {
  return memberPermissionChoices.some((choice) => choice === value);
}

export function isMemberPlaceField(value: string): value is MemberPlaceField {
  return memberPlaceFields.some((field) => field === value);
}

function parseEligibilityValue(value: unknown): MemberEligibilityValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);

  if (candidate.scope === 'all_dogs') {
    return keys.length === 1 ? { scope: 'all_dogs' } : null;
  }
  if (candidate.scope !== 'restricted' || keys.length !== 2) return null;

  if (typeof candidate.maximumWeightKg === 'number') {
    return Number.isFinite(candidate.maximumWeightKg) && candidate.maximumWeightKg > 0
      ? { scope: 'restricted', maximumWeightKg: candidate.maximumWeightKg }
      : null;
  }
  if (typeof candidate.maximumDogs === 'number') {
    return Number.isInteger(candidate.maximumDogs) && candidate.maximumDogs > 0
      ? { scope: 'restricted', maximumDogs: candidate.maximumDogs }
      : null;
  }
  return null;
}

/**
 * Wrapped rather than returned bare, because `null` is a field the Member cleared and the absence
 * of a usable value is a rejection.
 */
function parseFieldText(value: unknown, maximumLength: number): { value: string | null } | null {
  if (value !== undefined && value !== null && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.length > maximumLength) return null;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return { value: trimmed === '' ? null : trimmed };
}

function parseAmenities(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > memberAmenityMaximumCount) return null;
  if (value.some((entry) => typeof entry !== 'string')) return null;

  const amenities: string[] = [];
  for (const entry of value as string[]) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    if (trimmed.length > memberFieldTextMaximumLength) return null;
    if (!amenities.includes(trimmed)) amenities.push(trimmed);
  }
  return amenities;
}
