import { describe, expect, it } from 'vitest';

import { memberNoteMaximumLength } from '../../../src/lib/contributions/access-condition-correction';
import { parseAccessConditionCorrectionInput } from '../../../src/lib/server/contributions/access-condition-correction-input';

const accessConditionId = '76400000-0000-4000-8000-000000000001';

describe('inline Access Condition Correction input', () => {
  it('accepts a condition id, a restraint choice and no note', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'off_leash_permitted'
      })
    ).toEqual({ accessConditionId, restraintCondition: 'off_leash_permitted', note: null });
  });

  it('trims a note and keeps it', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'carrier_required',
        note: '  Staff asked me to carry my dog.  '
      })
    ).toEqual({
      accessConditionId,
      restraintCondition: 'carrier_required',
      note: 'Staff asked me to carry my dog.'
    });
  });

  it('treats a blank note as no note', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'carrier_required',
        note: '   '
      })?.note
    ).toBeNull();
  });

  it('rejects a condition id that is not a UUID', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId: 'not-a-uuid',
        restraintCondition: 'leash_required'
      })
    ).toBeNull();
  });

  it('rejects a restraint value outside the domain', () => {
    expect(
      parseAccessConditionCorrectionInput({ accessConditionId, restraintCondition: 'whatever' })
    ).toBeNull();
  });

  it('rejects other_sourced, which needs a sourced note only a Moderator can supply', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'other_sourced',
        note: 'Something else applies here.'
      })
    ).toBeNull();
  });

  it('rejects a note longer than the cap rather than silently truncating it', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'leash_required',
        note: 'a'.repeat(memberNoteMaximumLength + 1)
      })
    ).toBeNull();
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'leash_required',
        note: 'a'.repeat(memberNoteMaximumLength)
      })?.note
    ).toHaveLength(memberNoteMaximumLength);
  });

  it('rejects a note that is not a string', () => {
    expect(
      parseAccessConditionCorrectionInput({
        accessConditionId,
        restraintCondition: 'leash_required',
        note: 12
      })
    ).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(parseAccessConditionCorrectionInput(null)).toBeNull();
    expect(parseAccessConditionCorrectionInput('leash_required')).toBeNull();
    expect(parseAccessConditionCorrectionInput([accessConditionId])).toBeNull();
  });
});
