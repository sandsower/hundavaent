import { describe, expect, it } from 'vitest';

import { buildPlaceShareUrl } from '$lib/discovery/share-url';

describe('buildPlaceShareUrl', () => {
  it('builds a stable localized Place URL without transient discovery state', () => {
    expect(
      buildPlaceShareUrl('https://hundavaent.is', 'en', '30000000-0000-4000-8000-000000000003')
    ).toBe('https://hundavaent.is/en?place=30000000-0000-4000-8000-000000000003');
  });
});
