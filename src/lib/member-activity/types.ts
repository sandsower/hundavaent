export interface WeeklyRhythmWeek {
  startsOn: string;
  endsOn: string;
  active: boolean;
}

export interface WeeklyRhythmHistoryWeek extends WeeklyRhythmWeek {
  current: boolean;
}

export type WeeklyRhythm =
  | {
      status: 'available';
      currentWeek: WeeklyRhythmWeek;
    }
  | { status: 'unavailable' };

export type WeeklyRhythmHistory =
  | {
      status: 'available';
      weeks: WeeklyRhythmHistoryWeek[];
    }
  | { status: 'unavailable' };

export type QualifyingAction =
  'favourite' | 'check_in' | 'rating' | 'suggestion' | 'correction' | 'report';

export interface WeeklyRhythmRecognition {
  action: QualifyingAction;
  recognized: boolean;
  activatedCurrentWeek: boolean;
  currentWeek: WeeklyRhythmWeek;
}

export interface FavouriteRecognition extends WeeklyRhythmRecognition {
  action: 'favourite';
  firstTimeForPlace: boolean;
}

export interface FavouriteMutationPayload {
  placeId: string;
  isFavourite: boolean;
  changedAt: string;
  recognition: FavouriteRecognition;
}

export function parseFavouriteMutationPayload(
  value: unknown,
  expectedPlaceId: string,
  expectedState: boolean
): FavouriteMutationPayload | null {
  if (!isRecord(value)) return null;
  if (
    value.placeId !== expectedPlaceId ||
    value.isFavourite !== expectedState ||
    typeof value.changedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.changedAt)) ||
    !isRecord(value.recognition)
  ) {
    return null;
  }

  const recognition = value.recognition;
  if (
    recognition.action !== 'favourite' ||
    typeof recognition.recognized !== 'boolean' ||
    typeof recognition.firstTimeForPlace !== 'boolean' ||
    typeof recognition.activatedCurrentWeek !== 'boolean' ||
    !isWeeklyRhythmWeek(recognition.currentWeek) ||
    recognition.recognized !== recognition.firstTimeForPlace ||
    (!expectedState &&
      (recognition.recognized ||
        recognition.firstTimeForPlace ||
        recognition.activatedCurrentWeek)) ||
    (recognition.activatedCurrentWeek &&
      (!recognition.recognized || !recognition.currentWeek.active)) ||
    (recognition.recognized && !recognition.currentWeek.active)
  ) {
    return null;
  }

  return {
    placeId: value.placeId,
    isFavourite: value.isFavourite,
    changedAt: value.changedAt,
    recognition: {
      action: 'favourite',
      recognized: recognition.recognized,
      firstTimeForPlace: recognition.firstTimeForPlace,
      activatedCurrentWeek: recognition.activatedCurrentWeek,
      currentWeek: recognition.currentWeek
    }
  };
}

export function parseWeeklyRhythmRecognition(
  value: unknown,
  expectedAction: QualifyingAction
): WeeklyRhythmRecognition | null {
  if (
    !isRecord(value) ||
    value.action !== expectedAction ||
    typeof value.recognized !== 'boolean' ||
    typeof value.activatedCurrentWeek !== 'boolean' ||
    !isWeeklyRhythmWeek(value.currentWeek) ||
    (value.activatedCurrentWeek && !value.recognized) ||
    (value.recognized && !value.currentWeek.active)
  ) {
    return null;
  }

  return {
    action: expectedAction,
    recognized: value.recognized,
    activatedCurrentWeek: value.activatedCurrentWeek,
    currentWeek: value.currentWeek
  };
}

function isWeeklyRhythmWeek(value: unknown): value is WeeklyRhythmWeek {
  return (
    isRecord(value) &&
    isDateOnly(value.startsOn) &&
    isDateOnly(value.endsOn) &&
    typeof value.active === 'boolean'
  );
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
