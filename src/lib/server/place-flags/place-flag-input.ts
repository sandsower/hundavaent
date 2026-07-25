import type { DogEligibility } from '$domain/access';
import type { Json } from '$server/db/generated.types';

export type PlaceFlagInputError = 'incomplete' | 'invalid';

export type PlaceField =
  'name' | 'description' | 'website_url' | 'phone' | 'opening_hours' | 'dog_amenities';

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

export type FlagTarget = PlaceFieldTarget | AccessConditionTarget;

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
  'dog_amenities'
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

export function readPlaceFieldValue(form: FormData, field: PlaceField): PlaceFieldValue | null {
  const value = (key: string): string => String(form.get(key) ?? '').trim();

  switch (field) {
    case 'name':
    case 'description': {
      const is = value('fieldValueIs');
      const en = value('fieldValueEn');
      if (!is || !en) return null;
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
  }
}

/**
 * `suppliedEvidence` lets a Member-facing surface hand in a server-synthesized Evidence record
 * instead of asking the Member to fill in the Moderator's worksheet. The Moderation and Report
 * surfaces still solicit their own Evidence and read it from the form.
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

export function parseReportFormData(form: FormData): ReportInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const placeId = value('placeId');
  const explanation = value('explanation');
  const target = readTarget(form);
  const evidence = readEvidence(form);
  const reportReason = value('reportReason');
  const successorPlaceId = value('successorPlaceId');
  const isSafetyConcern =
    form.get('isSafetyConcern') === 'on' || form.get('isSafetyConcern') === 'true';

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
