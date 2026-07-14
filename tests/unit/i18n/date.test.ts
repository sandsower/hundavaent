import { describe, expect, it } from 'vitest';

import { formatLocalizedDate } from '$i18n/date';

describe('localized dates', () => {
  it('formats verified dates deterministically in Icelandic and English', () => {
    const value = '2026-07-09T23:30:00.000Z';

    expect(formatLocalizedDate(value, 'is')).toBe('9. júlí 2026');
    expect(formatLocalizedDate(value, 'en')).toBe('9 July 2026');
  });

  it('preserves an invalid source value instead of inventing a date', () => {
    expect(formatLocalizedDate('unknown', 'is')).toBe('unknown');
  });
});
