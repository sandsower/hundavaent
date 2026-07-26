import { describe, expect, it } from 'vitest';

import { catalogues, defaultLocale, parseLocale } from '$i18n';
import englishMessages from '$lib/i18n/messages/en.json';
import icelandicMessages from '$lib/i18n/messages/is.json';

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(([placeholder]) => placeholder).sort();
}

describe('translation catalogues', () => {
  it('uses the repository-managed JSON messages as the runtime catalogues', () => {
    expect(catalogues.is).toEqual(icelandicMessages);
    expect(catalogues.en).toEqual(englishMessages);
  });

  it('keeps Icelandic and English keys complete and non-empty', () => {
    const icelandicKeys = Object.keys(catalogues.is).sort();
    const englishKeys = Object.keys(catalogues.en).sort();

    expect(icelandicKeys.length).toBeGreaterThan(0);
    expect(englishKeys).toEqual(icelandicKeys);

    for (const locale of ['is', 'en'] as const) {
      expect(Object.values(catalogues[locale]).every((value) => value.trim().length > 0)).toBe(
        true
      );
    }
  });

  it('keeps placeholders aligned between Icelandic and English', () => {
    for (const key of Object.keys(catalogues.is) as (keyof typeof catalogues.is)[]) {
      expect(placeholders(catalogues.en[key]), key).toEqual(placeholders(catalogues.is[key]));
    }
  });

  it('keeps established Icelandic product terminology consistent', () => {
    const legacyTerms = [
      'stjórnand',
      'umsjónarm',
      'innrit',
      'sönnunargagn',
      'aðgengi hunda',
      'umsjónarröð',
      'umsjónarrað',
      'yfirferðarröð',
      'yfirferðarrað'
    ];

    for (const term of legacyTerms) {
      const matchingKeys = Object.entries(catalogues.is)
        .filter(([, value]) => value.toLocaleLowerCase('is').includes(term))
        .map(([key]) => key);
      expect(matchingKeys, term).toEqual([]);
    }
  });

  it('falls back to Icelandic for unsupported or missing locale values', () => {
    expect(defaultLocale).toBe('is');
    expect(parseLocale('en')).toBe('en');
    expect(parseLocale('is')).toBe('is');
    expect(parseLocale('de')).toBe(defaultLocale);
    expect(parseLocale(undefined)).toBe(defaultLocale);
  });
});
