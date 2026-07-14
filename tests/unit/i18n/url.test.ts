import { describe, expect, it } from 'vitest';

import { replaceLocaleInUrl } from '$i18n/url';

describe('localized URL replacement', () => {
  it('preserves selected Place, camera, view, and stable query order', () => {
    expect(
      replaceLocaleInUrl(
        '/en?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=list',
        'is'
      )
    ).toBe(
      '/is?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=list'
    );
  });

  it('preserves profile paths, return context, and fragments', () => {
    expect(replaceLocaleInUrl('/is/places/place-1?returnTo=%2Fis%3Fview%3Dmap#access', 'en')).toBe(
      '/en/places/place-1?returnTo=%2Fis%3Fview%3Dmap#access'
    );
  });

  it('adds a locale segment to an unlocalized path', () => {
    expect(replaceLocaleInUrl('/places/place-1', 'is')).toBe('/is/places/place-1');
  });
});
