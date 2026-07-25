import { describe, expect, it } from 'vitest';

import {
  hasPendingAccessCondition,
  hasPendingPlaceField,
  type PendingPlaceFlag
} from '../../../src/lib/contributions/correction';

const conditionId = '40000000-0000-4000-8000-000000000003';
const otherConditionId = '40000000-0000-4000-8000-000000000009';

function flag(overrides: Partial<PendingPlaceFlag> = {}): PendingPlaceFlag {
  return {
    kind: 'correction',
    targetKind: 'access_condition',
    targetField: null,
    accessConditionId: conditionId,
    reportReason: null,
    status: 'submitted',
    ...overrides
  };
}

function fieldFlag(overrides: Partial<PendingPlaceFlag> = {}): PendingPlaceFlag {
  return flag({
    targetKind: 'place_field',
    targetField: 'name',
    accessConditionId: null,
    ...overrides
  });
}

describe('what the Member already has open on a Place', () => {
  it('finds nothing pending when nothing is open', () => {
    expect(hasPendingAccessCondition([], conditionId)).toBe(false);
    expect(hasPendingPlaceField([], 'name')).toBe(false);
  });

  it('reports a Condition as pending whatever dimension the open flag was about', () => {
    // A flag on a Condition records no dimension at all: its proposed value is the whole Condition
    // object. So "something is open on this Condition" is the only question that can be asked.
    expect(hasPendingAccessCondition([flag()], conditionId)).toBe(true);
  });

  it('keeps one Condition pending from silencing another on the same Place', () => {
    expect(hasPendingAccessCondition([flag()], otherConditionId)).toBe(false);
  });

  it('treats an open Report on a Condition as pending, not only a Correction', () => {
    expect(
      hasPendingAccessCondition([flag({ kind: 'report', reportReason: 'inaccurate' })], conditionId)
    ).toBe(true);
  });

  it('counts a flag sent back for information as still open', () => {
    expect(hasPendingAccessCondition([flag({ status: 'needs_information' })], conditionId)).toBe(
      true
    );
    expect(hasPendingPlaceField([fieldFlag({ status: 'needs_information' })], 'name')).toBe(true);
  });

  it('marks Place fields one at a time, because each flag names its own field', () => {
    const pending = [fieldFlag()];

    expect(hasPendingPlaceField(pending, 'name')).toBe(true);
    expect(hasPendingPlaceField(pending, 'phone')).toBe(false);
  });

  it('never crosses a Condition flag with a Place field or the reverse', () => {
    expect(hasPendingPlaceField([flag()], 'name')).toBe(false);
    expect(hasPendingAccessCondition([fieldFlag()], conditionId)).toBe(false);
  });

  it('marks a field the card cannot edit inline, because the legacy form can still open one', () => {
    expect(hasPendingPlaceField([fieldFlag({ targetField: 'description' })], 'description')).toBe(
      true
    );
  });
});
