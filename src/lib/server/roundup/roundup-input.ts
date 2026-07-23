import {
  roundupCategories,
  roundupMunicipalities,
  type RoundupPreferenceInput,
  type RoundupMunicipality
} from '$lib/roundup/types';
import type { PlaceCategory } from '$domain/place';

export type RoundupPreferenceInputResult =
  { ok: true; value: RoundupPreferenceInput } | { ok: false; error: 'invalid' };

const allowedFields = new Set(['municipalities', 'categories', 'roundupLocale', 'emailInterest']);
const municipalitySet = new Set<string>(roundupMunicipalities);
const categorySet = new Set<string>(roundupCategories);

export function parseRoundupPreferencesFormData(form: FormData): RoundupPreferenceInputResult {
  if ([...form.keys()].some((key) => !allowedFields.has(key))) {
    return { ok: false, error: 'invalid' };
  }

  const municipalities = readRepeatedText(form, 'municipalities');
  const categories = readRepeatedText(form, 'categories');
  const roundupLocale = form.get('roundupLocale');
  const emailInterestValue = form.get('emailInterest');

  if (
    municipalities === null ||
    municipalities.length < 1 ||
    municipalities.length > roundupMunicipalities.length ||
    !hasUniqueValues(municipalities) ||
    !municipalities.every((value) => municipalitySet.has(value)) ||
    categories === null ||
    categories.length > roundupCategories.length ||
    !hasUniqueValues(categories) ||
    !categories.every((value) => categorySet.has(value)) ||
    (roundupLocale !== 'is' && roundupLocale !== 'en') ||
    (emailInterestValue !== null && emailInterestValue !== 'true')
  ) {
    return { ok: false, error: 'invalid' };
  }

  return {
    ok: true,
    value: {
      municipalities: [...municipalities].sort() as RoundupMunicipality[],
      categories: [...categories].sort() as PlaceCategory[],
      roundupLocale,
      emailInterest: emailInterestValue === 'true'
    }
  };
}

function readRepeatedText(form: FormData, name: string): string[] | null {
  const values = form.getAll(name);
  if (!values.every((value): value is string => typeof value === 'string' && value.length > 0)) {
    return null;
  }
  return values;
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}
