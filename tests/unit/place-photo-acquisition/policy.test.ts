import { describe, expect, it } from 'vitest';

import {
  isBlockedPhotoHost,
  mapCommonsLicense,
  scoreCandidateForPlace,
  stableCandidateRequestId
} from '../../../scripts/place-photo-acquisition/policy';

describe('place photo acquisition policy', () => {
  it.each([
    'https://www.facebook.com/example/photos/1',
    'https://instagram.com/p/example',
    'https://lh3.googleusercontent.com/example',
    'https://maps.google.com/example'
  ])('blocks hosts whose imagery cannot be copied: %s', (url) => {
    expect(isBlockedPhotoHost(url)).toBe(true);
  });

  it('does not block the supported Wikimedia Commons source', () => {
    expect(isBlockedPhotoHost('https://commons.wikimedia.org/wiki/File:Reykjavik_Cafe.jpg')).toBe(
      false
    );
  });

  it.each([
    ['CC0 1.0', 'cc0'],
    ['Public domain', 'public_domain'],
    ['CC BY 4.0', 'cc_by'],
    ['CC BY-SA 3.0', 'cc_by_sa']
  ] as const)('maps allowlisted Commons license %s', (license, expected) => {
    expect(mapCommonsLicense(license)).toBe(expected);
  });

  it.each(['All rights reserved', 'CC BY-NC 4.0', 'CC BY-ND 4.0', ''])(
    'rejects unsupported Commons license %s',
    (license) => {
      expect(mapCommonsLicense(license)).toBeNull();
    }
  );

  it('gives an exact normalized Place-name match the import threshold', () => {
    expect(
      scoreCandidateForPlace(
        { nameIs: 'Kaffi Lóki', nameEn: 'Kaffi Loki' },
        { title: 'File:Kaffi_Loki,_Reykjavík.jpg' }
      )
    ).toBeGreaterThanOrEqual(100);
  });

  it('rejects a generic nearby image that does not identify the Place', () => {
    expect(
      scoreCandidateForPlace(
        { nameIs: 'Kaffi Lóki', nameEn: 'Kaffi Loki' },
        { title: 'File:A_cafe_in_Reykjavik.jpg' }
      )
    ).toBeLessThan(100);
  });

  it('rejects a view taken from the Place rather than a photo of the Place', () => {
    expect(
      scoreCandidateForPlace(
        { nameIs: 'Hallgrímskirkja', nameEn: 'Hallgrimskirkja' },
        { title: 'File:View of Reykjavík from Hallgrímskirkja.jpg' }
      )
    ).toBeLessThan(100);
  });

  it('creates a stable UUID request identity from Place and source identity', () => {
    const first = stableCandidateRequestId('place-1', 'commons:123');
    expect(first).toBe(stableCandidateRequestId('place-1', 'commons:123'));
    expect(first).not.toBe(stableCandidateRequestId('place-1', 'commons:456'));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
