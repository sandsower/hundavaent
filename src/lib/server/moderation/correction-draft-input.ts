import type { Json } from '$server/db/generated.types';
import {
  readAccessConditionValue,
  readEvidence,
  readPlaceFieldValue
} from '$server/place-flags/place-flag-input';
import type { ModerationPlaceFlag } from '$server/place-flags/place-flags';

export const correctionDraftSectionIds = ['application', 'dispute', 'transition'] as const;
export type CorrectionDraftSectionId = (typeof correctionDraftSectionIds)[number];

export function parseCorrectionDraftSection(
  flag: ModerationPlaceFlag,
  sectionId: string,
  form: FormData
): { sectionId: CorrectionDraftSectionId; payload: Record<string, Json> } | null {
  if (!isCorrectionDraftSectionId(sectionId)) return null;

  if (sectionId === 'application') {
    if (flag.targetKind === 'place_field') {
      if (!flag.targetField) return null;
      const expectedVersion = positiveInteger(form.get('expectedVersion'));
      const fieldValue = readPlaceFieldValue(form, flag.targetField);
      if (expectedVersion === null || !fieldValue) return null;
      return {
        sectionId,
        payload: {
          application_payload: {
            expected_version: expectedVersion,
            field_value: fieldValue
          } as unknown as Json
        }
      };
    }

    const expectedVerificationId = requiredText(form.get('expectedVerificationId'));
    const replacementCondition = readAccessConditionValue(form);
    const evidence = readEvidence(form);
    const verifiedAt = dateTime(form.get('verifiedAt'));
    const freshnessUntil = dateTime(form.get('freshnessUntil'));
    if (
      !expectedVerificationId ||
      !replacementCondition ||
      !evidence ||
      !verifiedAt ||
      !freshnessUntil
    ) {
      return null;
    }
    return {
      sectionId,
      payload: {
        application_payload: {
          expected_verification_id: expectedVerificationId,
          replacement_condition: replacementCondition,
          evidence,
          verified_at: verifiedAt,
          freshness_until: freshnessUntil
        } as unknown as Json
      }
    };
  }

  if (sectionId === 'dispute') {
    const expectedVerificationId = requiredText(form.get('expectedVerificationId'));
    const reason = requiredText(form.get('disputeReason'));
    const evidence = readEvidence(form);
    if (!expectedVerificationId || !reason || !evidence) return null;
    return {
      sectionId,
      payload: {
        dispute_command: {
          expected_verification_id: expectedVerificationId,
          reason,
          evidence
        } as unknown as Json
      }
    };
  }

  const expectedVersion = positiveInteger(form.get('expectedVersion'));
  const decisionNotes = requiredText(form.get('decisionNotes'));
  if (expectedVersion === null || !decisionNotes) return null;
  return {
    sectionId,
    payload: {
      transition_command: { expected_version: expectedVersion, decision_notes: decisionNotes }
    }
  };
}

function isCorrectionDraftSectionId(value: string): value is CorrectionDraftSectionId {
  return correctionDraftSectionIds.some((sectionId) => sectionId === value);
}

function requiredText(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateTime(value: FormDataEntryValue | null): string | null {
  const text = requiredText(value);
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return new Date(text).toISOString();
}
