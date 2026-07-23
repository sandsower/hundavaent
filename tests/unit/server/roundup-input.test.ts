import { describe, expect, it } from 'vitest';

import { parseRoundupPreferencesFormData } from '$server/roundup/roundup-input';

describe('Weekly roundup preference input', () => {
  it('parses and canonicalizes explicit privacy-minimal selections', () => {
    const form = new FormData();
    form.append('municipalities', 'reykjavik');
    form.append('municipalities', 'kopavogur');
    form.append('categories', 'park');
    form.append('categories', 'cafe');
    form.set('roundupLocale', 'en');
    form.set('emailInterest', 'true');

    expect(parseRoundupPreferencesFormData(form)).toEqual({
      ok: true,
      value: {
        municipalities: ['kopavogur', 'reykjavik'],
        categories: ['cafe', 'park'],
        roundupLocale: 'en',
        emailInterest: true
      }
    });
  });

  it('treats an omitted optional category and email checkbox as explicit empty and false choices', () => {
    const form = new FormData();
    form.set('municipalities', 'gardabaer');
    form.set('roundupLocale', 'is');

    expect(parseRoundupPreferencesFormData(form)).toEqual({
      ok: true,
      value: {
        municipalities: ['gardabaer'],
        categories: [],
        roundupLocale: 'is',
        emailInterest: false
      }
    });
  });

  it('rejects missing, duplicated, unsupported, or synthetic location data', () => {
    const invalidForms = [
      preferenceForm({ municipalities: [] }),
      preferenceForm({ municipalities: ['reykjavik', 'reykjavik'] }),
      preferenceForm({ municipalities: ['akureyri'] }),
      preferenceForm({ categories: ['dog_spa'] }),
      preferenceForm({ locale: 'de' }),
      preferenceForm({ emailInterest: 'yes' })
    ];

    for (const form of invalidForms) {
      expect(parseRoundupPreferencesFormData(form)).toEqual({
        ok: false,
        error: 'invalid'
      });
    }
  });

  it('ignores no fields that could encode an address, coordinates, or activity history', () => {
    const form = preferenceForm({});
    form.set('homeAddress', 'Private Street 1');
    form.set('latitude', '64.1');
    form.set('favouritePlaceIds', 'private-place');

    expect(parseRoundupPreferencesFormData(form)).toEqual({
      ok: false,
      error: 'invalid'
    });
  });
});

function preferenceForm({
  municipalities = ['reykjavik'],
  categories = [],
  locale = 'is',
  emailInterest
}: {
  municipalities?: string[];
  categories?: string[];
  locale?: string;
  emailInterest?: string;
}) {
  const form = new FormData();
  for (const municipality of municipalities) form.append('municipalities', municipality);
  for (const category of categories) form.append('categories', category);
  form.set('roundupLocale', locale);
  if (emailInterest !== undefined) form.set('emailInterest', emailInterest);
  return form;
}
