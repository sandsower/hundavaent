import { describe, expect, it } from 'vitest';

import { extractPlaceholders, validateTranslationPair } from '$lib/translations/placeholders';

describe('translation placeholders', () => {
  it('extracts a sorted multiset without requiring the same sentence order', () => {
    expect(extractPlaceholders('{count} visits by {name}, then {count} again')).toEqual([
      'count',
      'count',
      'name'
    ]);
  });

  it.each(['A stray { brace', 'An empty {} token', 'A nested {{name}} token', 'Bad {two words}'])(
    'rejects malformed braces in %s',
    (value) => {
      expect(extractPlaceholders(value)).toBeNull();
    }
  );

  it('treats both languages equally and reports missing values', () => {
    expect(validateTranslationPair('', 'English')).toEqual(['missing_is']);
    expect(validateTranslationPair('Íslenska', '   ')).toEqual(['missing_en']);
  });

  it('rejects different placeholder multisets', () => {
    expect(validateTranslationPair('{count} staðir', '{total} places')).toEqual([
      'placeholder_mismatch'
    ]);
    expect(validateTranslationPair('{name} og {name}', '{name}')).toEqual(['placeholder_mismatch']);
  });

  it('accepts complete values with matching placeholders', () => {
    expect(
      validateTranslationPair('{count} staðir fyrir {name}', '{name} has {count} places')
    ).toEqual([]);
  });
});
