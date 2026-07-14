import { describe, expect, it } from 'vitest';

import { isPubliclyEligiblePlace, type Place } from '$domain/place';

describe('Place publication eligibility', () => {
  const publishedPlace: Place = {
    id: 'place-1',
    operatorId: 'operator-1',
    locationId: 'location-1',
    purpose: 'dog_access_destination',
    lifecycle: 'published',
    category: 'park',
    version: 1,
    publishedAt: '2026-07-09T11:00:00.000Z'
  };

  it('requires publication and a current Verification as separate facts', () => {
    expect(isPubliclyEligiblePlace(publishedPlace, true)).toBe(true);
    expect(isPubliclyEligiblePlace(publishedPlace, false)).toBe(false);
    expect(
      isPubliclyEligiblePlace(
        { ...publishedPlace, lifecycle: 'candidate', publishedAt: null },
        true
      )
    ).toBe(false);
  });
});
