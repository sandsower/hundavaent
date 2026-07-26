import type { DogEligibility } from '$domain/access';
import { isMemberWheelchairAccessibilityChoice } from '$lib/contributions/correction';
import type { Json } from '$server/db/generated.types';

export type PlaceFlagInputError = 'incomplete' | 'invalid';

export type PlaceField =
  | 'name'
  | 'description'
  | 'website_url'
  | 'phone'
  | 'opening_hours'
  | 'dog_amenities'
  | 'wheelchair_accessibility';

export type ReportReason =
  'inaccurate' | 'unsafe' | 'misleading' | 'obsolete' | 'closed' | 'moved' | 'successor_place';

export interface FlagEvidence {
  kind:
    | 'official_website'
    | 'venue_representative'
    | 'member_report'
    | 'direct_observation'
    | 'public_record'
    | 'other';
  source_url: string | null;
  source_citation: string | null;
  source_label: string;
  observed_at: string;
  source_metadata: Record<string, Json>;
}

export interface PlaceFieldValue {
  is?: string;
  en?: string;
  /**
   * The omitted-locale hatch: a one-language name or description names the locale it could not
   * write instead of writing it, and that locale's key is absent. Moderation fills it before the
   * draft can be applied, so no published value is ever half-translated.
   */
  needs_review?: 'is' | 'en';
  value?: string | null | Record<string, Json> | string[];
}

/**
 * What `private.snapshot_place` records: what identified the Place at the moment a place-level
 * Report was raised. A third snapshot shape, and deliberately not either of the other two: the whole
 * Place has no single value, so what a Moderator needs is enough to recognize the Place months later
 * even if it has since been renamed or recategorized.
 */
export interface PlaceSnapshotValue {
  name: { is: string; en: string };
  category: string;
  locality: string;
}

export interface AccessConditionValue {
  access_area: 'indoors' | 'outdoors' | 'designated_area' | 'other_bounded';
  access_area_note: string | null;
  restraint_condition:
    'leash_required' | 'off_leash_permitted' | 'carrier_required' | 'other_sourced';
  restraint_note: string | null;
  // Every eligibility shape `access_conditions` stores, so a Correction can carry a size-restricted
  // Place's real eligibility through untouched instead of flattening it to all_dogs.
  dog_eligibility: DogEligibility;
  availability_state: 'whenever_open' | 'limited' | 'not_stated';
  availability_window: Record<string, Json>;
  permission_requirement: 'standing_permission' | 'ask_on_arrival' | 'advance_approval';
}

interface PlaceFieldTarget {
  target_kind: 'place_field';
  target_field: PlaceField;
  access_condition_id: null;
}

interface AccessConditionTarget {
  target_kind: 'access_condition';
  target_field: null;
  access_condition_id: string;
}

/**
 * The whole Place, addressed by nothing but the Place itself. "This place is closed" is not a claim
 * about a field or a Condition, and making a Member pick one before saying it was the reason
 * Reports asked for a target they did not have.
 *
 * Reports only: a Correction proposes a replacement value for one fact, and the whole Place has no
 * single value to replace. `place_flag_kind_shape` holds the same rule at the database.
 */
interface PlaceTarget {
  target_kind: 'place';
  target_field: null;
  access_condition_id: null;
}

export type FlagTarget = PlaceFieldTarget | AccessConditionTarget | PlaceTarget;

export interface CorrectionCommand {
  place_id: string;
  explanation: string;
  evidence: FlagEvidence;
  proposed_value: PlaceFieldValue | AccessConditionValue;
}
export type CorrectionPayload = FlagTarget & CorrectionCommand;

export interface ReportCommand {
  place_id: string;
  explanation: string;
  evidence: FlagEvidence;
  report_reason: ReportReason;
  is_safety_concern: boolean;
  successor_place_id: string | null;
}
export type ReportPayload = FlagTarget & ReportCommand;

export type CorrectionInputResult =
  { ok: true; payload: CorrectionPayload } | { ok: false; error: PlaceFlagInputError };
export type ReportInputResult =
  { ok: true; payload: ReportPayload } | { ok: false; error: PlaceFlagInputError };

const placeFields = new Set<PlaceField>([
  'name',
  'description',
  'website_url',
  'phone',
  'opening_hours',
  'dog_amenities',
  'wheelchair_accessibility'
]);
const reportReasons = new Set<ReportReason>([
  'inaccurate',
  'unsafe',
  'misleading',
  'obsolete',
  'closed',
  'moved',
  'successor_place'
]);
const accessAreas = new Set<AccessConditionValue['access_area']>([
  'indoors',
  'outdoors',
  'designated_area',
  'other_bounded'
]);
const restraints = new Set<AccessConditionValue['restraint_condition']>([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);
const permissions = new Set<AccessConditionValue['permission_requirement']>([
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
]);
const availabilityStates = new Set<AccessConditionValue['availability_state']>([
  'whenever_open',
  'limited',
  'not_stated'
]);
const evidenceKinds = new Set<FlagEvidence['kind']>([
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
]);

export function isPlaceField(value: unknown): value is PlaceField {
  return typeof value === 'string' && placeFields.has(value as PlaceField);
}

/**
 * The counterpart for Report reasons, so a surface that has to name the reason before the parser
 * runs -- the report form builds its Evidence citation from it -- reads the same vocabulary the
 * parser will enforce a moment later.
 */
export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && reportReasons.has(value as ReportReason);
}

function readTarget(form: FormData): FlagTarget | null {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const targetKind = value('targetKind');
  if (targetKind === 'place_field') {
    const targetField = value('targetField');
    if (!placeFields.has(targetField as PlaceField)) return null;
    return {
      target_kind: 'place_field',
      target_field: targetField as PlaceField,
      access_condition_id: null
    };
  }
  if (targetKind === 'access_condition') {
    const accessConditionId = value('accessConditionId');
    if (!accessConditionId) return null;
    return {
      target_kind: 'access_condition',
      target_field: null,
      access_condition_id: accessConditionId
    };
  }
  if (targetKind === 'place') {
    return { target_kind: 'place', target_field: null, access_condition_id: null };
  }
  return null;
}

export function readEvidence(form: FormData): FlagEvidence | null {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const kind = value('evidenceKind');
  const sourceUrl = value('evidenceUrl');
  const sourceCitation = value('evidenceCitation');
  const observedAt = value('evidenceObservedAt');
  const sourceMetadata = parseJsonObject(value('sourceMetadataJson'));

  if (
    !evidenceKinds.has(kind as FlagEvidence['kind']) ||
    !value('evidenceSourceLabel') ||
    !observedAt ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(observedAt) ||
    (!sourceUrl && !sourceCitation) ||
    (sourceUrl !== '' && !/^https?:\/\/\S+$/i.test(sourceUrl)) ||
    sourceMetadata === 'invalid'
  ) {
    return null;
  }

  return {
    kind: kind as FlagEvidence['kind'],
    source_url: sourceUrl || null,
    source_citation: sourceCitation || null,
    source_label: value('evidenceSourceLabel'),
    observed_at: `${observedAt}:00.000Z`,
    source_metadata: sourceMetadata === null ? {} : sourceMetadata
  };
}

export function readAccessConditionValue(form: FormData): AccessConditionValue | null {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const accessArea = value('accessArea');
  const restraint = value('restraintCondition');
  const permission = value('permissionRequirement');
  const daysValue = value('availabilityDays');
  const days = daysValue
    ? daysValue
        .split(',')
        .map((day) => Number(day.trim()))
        .filter((day) => Number.isFinite(day))
    : [];
  const startsAt = value('availabilityStartsAt');
  const endsAt = value('availabilityEndsAt');
  const hasWindow = days.length > 0 || Boolean(startsAt) || Boolean(endsAt);
  const requestedAvailabilityState = value('availabilityState');
  const availabilityState = requestedAvailabilityState || (hasWindow ? 'limited' : 'not_stated');

  if (
    !accessAreas.has(accessArea as AccessConditionValue['access_area']) ||
    !restraints.has(restraint as AccessConditionValue['restraint_condition']) ||
    !permissions.has(permission as AccessConditionValue['permission_requirement']) ||
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(days).size !== days.length ||
    (startsAt && !validTime(startsAt)) ||
    (endsAt && !validTime(endsAt)) ||
    !availabilityStates.has(availabilityState as AccessConditionValue['availability_state']) ||
    (availabilityState === 'limited') !== hasWindow ||
    (accessArea === 'other_bounded' && !value('accessAreaNote')) ||
    (restraint === 'other_sourced' && !value('restraintNote'))
  ) {
    return null;
  }

  return {
    access_area: accessArea as AccessConditionValue['access_area'],
    access_area_note: value('accessAreaNote') || null,
    restraint_condition: restraint as AccessConditionValue['restraint_condition'],
    restraint_note: value('restraintNote') || null,
    dog_eligibility: { scope: 'all_dogs' },
    availability_state: availabilityState as AccessConditionValue['availability_state'],
    availability_window: {
      ...(days.length ? { days } : {}),
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {})
    },
    permission_requirement: permission as AccessConditionValue['permission_requirement']
  };
}

/**
 * The Member-facing reader. Name and description accept the omitted-locale hatch: one language is
 * enough, and the other is named for review rather than guessed, copied or blanked.
 *
 * Requiring both locales asked a Member for a language they may not speak, which is how
 * description Corrections came to be orphaned: the only honest answer was to leave the form.
 */
export function readPlaceFieldValue(form: FormData, field: PlaceField): PlaceFieldValue | null {
  return readFieldValue(form, field, 'hatch');
}

/**
 * The reader for a value that is about to be published rather than claimed. Name and description
 * require both locales, and a blank one is a rejection.
 *
 * The hatch is a statement about a Member's own submission, "I read this card in one language and
 * cannot write the other", and it has no meaning where writing the missing locale is the whole
 * job. A Moderator draft parsed through the Member reader would silently turn a cleared
 * locale box into a flag, which the apply path then refuses; the two readers are separate so that
 * widening one can never widen the other.
 */
export function readCompletePlaceFieldValue(
  form: FormData,
  field: PlaceField
): PlaceFieldValue | null {
  return readFieldValue(form, field, 'both');
}

function readFieldValue(
  form: FormData,
  field: PlaceField,
  locales: 'hatch' | 'both'
): PlaceFieldValue | null {
  const value = (key: string): string => String(form.get(key) ?? '').trim();

  switch (field) {
    case 'name':
    case 'description': {
      const is = value('fieldValueIs');
      const en = value('fieldValueEn');
      if (locales === 'both') return is && en ? { is, en } : null;
      if (!is && !en) return null;
      if (!en) return { is, needs_review: 'en' };
      if (!is) return { en, needs_review: 'is' };
      return { is, en };
    }
    case 'website_url': {
      const text = value('fieldValueText');
      if (text !== '' && !/^https?:\/\/\S+$/i.test(text)) return null;
      return { value: text || null };
    }
    case 'phone': {
      const text = value('fieldValueText');
      return { value: text || null };
    }
    case 'opening_hours': {
      const parsed = parseJsonObject(value('fieldValueJson'));
      if (parsed === 'invalid') return null;
      return { value: parsed ?? {} };
    }
    case 'dog_amenities': {
      const list = value('fieldValueList')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return { value: list };
    }
    case 'wheelchair_accessibility': {
      // The three definite states only, mirroring validate_place_field_value: `unknown` is the
      // absence of a claim, and the Moderator command keeps the explicit-unknown hatch.
      const text = value('fieldValueText');
      return isMemberWheelchairAccessibilityChoice(text) ? { value: text } : null;
    }
  }
}

/**
 * `suppliedEvidence` lets a Member-facing surface hand in a server-synthesized Evidence record
 * instead of asking the Member to fill in the Moderator's worksheet. Both parsers accept one; the
 * Moderation surfaces still solicit their own Evidence and read it from the form.
 */
export function parseCorrectionFormData(
  form: FormData,
  suppliedEvidence?: FlagEvidence
): CorrectionInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const placeId = value('placeId');
  const explanation = value('explanation');
  const target = readTarget(form);
  const evidence = suppliedEvidence ?? readEvidence(form);

  if (!placeId || !explanation || !target || !evidence) {
    return { ok: false, error: 'incomplete' };
  }

  // The whole Place is a Report target only. A Correction proposes a replacement value for one
  // fact, and there is no value here to read, let alone replace.
  if (target.target_kind === 'place') {
    return { ok: false, error: 'invalid' };
  }

  const proposedValue =
    target.target_kind === 'place_field'
      ? readPlaceFieldValue(form, target.target_field)
      : readAccessConditionValue(form);

  if (!proposedValue) {
    return { ok: false, error: 'invalid' };
  }

  return {
    ok: true,
    payload: { ...target, place_id: placeId, explanation, evidence, proposed_value: proposedValue }
  };
}

export function parseReportFormData(
  form: FormData,
  suppliedEvidence?: FlagEvidence
): ReportInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const placeId = value('placeId');
  const explanation = value('explanation');
  const target = readTarget(form);
  const evidence = suppliedEvidence ?? readEvidence(form);
  const reportReason = value('reportReason');
  const successorPlaceId = value('successorPlaceId');
  // A Member-initiated "unsafe" is definitionally a Safety Concern, so the checkbox cannot
  // un-escalate one: the card endpoint already hard-codes the pairing, and a claim raised through
  // the form must not reach Moderation quieter than the same claim raised from the card. The
  // free-standing checkbox stays, because every other reason can honestly be either.
  const isSafetyConcern =
    reportReason === 'unsafe' ||
    form.get('isSafetyConcern') === 'on' ||
    form.get('isSafetyConcern') === 'true';

  if (!placeId || !explanation || !target || !evidence) {
    return { ok: false, error: 'incomplete' };
  }

  if (
    !reportReasons.has(reportReason as ReportReason) ||
    (successorPlaceId !== '' && reportReason !== 'successor_place')
  ) {
    return { ok: false, error: 'invalid' };
  }

  return {
    ok: true,
    payload: {
      ...target,
      place_id: placeId,
      explanation,
      evidence,
      report_reason: reportReason as ReportReason,
      is_safety_concern: isSafetyConcern,
      successor_place_id: successorPlaceId || null
    }
  };
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseJsonObject(value: string): Record<string, Json> | null | 'invalid' {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, Json>)
      : 'invalid';
  } catch {
    return 'invalid';
  }
}
