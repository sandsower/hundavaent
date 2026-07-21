import type { Json } from '$server/db/generated.types';

export const moderationFilterIds = ['actionable', 'deferred', 'resolved'] as const;
export type ModerationFilterId = (typeof moderationFilterIds)[number];

export const candidateDecisionOutcomes = ['needs_information', 'rejected', 'reopen'] as const;
export type CandidateDecisionOutcome = (typeof candidateDecisionOutcomes)[number];

export const candidateRejectionReasonCodes = [
  'insufficient_evidence',
  'inaccurate',
  'out_of_scope',
  'unsafe',
  'spam',
  'other'
] as const;
export type CandidateRejectionReasonCode = (typeof candidateRejectionReasonCodes)[number];

export interface ModerationDraftSnapshot {
  readonly targetId: string;
  readonly version: number;
  readonly payload: Json;
  readonly updatedBy: string;
  readonly updatedAt: string;
}

export function isModerationFilterId(value: unknown): value is ModerationFilterId {
  return typeof value === 'string' && moderationFilterIds.some((filter) => filter === value);
}

export function isCandidateDecisionOutcome(value: unknown): value is CandidateDecisionOutcome {
  return (
    typeof value === 'string' && candidateDecisionOutcomes.some((outcome) => outcome === value)
  );
}

export function isCandidateRejectionReasonCode(
  value: unknown
): value is CandidateRejectionReasonCode {
  return (
    typeof value === 'string' && candidateRejectionReasonCodes.some((reason) => reason === value)
  );
}
