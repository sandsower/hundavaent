import type { PlaceCategory } from '$domain/place';
import type { Locale } from '$i18n';

export const roundupMunicipalities = [
  'reykjavik',
  'kopavogur',
  'seltjarnarnes',
  'gardabaer',
  'hafnarfjordur',
  'mosfellsbaer',
  'kjosarhreppur'
] as const;

export const roundupCategories = [
  'restaurant',
  'cafe',
  'bar',
  'shop',
  'shopping_centre',
  'accommodation',
  'park',
  'recreation',
  'culture',
  'service',
  'other'
] as const satisfies readonly PlaceCategory[];

export type RoundupMunicipality = (typeof roundupMunicipalities)[number];
export type RoundupReason = 'newly_published' | 'updated';

export interface RoundupPreferenceInput {
  municipalities: RoundupMunicipality[];
  categories: PlaceCategory[];
  roundupLocale: Locale;
  emailInterest: boolean;
}

export interface RoundupPreferences extends RoundupPreferenceInput {
  configured: boolean;
  emailInterestChangedAt: string | null;
  updatedAt: string | null;
}

export interface RoundupWeek {
  startsOn: string;
  endsOn: string;
}

export interface RoundupRecommendation {
  placeId: string;
  name: string;
  category: PlaceCategory;
  municipality: RoundupMunicipality;
  reason: RoundupReason;
  changedAt: string;
  rank: number;
}

export type WeeklyRoundupStatus = 'unconfigured' | 'empty' | 'sparse' | 'populated';

export interface WeeklyRoundup {
  status: WeeklyRoundupStatus;
  preferences: RoundupPreferences;
  week: RoundupWeek;
  recommendations: RoundupRecommendation[];
}

export type WeeklyRoundupResult =
  { status: 'success'; value: WeeklyRoundup } | { status: 'unavailable' };

export type RoundupPreferencesResult =
  { status: 'success'; value: RoundupPreferences } | { status: 'unavailable' };
