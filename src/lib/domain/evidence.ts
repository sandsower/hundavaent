export type EvidenceKind =
  | 'official_website'
  | 'venue_representative'
  | 'member_report'
  | 'direct_observation'
  | 'public_record'
  | 'other';

export type EvidenceMetadataValue = string | number | boolean | null;

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  sourceUrl: string | null;
  sourceCitation: string | null;
  sourceLabel: string;
  observedAt: string;
  recordedBy: string | null;
  sourceMetadata: Readonly<Record<string, EvidenceMetadataValue>>;
}

export function hasEvidenceSource(evidence: Evidence): boolean {
  return isNonEmpty(evidence.sourceUrl) || isNonEmpty(evidence.sourceCitation);
}

function isNonEmpty(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}
