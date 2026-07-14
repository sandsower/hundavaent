import type { AvailabilityWindow, DogEligibility } from './access';

const eligibilityKeys = new Set(['scope', 'maximumWeightKg', 'maximumDogs', 'notes']);
const availabilityKeys = new Set(['days', 'startsAt', 'endsAt', 'startsOn', 'endsOn', 'notes']);

export function parseDogEligibility(value: unknown): DogEligibility | null {
  if (!isObject(value) || !hasOnlyKeys(value, eligibilityKeys)) return null;
  if (value.scope !== 'all_dogs' && value.scope !== 'restricted') return null;

  const maximumWeightKg = optionalPositiveNumber(value.maximumWeightKg);
  const maximumDogs = optionalPositiveInteger(value.maximumDogs);
  const notes = optionalNonEmptyText(value.notes);
  if (maximumWeightKg === false || maximumDogs === false || notes === false) return null;

  const hasRestriction =
    maximumWeightKg !== undefined || maximumDogs !== undefined || notes !== undefined;
  if (value.scope === 'all_dogs' && hasRestriction) return null;
  if (value.scope === 'restricted' && !hasRestriction) return null;

  return {
    scope: value.scope,
    ...(maximumWeightKg === undefined ? {} : { maximumWeightKg }),
    ...(maximumDogs === undefined ? {} : { maximumDogs }),
    ...(notes === undefined ? {} : { notes })
  };
}

export function parseAvailabilityWindow(value: unknown): AvailabilityWindow | null {
  if (!isObject(value) || !hasOnlyKeys(value, availabilityKeys)) return null;

  const days = parseWeekdays(value.days);
  const startsAt = optionalPattern(value.startsAt, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
  const endsAt = optionalPattern(value.endsAt, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
  const startsOn = optionalDate(value.startsOn);
  const endsOn = optionalDate(value.endsOn);
  const notes = optionalNonEmptyText(value.notes);
  if (
    days === false ||
    startsAt === false ||
    endsAt === false ||
    startsOn === false ||
    endsOn === false ||
    notes === false
  )
    return null;
  if (startsOn && endsOn && startsOn > endsOn) return null;

  return {
    ...(days === undefined ? {} : { days }),
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(endsAt === undefined ? {} : { endsAt }),
    ...(startsOn === undefined ? {} : { startsOn }),
    ...(endsOn === undefined ? {} : { endsOn }),
    ...(notes === undefined ? {} : { notes })
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function optionalPositiveNumber(value: unknown): number | undefined | false {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : false;
}

function optionalPositiveInteger(value: unknown): number | undefined | false {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : false;
}

function optionalNonEmptyText(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value : false;
}

function optionalPattern(value: unknown, pattern: RegExp): string | undefined | false {
  if (value === undefined) return undefined;
  return typeof value === 'string' && pattern.test(value) ? value : false;
}

function optionalDate(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : false;
}

function parseWeekdays(value: unknown): number[] | undefined | false {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(value).size !== value.length
  )
    return false;
  return [...value];
}
