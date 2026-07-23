import {
  parseWeeklyRhythmRecognition,
  type QualifyingAction,
  type WeeklyRhythmRecognition
} from '$lib/member-activity/types';

export function serializeRedirectRecognition(
  submittedId: string,
  recognition: WeeklyRhythmRecognition
): string {
  return new URLSearchParams({
    submitted: submittedId,
    weeklyAction: recognition.action,
    weeklyRecognized: recognition.recognized ? '1' : '0',
    weeklyActivated: recognition.activatedCurrentWeek ? '1' : '0',
    weeklyStartsOn: recognition.currentWeek.startsOn,
    weeklyEndsOn: recognition.currentWeek.endsOn,
    weeklyActive: recognition.currentWeek.active ? '1' : '0'
  }).toString();
}

export function parseRedirectRecognition(
  params: URLSearchParams,
  expectedAction: QualifyingAction
): WeeklyRhythmRecognition | null {
  const recognized = parseBoolean(params.get('weeklyRecognized'));
  const activatedCurrentWeek = parseBoolean(params.get('weeklyActivated'));
  const active = parseBoolean(params.get('weeklyActive'));
  if (recognized === null || activatedCurrentWeek === null || active === null) return null;

  return parseWeeklyRhythmRecognition(
    {
      action: params.get('weeklyAction'),
      recognized,
      activatedCurrentWeek,
      currentWeek: {
        startsOn: params.get('weeklyStartsOn'),
        endsOn: params.get('weeklyEndsOn'),
        active
      }
    },
    expectedAction
  );
}

function parseBoolean(value: string | null): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}
