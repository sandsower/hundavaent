import { describe, expect, it } from 'vitest';

import type { AccessConditionDimensionChange } from '../../../src/lib/contributions/correction';
import {
  describeAccessConditionChange,
  isUnchangedAccessCondition,
  proposedAccessCondition
} from '../../../src/lib/server/contributions/access-condition-change';
import { buildMemberReportEvidence } from '../../../src/lib/server/contributions/member-evidence';
import type { PublishedAccessFacts } from '../../../src/lib/server/discovery/public-places';

const areaNote = 'Only the fenced yard behind the church.';
const restraintNote = 'Short leashes only, the owner asked us to say so.';

function condition(overrides: Partial<PublishedAccessFacts> = {}): PublishedAccessFacts {
  return {
    id: '40000000-0000-4000-8000-000000000003',
    accessArea: 'indoors',
    accessAreaNote: areaNote,
    restraintCondition: 'leash_required',
    restraintNote,
    dogEligibility: { scope: 'restricted', maximumWeightKg: 10 },
    availabilityWindow: { days: [1, 2], startsAt: '09:00' },
    availabilityState: 'limited',
    permissionRequirement: 'ask_on_arrival',
    ...overrides
  };
}

const restraintChange: AccessConditionDimensionChange = {
  dimension: 'restraint',
  value: 'off_leash_permitted'
};
const areaChange: AccessConditionDimensionChange = { dimension: 'area', value: 'outdoors' };
const permissionChange: AccessConditionDimensionChange = {
  dimension: 'permission',
  value: 'advance_approval'
};
const eligibilityChange: AccessConditionDimensionChange = {
  dimension: 'eligibility',
  value: { scope: 'all_dogs' }
};

describe('the per-dimension Access Condition swap', () => {
  it('changes only the restraint and carries every other dimension through', () => {
    expect(proposedAccessCondition(condition(), restraintChange)).toEqual({
      access_area: 'indoors',
      access_area_note: areaNote,
      restraint_condition: 'off_leash_permitted',
      restraint_note: null,
      dog_eligibility: { scope: 'restricted', maximumWeightKg: 10 },
      availability_state: 'limited',
      availability_window: { days: [1, 2], startsAt: '09:00' },
      permission_requirement: 'ask_on_arrival'
    });
  });

  it('changes only the area and carries every other dimension through', () => {
    expect(proposedAccessCondition(condition(), areaChange)).toEqual({
      access_area: 'outdoors',
      access_area_note: null,
      restraint_condition: 'leash_required',
      restraint_note: restraintNote,
      dog_eligibility: { scope: 'restricted', maximumWeightKg: 10 },
      availability_state: 'limited',
      availability_window: { days: [1, 2], startsAt: '09:00' },
      permission_requirement: 'ask_on_arrival'
    });
  });

  it('drops the sourced note of the dimension it replaces and no other', () => {
    // A sourced note justifies the value being replaced, so carrying it forward would attach a
    // stale justification to the new one. The other dimension's note is untouched by that.
    const afterRestraint = proposedAccessCondition(condition(), restraintChange);
    expect(afterRestraint.restraint_note).toBeNull();
    expect(afterRestraint.access_area_note).toBe(areaNote);

    const afterArea = proposedAccessCondition(condition(), areaChange);
    expect(afterArea.access_area_note).toBeNull();
    expect(afterArea.restraint_note).toBe(restraintNote);
  });

  it('carries a stored note the visitor projection would have withheld', () => {
    const stored = condition({
      accessArea: 'other_bounded',
      accessAreaNote: 'Fenced yard, map at https://example.invalid/yard'
    });

    expect(proposedAccessCondition(stored, restraintChange).access_area).toBe('other_bounded');
    expect(proposedAccessCondition(stored, restraintChange).access_area_note).toBe(
      'Fenced yard, map at https://example.invalid/yard'
    );
  });

  it('changes only the permission and carries every other dimension through', () => {
    expect(proposedAccessCondition(condition(), permissionChange)).toEqual({
      access_area: 'indoors',
      access_area_note: areaNote,
      restraint_condition: 'leash_required',
      restraint_note: restraintNote,
      dog_eligibility: { scope: 'restricted', maximumWeightKg: 10 },
      availability_state: 'limited',
      availability_window: { days: [1, 2], startsAt: '09:00' },
      permission_requirement: 'advance_approval'
    });
  });

  it('changes only the eligibility and carries every other dimension through', () => {
    expect(proposedAccessCondition(condition(), eligibilityChange)).toEqual({
      access_area: 'indoors',
      access_area_note: areaNote,
      restraint_condition: 'leash_required',
      restraint_note: restraintNote,
      dog_eligibility: { scope: 'all_dogs' },
      availability_state: 'limited',
      availability_window: { days: [1, 2], startsAt: '09:00' },
      permission_requirement: 'ask_on_arrival'
    });
  });

  it('drops the sourced eligibility note and keeps the other dimensions notes', () => {
    const stored = condition({
      dogEligibility: { scope: 'restricted', maximumDogs: 2, notes: 'Small dogs only, staff said.' }
    });
    const proposed = proposedAccessCondition(stored, {
      dimension: 'eligibility',
      value: { scope: 'restricted', maximumWeightKg: 8 }
    });

    expect(proposed.dog_eligibility).toEqual({ scope: 'restricted', maximumWeightKg: 8 });
    expect(proposed.access_area_note).toBe(areaNote);
    expect(proposed.restraint_note).toBe(restraintNote);
  });

  it('leaves every note standing on a permission change, which has none of its own', () => {
    const proposed = proposedAccessCondition(condition(), permissionChange);

    expect(proposed.access_area_note).toBe(areaNote);
    expect(proposed.restraint_note).toBe(restraintNote);
    expect(proposed.dog_eligibility).toEqual({ scope: 'restricted', maximumWeightKg: 10 });
  });

  it('defaults an unstated availability rather than inventing one', () => {
    const stored = condition({ availabilityState: undefined, availabilityWindow: {} });

    expect(proposedAccessCondition(stored, areaChange).availability_state).toBe('not_stated');
    expect(proposedAccessCondition(stored, areaChange).availability_window).toEqual({});
  });
});

describe('the unchanged verdict', () => {
  it('recognises a restraint that already reads that way', () => {
    expect(
      isUnchangedAccessCondition(condition(), { dimension: 'restraint', value: 'leash_required' })
    ).toBe(true);
    expect(isUnchangedAccessCondition(condition(), restraintChange)).toBe(false);
  });

  it('recognises an area that already reads that way', () => {
    expect(isUnchangedAccessCondition(condition(), { dimension: 'area', value: 'indoors' })).toBe(
      true
    );
    expect(isUnchangedAccessCondition(condition(), areaChange)).toBe(false);
  });

  it('recognises a permission that already reads that way', () => {
    expect(
      isUnchangedAccessCondition(condition(), { dimension: 'permission', value: 'ask_on_arrival' })
    ).toBe(true);
    expect(isUnchangedAccessCondition(condition(), permissionChange)).toBe(false);
  });

  it('recognises an eligibility limit that already reads that way', () => {
    expect(
      isUnchangedAccessCondition(condition(), {
        dimension: 'eligibility',
        value: { scope: 'restricted', maximumWeightKg: 10 }
      })
    ).toBe(true);
    expect(
      isUnchangedAccessCondition(condition(), {
        dimension: 'eligibility',
        value: { scope: 'restricted', maximumWeightKg: 12 }
      })
    ).toBe(false);
    expect(isUnchangedAccessCondition(condition(), eligibilityChange)).toBe(false);
  });

  it('never calls an eligibility unchanged when the proposal would drop its sourced note', () => {
    // The Member's shape cannot carry a note, so submitting the same limit still removes one,
    // and that is a change a Moderator has to be shown rather than a no-op.
    const stored = condition({
      dogEligibility: { scope: 'restricted', maximumWeightKg: 10, notes: 'Small dogs only.' }
    });

    expect(
      isUnchangedAccessCondition(stored, {
        dimension: 'eligibility',
        value: { scope: 'restricted', maximumWeightKg: 10 }
      })
    ).toBe(false);
  });

  it('does not confuse one eligibility limit with the other', () => {
    const stored = condition({ dogEligibility: { scope: 'restricted', maximumDogs: 2 } });

    expect(
      isUnchangedAccessCondition(stored, {
        dimension: 'eligibility',
        value: { scope: 'restricted', maximumWeightKg: 2 }
      })
    ).toBe(false);
    expect(
      isUnchangedAccessCondition(stored, {
        dimension: 'eligibility',
        value: { scope: 'restricted', maximumDogs: 2 }
      })
    ).toBe(true);
  });

  it('judges each dimension only against its own stored value', () => {
    // 'indoors' is a valid area and no restraint at all; a shared comparison would confuse them.
    expect(
      isUnchangedAccessCondition(condition({ accessArea: 'outdoors' }), {
        dimension: 'restraint',
        value: 'leash_required'
      })
    ).toBe(true);
  });
});

describe('Access Condition change summaries', () => {
  it('names the before value, the after value and the surface for a restraint', () => {
    expect(describeAccessConditionChange(condition(), restraintChange, 'place-card')).toBe(
      'Restraint condition changed from leash required to off-leash allowed, reported from the place card.'
    );
  });

  it('names the before value, the after value and the surface for an area', () => {
    expect(describeAccessConditionChange(condition(), areaChange, 'place-card')).toBe(
      'Access area changed from indoors to outdoors, reported from the place card.'
    );
  });

  it('names an area the member cannot choose when it is the value being replaced', () => {
    expect(
      describeAccessConditionChange(
        condition({ accessArea: 'other_bounded' }),
        areaChange,
        'place-card'
      )
    ).toBe(
      'Access area changed from another stated area to outdoors, reported from the place card.'
    );
  });

  it('names the before value, the after value and the surface for a permission', () => {
    expect(describeAccessConditionChange(condition(), permissionChange, 'place-card')).toBe(
      'Permission requirement changed from ask on arrival to advance approval, reported from the place card.'
    );
  });

  it('names the shape of an eligibility limit and never the number a member typed', () => {
    expect(describeAccessConditionChange(condition(), eligibilityChange, 'place-card')).toBe(
      'Dog eligibility changed from a weight limit to all dogs, reported from the place card.'
    );
    const summary = describeAccessConditionChange(
      condition({ dogEligibility: { scope: 'all_dogs' } }),
      { dimension: 'eligibility', value: { scope: 'restricted', maximumDogs: 2 } },
      'place-card'
    );
    expect(summary).toBe(
      'Dog eligibility changed from all dogs to a limit on the number of dogs, reported from the place card.'
    );
    expect(summary).not.toContain('2');
  });

  it('names a stored eligibility the member cannot choose without quoting its note', () => {
    const summary = describeAccessConditionChange(
      condition({ dogEligibility: { scope: 'restricted', notes: 'Ask about large breeds.' } }),
      eligibilityChange,
      'place-card'
    );

    expect(summary).toBe(
      'Dog eligibility changed from other stated restrictions to all dogs, reported from the place card.'
    );
    expect(summary).not.toContain('Ask about large breeds.');
  });

  it.each([
    ['restraint', restraintChange],
    ['area', areaChange],
    ['permission', permissionChange],
    ['eligibility', eligibilityChange]
  ] as const)(
    'keeps stored free text and the member note out of the %s citation entirely',
    (_dimension, change) => {
      // The summary becomes source_citation, which reaches anonymous callers through
      // get_published_place_profile. Only enum labels may travel in it.
      const memberNote = 'The manager told me on Tuesday.';
      const eligibilityNote = 'Only dogs the staff already know.';
      const stored = condition({
        dogEligibility: { scope: 'restricted', maximumDogs: 3, notes: eligibilityNote }
      });
      const summary = describeAccessConditionChange(stored, change, 'place-card');
      const evidence = buildMemberReportEvidence({
        note: memberNote,
        changeSummary: summary,
        observedAt: '2026-07-25T09:00:00.000Z',
        surface: 'place-card'
      });

      for (const secret of [areaNote, restraintNote, eligibilityNote, memberNote]) {
        expect(summary).not.toContain(secret);
        expect(JSON.stringify(evidence)).not.toContain(secret);
      }
    }
  );
});
