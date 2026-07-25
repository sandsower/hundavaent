import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  PendingPlaceField,
  PlaceFieldChange
} from '../../../src/lib/contributions/correction';
import {
  isUnchangedPlaceField,
  proposedPlaceFieldValue
} from '../../../src/lib/server/contributions/place-field-change';
import type { PublishedPlaceProfile } from '../../../src/lib/server/discovery/public-places';
import type { PlaceField } from '../../../src/lib/server/place-flags/place-flag-input';

function profile(overrides: Partial<PublishedPlaceProfile> = {}): PublishedPlaceProfile {
  return {
    placeId: '30000000-0000-4000-8000-000000000003',
    name: 'Kaffi Taumur',
    description: 'Upprunaleg lýsing.',
    category: 'cafe',
    location: {
      addressLine: 'Taumgata 1',
      locality: 'Reykjavík',
      postalCode: '101',
      latitude: 64.15,
      longitude: -21.95
    },
    websiteUrl: 'https://example.invalid/taumur',
    phone: '+354 555 1234',
    wheelchairAccessibility: 'unknown',
    openingHours: {},
    dogAmenities: ['water bowl', 'shade'],
    accessConditions: [],
    dogFriendlinessSummary: {
      placeId: '30000000-0000-4000-8000-000000000003',
      visible: false,
      eligibleCount: null,
      trailingTwelveMonthCount: null,
      dimensions: [],
      overallMean: null,
      overallVisible: false
    },
    photos: [],
    ...overrides
  };
}

describe('the omitted-locale hatch', () => {
  it('writes the icelandic key and names english for review', () => {
    expect(proposedPlaceFieldValue({ field: 'name', value: 'Kaffi Taumur' }, 'is')).toEqual({
      is: 'Kaffi Taumur',
      needs_review: 'en'
    });
  });

  it('writes the english key and names icelandic for review', () => {
    expect(proposedPlaceFieldValue({ field: 'name', value: 'Leash Cafe' }, 'en')).toEqual({
      en: 'Leash Cafe',
      needs_review: 'is'
    });
  });

  it('leaves the flagged locale absent rather than empty, guessed or copied', () => {
    const proposed = proposedPlaceFieldValue({ field: 'name', value: 'Leash Cafe' }, 'en');

    expect(Object.keys(proposed).sort()).toEqual(['en', 'needs_review']);
    expect('is' in proposed).toBe(false);
  });
});

describe('the proposed value of the remaining fields', () => {
  it('wraps a website and a phone in the single-value shape', () => {
    expect(
      proposedPlaceFieldValue({ field: 'website_url', value: 'https://example.invalid' }, 'is')
    ).toEqual({ value: 'https://example.invalid' });
    expect(proposedPlaceFieldValue({ field: 'phone', value: '+354 555 0000' }, 'is')).toEqual({
      value: '+354 555 0000'
    });
  });

  it('keeps a cleared field as an explicit null, which is how the field is removed', () => {
    expect(proposedPlaceFieldValue({ field: 'website_url', value: null }, 'is')).toEqual({
      value: null
    });
    expect(proposedPlaceFieldValue({ field: 'phone', value: null }, 'is')).toEqual({ value: null });
  });

  it('wraps amenities as a list, including the empty one', () => {
    expect(
      proposedPlaceFieldValue({ field: 'dog_amenities', value: ['water bowl'] }, 'is')
    ).toEqual({ value: ['water bowl'] });
    expect(proposedPlaceFieldValue({ field: 'dog_amenities', value: [] }, 'is')).toEqual({
      value: []
    });
  });

  it('never names a locale on a field that has none', () => {
    for (const change of [
      { field: 'website_url', value: 'https://example.invalid' },
      { field: 'phone', value: '+354 555 0000' },
      { field: 'dog_amenities', value: ['shade'] }
    ] as PlaceFieldChange[]) {
      expect(proposedPlaceFieldValue(change, 'en').needs_review).toBeUndefined();
    }
  });
});

describe('the unchanged verdict per Place field', () => {
  it('compares the name against the published value in the member locale', () => {
    expect(isUnchangedPlaceField(profile(), { field: 'name', value: 'Kaffi Taumur' })).toBe(true);
    expect(isUnchangedPlaceField(profile(), { field: 'name', value: 'Kaffi Taumurinn' })).toBe(
      false
    );
  });

  it('compares a website and a phone as strings, treating an absent one as cleared', () => {
    expect(
      isUnchangedPlaceField(profile(), {
        field: 'website_url',
        value: 'https://example.invalid/taumur'
      })
    ).toBe(true);
    expect(
      isUnchangedPlaceField(profile({ websiteUrl: null }), {
        field: 'website_url',
        value: null
      })
    ).toBe(true);
    expect(isUnchangedPlaceField(profile(), { field: 'website_url', value: null })).toBe(false);
    expect(isUnchangedPlaceField(profile({ phone: null }), { field: 'phone', value: null })).toBe(
      true
    );
    expect(isUnchangedPlaceField(profile(), { field: 'phone', value: '+354 555 9999' })).toBe(
      false
    );
  });

  it('compares amenities as a set, so a reordering is not a Correction', () => {
    expect(
      isUnchangedPlaceField(profile(), { field: 'dog_amenities', value: ['shade', 'water bowl'] })
    ).toBe(true);
    expect(
      isUnchangedPlaceField(profile(), { field: 'dog_amenities', value: ['water bowl'] })
    ).toBe(false);
    expect(
      isUnchangedPlaceField(profile(), {
        field: 'dog_amenities',
        value: ['water bowl', 'shade', 'towels']
      })
    ).toBe(false);
    expect(
      isUnchangedPlaceField(profile({ dogAmenities: [] }), {
        field: 'dog_amenities',
        value: []
      })
    ).toBe(true);
  });

  it('judges each field only against its own published value', () => {
    // The name and the phone are both plain strings; a shared comparison would confuse them.
    expect(
      isUnchangedPlaceField(profile({ name: '+354 555 1234' }), {
        field: 'phone',
        value: '+354 555 1234'
      })
    ).toBe(true);
  });
});

describe('the pending-read field vocabulary', () => {
  it('mirrors the database enum the server type mirrors', () => {
    // The client contract cannot import the server type, so this holds the two mirrors together
    // rather than letting them drift apart silently.
    expectTypeOf<PendingPlaceField>().toEqualTypeOf<PlaceField>();
  });
});
