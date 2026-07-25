import { describe, expect, it } from 'vitest';

import { memberNoteMaximumLength } from '../../../src/lib/contributions/access-condition-correction';
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

describe('Correction input union', () => {
  it('rejects a body with no target, so no arm is reachable by accident', () => {
    expect(
      parseCorrectionInput({ accessConditionId, restraintCondition: 'leash_required' })
    ).toBeNull();
  });

  it('rejects a target it does not implement', () => {
    expect(parseCorrectionInput(accessCondition({ target: 'place_field' }))).toBeNull();
    expect(parseCorrectionInput(accessCondition({ target: 42 }))).toBeNull();
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
      parseCorrectionInput(
        accessCondition({ dimension: 'permission', value: 'standing_permission' })
      )
    ).toBeNull();
    expect(
      parseCorrectionInput(accessCondition({ dimension: 'timing', value: 'whenever_open' }))
    ).toBeNull();
    expect(parseCorrectionInput(accessCondition({ dimension: 7 }))).toBeNull();
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
