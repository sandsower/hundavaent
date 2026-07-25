import {
  memberNoteMaximumLength,
  parseDimensionChange,
  type CorrectionInput
} from '$lib/contributions/access-condition-correction';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The Correction body is a union discriminated on `target`. A new target is a new case here and a
 * new arm on `CorrectionInput`; nothing else in this parser moves to accommodate one.
 */
export function parseCorrectionInput(value: unknown): CorrectionInput | null {
  const candidate = asRecord(value);
  if (!candidate) return null;

  switch (candidate.target) {
    case 'access_condition':
      return parseAccessConditionCorrection(candidate);
    default:
      return null;
  }
}

function parseAccessConditionCorrection(
  candidate: Record<string, unknown>
): CorrectionInput | null {
  const accessConditionId = candidate.accessConditionId;
  if (typeof accessConditionId !== 'string' || !uuidPattern.test(accessConditionId)) return null;

  const dimension = candidate.dimension;
  if (typeof dimension !== 'string') return null;
  const change = parseDimensionChange(dimension, candidate.value);
  if (!change) return null;

  const note = parseNote(candidate.note);
  if (!note) return null;

  return { target: 'access_condition', accessConditionId, ...change, note: note.value };
}

/**
 * Wrapped rather than returned bare, because `null` is a note the Member did not write and the
 * absence of one is a rejection.
 */
function parseNote(value: unknown): { value: string | null } | null {
  if (value !== undefined && value !== null && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.length > memberNoteMaximumLength) return null;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return { value: trimmed === '' ? null : trimmed };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
