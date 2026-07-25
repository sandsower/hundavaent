import {
  memberNoteMaximumLength,
  memberRestraintChoices,
  type AccessConditionCorrectionInput,
  type MemberRestraintChoice
} from '$lib/contributions/access-condition-correction';

const restraintChoices = new Set<MemberRestraintChoice>(memberRestraintChoices);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAccessConditionCorrectionInput(
  value: unknown
): AccessConditionCorrectionInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;

  const accessConditionId = candidate.accessConditionId;
  if (typeof accessConditionId !== 'string' || !uuidPattern.test(accessConditionId)) return null;

  const restraintCondition = candidate.restraintCondition;
  if (
    typeof restraintCondition !== 'string' ||
    !restraintChoices.has(restraintCondition as MemberRestraintChoice)
  ) {
    return null;
  }

  const rawNote = candidate.note;
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') return null;
  if (typeof rawNote === 'string' && rawNote.length > memberNoteMaximumLength) return null;
  const note = typeof rawNote === 'string' ? rawNote.trim() : '';

  return {
    accessConditionId,
    restraintCondition: restraintCondition as MemberRestraintChoice,
    note: note === '' ? null : note
  };
}
