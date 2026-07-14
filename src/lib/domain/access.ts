export type AccessArea = 'indoors' | 'outdoors' | 'designated_area' | 'other_bounded';

export type RestraintCondition =
  'leash_required' | 'off_leash_permitted' | 'carrier_required' | 'other_sourced';

export type PermissionRequirement = 'standing_permission' | 'ask_on_arrival' | 'advance_approval';

export type VerificationStatus = 'verified' | 'reconfirmation_due' | 'disputed';

export interface DogEligibility {
  scope: 'all_dogs' | 'restricted';
  maximumWeightKg?: number;
  maximumDogs?: number;
  notes?: string;
}

export interface AvailabilityWindow {
  days?: readonly number[];
  startsAt?: string;
  endsAt?: string;
  startsOn?: string;
  endsOn?: string;
  notes?: string;
}

export interface AccessCondition {
  id: string;
  placeId: string;
  revision: number;
  accessArea: AccessArea;
  accessAreaNote?: string;
  restraintCondition: RestraintCondition;
  restraintNote?: string;
  permissionRequirement: PermissionRequirement;
  dogEligibility: DogEligibility;
  availabilityWindow: AvailabilityWindow;
  supersededAt: string | null;
  supersedesConditionId?: string | null;
}

export interface DogFacts {
  weightKg?: number;
  numberOfDogs?: number;
}

export interface Verification {
  id: string;
  accessConditionId: string;
  status: VerificationStatus;
  verifiedAt: string;
  freshnessUntil: string;
  supersededAt: string | null;
  evidenceIds: readonly string[];
  verifiedBy?: string | null;
}

export interface StandingAccessConditionInput {
  id: string;
  placeId: string;
  accessArea: AccessArea;
  restraintCondition: RestraintCondition;
}

export function createStandingAccessCondition(
  input: StandingAccessConditionInput
): AccessCondition {
  return {
    id: input.id,
    placeId: input.placeId,
    revision: 1,
    accessArea: input.accessArea,
    restraintCondition: input.restraintCondition,
    permissionRequirement: 'standing_permission',
    dogEligibility: { scope: 'all_dogs' },
    availabilityWindow: {},
    supersededAt: null
  };
}

export function isCurrentVerification(
  verification: Verification,
  evaluatedAt = new Date()
): boolean {
  const freshnessUntil = Date.parse(verification.freshnessUntil);

  return (
    verification.status === 'verified' &&
    verification.supersededAt === null &&
    verification.evidenceIds.length > 0 &&
    Number.isFinite(freshnessUntil) &&
    freshnessUntil > evaluatedAt.getTime()
  );
}

export function isDogEligible(eligibility: DogEligibility, dog: DogFacts): boolean | null {
  if (eligibility.scope === 'all_dogs') return true;

  if (eligibility.maximumWeightKg !== undefined) {
    if (dog.weightKg === undefined) return null;
    if (dog.weightKg > eligibility.maximumWeightKg) return false;
  }

  if (eligibility.maximumDogs !== undefined) {
    if (dog.numberOfDogs === undefined) return null;
    if (dog.numberOfDogs > eligibility.maximumDogs) return false;
  }

  return true;
}

export function isAccessAvailableAt(
  window: AvailabilityWindow,
  weekday: number,
  localTime: string,
  localDate?: string
): boolean | null {
  if (!isWeekday(weekday) || !isTime(localTime)) return null;
  if (
    !window.days?.length &&
    !window.startsAt &&
    !window.endsAt &&
    !window.startsOn &&
    !window.endsOn
  )
    return null;

  const minute = toMinute(localTime);
  const startsAt = window.startsAt ? toMinute(window.startsAt) : 0;
  const endsAt = window.endsAt ? toMinute(window.endsAt) : 24 * 60;
  if (startsAt === null || endsAt === null || minute === null) return null;

  const days = window.days?.filter(isWeekday) ?? [];
  const overnight = Boolean(window.startsAt && window.endsAt && endsAt <= startsAt);
  if ((window.startsOn || window.endsOn) && !isDate(localDate)) return null;
  const serviceDate =
    overnight && window.endsAt && minute < endsAt && localDate
      ? previousIsoDate(localDate)
      : localDate;
  if (window.startsOn && serviceDate! < window.startsOn) return false;
  if (window.endsOn && serviceDate! > window.endsOn) return false;

  if (overnight) {
    const previousDay = weekday === 1 ? 7 : weekday - 1;
    const appliesEveryDay = days.length === 0;
    return (
      ((appliesEveryDay || days.includes(weekday)) && minute >= startsAt) ||
      ((appliesEveryDay || days.includes(previousDay)) && minute < endsAt)
    );
  }

  if (days.length > 0 && !days.includes(weekday)) return false;
  return minute >= startsAt && minute < endsAt;
}

function previousIsoDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function toMinute(value: string): number | null {
  if (!isTime(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isWeekday(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function isDate(value: string | undefined): value is string {
  return Boolean(
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}
