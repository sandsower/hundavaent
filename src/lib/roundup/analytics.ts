import type { RoundupReason, WeeklyRoundupStatus } from './types';

export function roundupViewProperties(
  availability: WeeklyRoundupStatus | 'unavailable',
  recommendationCount: number
) {
  return {
    availability,
    recommendation_count:
      recommendationCount === 0
        ? ('0' as const)
        : recommendationCount <= 2
          ? ('1-2' as const)
          : recommendationCount === 3
            ? ('3' as const)
            : ('4-6' as const)
  };
}

export function roundupClickProperties(rank: number, reason: RoundupReason) {
  return {
    position: rank === 1 ? ('lead' as const) : ('supporting' as const),
    reason
  };
}

export function roundupPreferencesProperties(
  municipalityCount: number,
  hasCategoryFilter: boolean,
  emailInterest: boolean
) {
  return {
    municipality_count:
      municipalityCount === 1
        ? ('1' as const)
        : municipalityCount <= 3
          ? ('2-3' as const)
          : ('4-7' as const),
    has_category_filter: hasCategoryFilter,
    email_interest: emailInterest
  };
}
