import { describe, expect, it } from 'vitest';

import {
  memberAmenityMaximumCount,
  memberFieldTextMaximumLength,
  memberNoteMaximumLength,
  memberUrlMaximumLength
} from '../../../src/lib/contributions/correction';
import { parseCorrectionInput } from '../../../src/lib/server/contributions/correction-input';

const accessConditionId = '76400000-0000-4000-8000-000000000001';

function accessCondition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    target: 'access_condition',
    accessConditionId,
    dimension: 'restraint',
    value: 'off_leash_permitted',
    ...overrides
  };
}

function placeField(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { target: 'place_field', field: 'name', value: 'Kaffi Taumur', ...overrides };
}

describe('Correction input union', () => {
  it('rejects a body with no target, so no arm is reachable by accident', () => {
    expect(
      parseCorrectionInput({ accessConditionId, restraintCondition: 'leash_required' })
    ).toBeNull();
  });

  it('rejects a target it does not implement', () => {
    expect(parseCorrectionInput(accessCondition({ target: 'place_media' }))).toBeNull();
    expect(parseCorrectionInput(accessCondition({ target: 42 }))).toBeNull();
  });

  it('reads each arm by its own discriminator and never by the other arm keys', () => {
    // A place-field body carrying an accessConditionId is still a place-field Correction, and an
    // access-condition body carrying a field is still an access-condition one.
    expect(parseCorrectionInput(placeField({ accessConditionId, dimension: 'area' }))).toEqual({
      target: 'place_field',
      field: 'name',
      value: 'Kaffi Taumur',
      note: null
    });
    expect(parseCorrectionInput(accessCondition({ field: 'name' }))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'restraint',
      value: 'off_leash_permitted',
      note: null
    });
  });

  it('rejects anything that is not an object', () => {
    expect(parseCorrectionInput(null)).toBeNull();
    expect(parseCorrectionInput('leash_required')).toBeNull();
    expect(parseCorrectionInput([accessConditionId])).toBeNull();
  });
});

describe('inline Access Condition Correction input', () => {
  it('accepts a restraint change with no note', () => {
    expect(parseCorrectionInput(accessCondition())).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'restraint',
      value: 'off_leash_permitted',
      note: null
    });
  });

  it('accepts an area change with no note', () => {
    expect(parseCorrectionInput(accessCondition({ dimension: 'area', value: 'outdoors' }))).toEqual(
      {
        target: 'access_condition',
        accessConditionId,
        dimension: 'area',
        value: 'outdoors',
        note: null
      }
    );
  });

  it.each(['indoors', 'outdoors', 'designated_area'] as const)('accepts the %s area', (value) => {
    expect(parseCorrectionInput(accessCondition({ dimension: 'area', value }))?.value).toBe(value);
  });

  it('trims a note and keeps it', () => {
    expect(
      parseCorrectionInput(
        accessCondition({
          value: 'carrier_required',
          note: '  Staff asked me to carry my dog.  '
        })
      )
    ).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'restraint',
      value: 'carrier_required',
      note: 'Staff asked me to carry my dog.'
    });
  });

  it('treats a blank note as no note', () => {
    expect(parseCorrectionInput(accessCondition({ note: '   ' }))?.note).toBeNull();
  });

  it('rejects a condition id that is not a UUID', () => {
    expect(parseCorrectionInput(accessCondition({ accessConditionId: 'not-a-uuid' }))).toBeNull();
  });

  it('rejects a dimension that has no inline editor yet', () => {
    expect(
      parseCorrectionInput(accessCondition({ dimension: 'timing', value: 'whenever_open' }))
    ).toBeNull();
    expect(parseCorrectionInput(accessCondition({ dimension: 7 }))).toBeNull();
  });

  it.each(['standing_permission', 'ask_on_arrival', 'advance_approval'] as const)(
    'accepts the %s permission requirement',
    (value) => {
      expect(parseCorrectionInput(accessCondition({ dimension: 'permission', value }))).toEqual({
        target: 'access_condition',
        accessConditionId,
        dimension: 'permission',
        value,
        note: null
      });
    }
  );

  it('rejects a permission value outside the domain', () => {
    expect(
      parseCorrectionInput(accessCondition({ dimension: 'permission', value: 'other' }))
    ).toBeNull();
  });

  it('rejects a value belonging to a different dimension', () => {
    expect(
      parseCorrectionInput(accessCondition({ dimension: 'area', value: 'leash_required' }))
    ).toBeNull();
    expect(parseCorrectionInput(accessCondition({ value: 'indoors' }))).toBeNull();
  });

  it('rejects a restraint value outside the domain', () => {
    expect(parseCorrectionInput(accessCondition({ value: 'whatever' }))).toBeNull();
  });

  it('rejects other_sourced, which needs a sourced note only a Moderator can supply', () => {
    expect(
      parseCorrectionInput(
        accessCondition({ value: 'other_sourced', note: 'Something else applies here.' })
      )
    ).toBeNull();
  });

  it('rejects other_bounded, which says nothing without the sourced area note', () => {
    expect(
      parseCorrectionInput(
        accessCondition({ dimension: 'area', value: 'other_bounded', note: 'The fenced yard.' })
      )
    ).toBeNull();
  });

  it('rejects a missing value rather than reading it as no change', () => {
    expect(parseCorrectionInput(accessCondition({ value: undefined }))).toBeNull();
    expect(parseCorrectionInput(accessCondition({ value: null }))).toBeNull();
  });

  it('rejects a note longer than the cap rather than silently truncating it', () => {
    expect(
      parseCorrectionInput(accessCondition({ note: 'a'.repeat(memberNoteMaximumLength + 1) }))
    ).toBeNull();
    expect(
      parseCorrectionInput(accessCondition({ note: 'a'.repeat(memberNoteMaximumLength) }))?.note
    ).toHaveLength(memberNoteMaximumLength);
  });

  it('rejects a note that is not a string', () => {
    expect(parseCorrectionInput(accessCondition({ note: 12 }))).toBeNull();
  });
});

describe('inline dog eligibility Correction input', () => {
  function eligibility(value: unknown): Record<string, unknown> {
    return accessCondition({ dimension: 'eligibility', value });
  }

  it('accepts an unrestricted eligibility', () => {
    expect(parseCorrectionInput(eligibility({ scope: 'all_dogs' }))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'eligibility',
      value: { scope: 'all_dogs' },
      note: null
    });
  });

  it('accepts a weight limit and a dog-count limit', () => {
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', maximumWeightKg: 10.5 }))?.value
    ).toEqual({ scope: 'restricted', maximumWeightKg: 10.5 });
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', maximumDogs: 2 }))?.value
    ).toEqual({ scope: 'restricted', maximumDogs: 2 });
  });

  it('rejects a restricted scope with no limit, which says nothing', () => {
    expect(parseCorrectionInput(eligibility({ scope: 'restricted' }))).toBeNull();
  });

  it('rejects an unrestricted scope carrying a limit, which contradicts itself', () => {
    expect(parseCorrectionInput(eligibility({ scope: 'all_dogs', maximumDogs: 2 }))).toBeNull();
  });

  it('rejects two limits at once, because the editor offers one control', () => {
    expect(
      parseCorrectionInput(
        eligibility({ scope: 'restricted', maximumWeightKg: 10, maximumDogs: 2 })
      )
    ).toBeNull();
  });

  it('rejects a sourced note, which is Moderator text a Member is never asked for', () => {
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', notes: 'Small dogs only.' }))
    ).toBeNull();
    expect(
      parseCorrectionInput(
        eligibility({ scope: 'restricted', maximumDogs: 2, notes: 'Small dogs only.' })
      )
    ).toBeNull();
  });

  it('rejects a limit that is not a positive number', () => {
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', maximumWeightKg: 0 }))
    ).toBeNull();
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', maximumWeightKg: -3 }))
    ).toBeNull();
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', maximumWeightKg: '10' }))
    ).toBeNull();
    expect(
      parseCorrectionInput(eligibility({ scope: 'restricted', maximumWeightKg: Number.NaN }))
    ).toBeNull();
  });

  it('rejects a fractional number of dogs, which no doorway can enforce', () => {
    expect(parseCorrectionInput(eligibility({ scope: 'restricted', maximumDogs: 1.5 }))).toBeNull();
    expect(parseCorrectionInput(eligibility({ scope: 'restricted', maximumDogs: 0 }))).toBeNull();
  });

  it('rejects an eligibility that is not an object', () => {
    expect(parseCorrectionInput(eligibility('all_dogs'))).toBeNull();
    expect(parseCorrectionInput(eligibility(null))).toBeNull();
    expect(parseCorrectionInput(eligibility([{ scope: 'all_dogs' }]))).toBeNull();
  });

  it('rejects an unknown scope', () => {
    expect(parseCorrectionInput(eligibility({ scope: 'small_dogs_only' }))).toBeNull();
  });
});

describe('inline Place field Correction input', () => {
  it('accepts a name as the single-locale text the member typed', () => {
    expect(parseCorrectionInput(placeField({ value: '  Kaffi Taumur  ' }))).toEqual({
      target: 'place_field',
      field: 'name',
      value: 'Kaffi Taumur',
      note: null
    });
  });

  it('rejects an empty name, because a Place always has one', () => {
    expect(parseCorrectionInput(placeField({ value: '   ' }))).toBeNull();
    expect(parseCorrectionInput(placeField({ value: null }))).toBeNull();
    expect(parseCorrectionInput(placeField({ value: undefined }))).toBeNull();
  });

  it('rejects a name sent as a locale map, which only the server may build', () => {
    expect(parseCorrectionInput(placeField({ value: { is: 'Taumur', en: 'Leash' } }))).toBeNull();
  });

  it('accepts a website and rejects anything that is not an http address', () => {
    expect(
      parseCorrectionInput(placeField({ field: 'website_url', value: 'https://example.invalid' }))
    ).toEqual({
      target: 'place_field',
      field: 'website_url',
      value: 'https://example.invalid',
      note: null
    });
    expect(
      parseCorrectionInput(placeField({ field: 'website_url', value: 'example.invalid' }))
    ).toBeNull();
    expect(
      parseCorrectionInput(placeField({ field: 'website_url', value: 'javascript:alert(1)' }))
    ).toBeNull();
  });

  it('reads a cleared website and a cleared phone as a removal rather than a rejection', () => {
    expect(
      parseCorrectionInput(placeField({ field: 'website_url', value: '  ' }))?.value
    ).toBeNull();
    expect(parseCorrectionInput(placeField({ field: 'phone', value: '' }))?.value).toBeNull();
  });

  it('accepts a phone as free text, because numbering conventions vary', () => {
    expect(parseCorrectionInput(placeField({ field: 'phone', value: ' +354 555 1234 ' }))).toEqual({
      target: 'place_field',
      field: 'phone',
      value: '+354 555 1234',
      note: null
    });
  });

  it('accepts amenities as an array, trimming, dropping blanks and folding duplicates', () => {
    expect(
      parseCorrectionInput(
        placeField({ field: 'dog_amenities', value: ['  water bowl ', '', 'water bowl', 'shade'] })
      )?.value
    ).toEqual(['water bowl', 'shade']);
  });

  it('accepts an empty amenity list, which is how a member says there are none', () => {
    expect(parseCorrectionInput(placeField({ field: 'dog_amenities', value: [] }))?.value).toEqual(
      []
    );
  });

  it('rejects amenities that are not an array of strings', () => {
    expect(
      parseCorrectionInput(placeField({ field: 'dog_amenities', value: 'water bowl' }))
    ).toBeNull();
    expect(
      parseCorrectionInput(placeField({ field: 'dog_amenities', value: ['water bowl', 7] }))
    ).toBeNull();
  });

  it('rejects a field with no inline editor', () => {
    expect(parseCorrectionInput(placeField({ field: 'description', value: 'A cafe.' }))).toBeNull();
    expect(
      parseCorrectionInput(placeField({ field: 'opening_hours', value: { mon: '9-17' } }))
    ).toBeNull();
    expect(parseCorrectionInput(placeField({ field: 7 }))).toBeNull();
  });

  it('carries a note the same way the access-condition arm does', () => {
    expect(parseCorrectionInput(placeField({ note: '  The sign says Taumur.  ' }))?.note).toBe(
      'The sign says Taumur.'
    );
    expect(parseCorrectionInput(placeField({ note: 12 }))).toBeNull();
    expect(
      parseCorrectionInput(placeField({ note: 'a'.repeat(memberNoteMaximumLength + 1) }))
    ).toBeNull();
  });

  it('rejects member text longer than the cap rather than silently truncating it', () => {
    expect(
      parseCorrectionInput(placeField({ value: 'a'.repeat(memberFieldTextMaximumLength + 1) }))
    ).toBeNull();
    expect(
      parseCorrectionInput(placeField({ value: 'a'.repeat(memberFieldTextMaximumLength) }))?.value
    ).toHaveLength(memberFieldTextMaximumLength);
    expect(
      parseCorrectionInput(
        placeField({
          field: 'website_url',
          value: `https://example.invalid/${'a'.repeat(memberUrlMaximumLength)}`
        })
      )
    ).toBeNull();
    expect(
      parseCorrectionInput(
        placeField({
          field: 'dog_amenities',
          value: ['a'.repeat(memberFieldTextMaximumLength + 1)]
        })
      )
    ).toBeNull();
    expect(
      parseCorrectionInput(
        placeField({
          field: 'dog_amenities',
          value: Array.from({ length: memberAmenityMaximumCount + 1 }, (_, index) => `a${index}`)
        })
      )
    ).toBeNull();
  });
});
