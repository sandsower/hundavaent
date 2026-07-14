import { describe, expect, it } from 'vitest';

import { catalogues, defaultLocale, parseLocale } from '$i18n';

describe('translation catalogues', () => {
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

  it('falls back to Icelandic for unsupported or missing locale values', () => {
    expect(defaultLocale).toBe('is');
    expect(parseLocale('en')).toBe('en');
    expect(parseLocale('is')).toBe('is');
    expect(parseLocale('de')).toBe(defaultLocale);
    expect(parseLocale(undefined)).toBe(defaultLocale);
  });
});
