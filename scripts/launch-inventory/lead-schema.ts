// Pure parsing, validation, and mapping for an external launch-inventory lead file.
// No I/O here: everything is a plain function over plain
// data so it can be unit tested without a running Supabase stack.
//
// This module intentionally has no "publish" mapping - only buildCandidateCommand exists, which
// maps to public.create_candidate_place (Candidate creation only). There is no code path here
// that can call public.verify_and_publish_place, so a lead can never be auto-published by this
// pipeline; publication stays a deliberate Moderator action.

import type { Json } from '../../src/lib/server/db/generated.types.ts';
import type { CandidatePlaceCommand } from '../../src/lib/server/moderation/place-moderation.ts';

export type ConfidenceTier =
  'verified' | 'reputation_backed' | 'community_mention_only' | 'cold_prospect';

export type LeadCategory = CandidatePlaceCommand['category'];
export type LeadEvidenceKind = CandidatePlaceCommand['evidence_records'][number]['kind'];
export type LeadAccessArea = CandidatePlaceCommand['access_conditions'][number]['access_area'];
export type LeadRestraintCondition =
  CandidatePlaceCommand['access_conditions'][number]['restraint_condition'];
export type LeadPermissionRequirement =
  CandidatePlaceCommand['access_conditions'][number]['permission_requirement'];
export type LeadGeometryPrecision =
  CandidatePlaceCommand['location']['geometry_precision'] | 'geoservice_polygon_centroid';

export interface LeadSourceRecord {
  kind: LeadEvidenceKind;
  source_url: string | null;
  source_citation: string | null;
  source_label: string;
  observed_at: string;
  language: string;
  verbatim_claim: string | null;
  source_metadata: Readonly<Record<string, Json>>;
}

export interface LeadAccessCondition {
  access_area: LeadAccessArea;
  access_area_note: string | null;
  restraint_condition: LeadRestraintCondition;
  restraint_note: string | null;
  dog_eligibility: Readonly<Record<string, Json>>;
  availability_window: Readonly<Record<string, Json>>;
  permission_requirement: LeadPermissionRequirement;
}

export interface LeadLocation {
  addressLine: string;
  locality: string;
  postalCode: string;
  municipality: string;
  latitude: number;
  longitude: number;
  geometryPrecision: LeadGeometryPrecision;
  geometryNote: string;
}

export interface Lead {
  leadId: string;
  municipality: string;
  category: LeadCategory;
  operatorName: string;
  nameIs: string;
  nameEn: string;
  descriptionIs: string;
  descriptionEn: string;
  confidenceTier: ConfidenceTier;
  needsDirectContact: boolean;
  geometryNeeded: boolean;
  websiteUrl: string | null;
  phone: string | null;
  location: LeadLocation;
  accessConditions: readonly LeadAccessCondition[];
  sourceRecords: readonly LeadSourceRecord[];
  moderatorNotes: string;
}

export interface LeadFile {
  schemaVersion: number;
  sourceDocument: string;
  leads: readonly Lead[];
}

export interface LeadRejection {
  leadId: string | null;
  reasons: readonly string[];
}

export interface ParsedLeadFile {
  valid: Lead[];
  rejected: LeadRejection[];
}

const capitalRegionMunicipalities = new Set([
  'reykjavik',
  'kopavogur',
  'seltjarnarnes',
  'gardabaer',
  'hafnarfjordur',
  'mosfellsbaer',
  'kjosarhreppur'
]);

const placeCategories = new Set<LeadCategory>([
  'restaurant',
  'cafe',
  'bar',
  'shop',
  'shopping_centre',
  'accommodation',
  'park',
  'recreation',
  'culture',
  'service',
  'other'
]);

const evidenceKinds = new Set<LeadEvidenceKind>([
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
]);

const accessAreas = new Set<LeadAccessArea>([
  'indoors',
  'outdoors',
  'designated_area',
  'other_bounded'
]);

const restraintConditions = new Set<LeadRestraintCondition>([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);

const permissionRequirements = new Set<LeadPermissionRequirement>([
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
]);

const confidenceTiers = new Set<ConfidenceTier>([
  'verified',
  'reputation_backed',
  'community_mention_only',
  'cold_prospect'
]);

const geometryPrecisions = new Set<LeadGeometryPrecision>([
  'moderator_confirmed_point',
  'official_address_point',
  'official_representative_centroid',
  'municipality_anchor_pending_geocode',
  'geoservice_polygon_centroid'
]);

const leadIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parses and validates the raw leads.json content. Never throws; malformed entries are
 * collected in `rejected` with human-readable reasons instead of being silently dropped or
 * crashing the whole batch. */
export function parseLeadFile(raw: unknown): ParsedLeadFile {
  const rejected: LeadRejection[] = [];
  const valid: Lead[] = [];

  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray((raw as { leads?: unknown }).leads)
  ) {
    rejected.push({ leadId: null, reasons: ['Lead file must be an object with a "leads" array'] });
    return { valid, rejected };
  }

  const seenIds = new Set<string>();
  for (const item of (raw as { leads: unknown[] }).leads) {
    const result = validateLead(item);
    if (result.ok) {
      if (seenIds.has(result.lead.leadId)) {
        rejected.push({
          leadId: result.lead.leadId,
          reasons: [`Duplicate leadId "${result.lead.leadId}" in the lead file`]
        });
        continue;
      }
      seenIds.add(result.lead.leadId);
      valid.push(result.lead);
    } else {
      rejected.push(result.rejection);
    }
  }

  return { valid, rejected };
}

export type LeadValidationResult =
  { ok: true; lead: Lead } | { ok: false; rejection: LeadRejection };

/** Validates one lead entry against the schema `create_candidate_place` ultimately requires,
 * plus this pipeline's own provenance and cross-referencing rules. Returns every violation found
 * (not just the first) so a rejection report is actionable in one pass. */
export function validateLead(raw: unknown): LeadValidationResult {
  const reasons: string[] = [];
  const leadId = readLeadId(raw);

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, rejection: { leadId, reasons: ['Lead must be an object'] } };
  }

  const value = raw as Record<string, unknown>;

  if (!isNonEmptyString(value.leadId) || !leadIdPattern.test(value.leadId as string)) {
    reasons.push('leadId must be a non-empty lowercase-hyphen slug');
  }
  if (
    !isNonEmptyString(value.municipality) ||
    !capitalRegionMunicipalities.has(value.municipality as string)
  ) {
    reasons.push(`municipality must be one of: ${[...capitalRegionMunicipalities].join(', ')}`);
  }
  if (!isNonEmptyString(value.category) || !placeCategories.has(value.category as LeadCategory)) {
    reasons.push(`category must be one of: ${[...placeCategories].join(', ')}`);
  }
  if (!isNonEmptyString(value.operatorName)) reasons.push('operatorName is required');
  if (!isNonEmptyString(value.nameIs)) reasons.push('nameIs is required');
  if (!isNonEmptyString(value.nameEn)) reasons.push('nameEn is required');
  if (!isNonEmptyString(value.descriptionIs)) reasons.push('descriptionIs is required');
  if (!isNonEmptyString(value.descriptionEn)) reasons.push('descriptionEn is required');
  if (
    !isNonEmptyString(value.confidenceTier) ||
    !confidenceTiers.has(value.confidenceTier as ConfidenceTier)
  ) {
    reasons.push(`confidenceTier must be one of: ${[...confidenceTiers].join(', ')}`);
  }
  if (typeof value.needsDirectContact !== 'boolean')
    reasons.push('needsDirectContact must be a boolean');
  if (typeof value.geometryNeeded !== 'boolean') reasons.push('geometryNeeded must be a boolean');
  if (value.websiteUrl !== null && !isNonEmptyString(value.websiteUrl)) {
    reasons.push('websiteUrl must be a string or null');
  }
  if (value.phone !== null && !isNonEmptyString(value.phone))
    reasons.push('phone must be a string or null');
  if (!isNonEmptyString(value.moderatorNotes)) reasons.push('moderatorNotes is required');

  validateLocation(value.location, reasons);
  const sourceRecords = validateSourceRecords(value.sourceRecords, leadId, reasons);
  const accessConditions = validateAccessConditions(value.accessConditions, reasons);

  if (reasons.length > 0) {
    return { ok: false, rejection: { leadId, reasons } };
  }

  return {
    ok: true,
    lead: {
      leadId: value.leadId as string,
      municipality: value.municipality as string,
      category: value.category as LeadCategory,
      operatorName: value.operatorName as string,
      nameIs: value.nameIs as string,
      nameEn: value.nameEn as string,
      descriptionIs: value.descriptionIs as string,
      descriptionEn: value.descriptionEn as string,
      confidenceTier: value.confidenceTier as ConfidenceTier,
      needsDirectContact: value.needsDirectContact as boolean,
      geometryNeeded: value.geometryNeeded as boolean,
      websiteUrl: (value.websiteUrl as string | null) ?? null,
      phone: (value.phone as string | null) ?? null,
      location: value.location as LeadLocation,
      accessConditions,
      sourceRecords,
      moderatorNotes: value.moderatorNotes as string
    }
  };
}

function validateLocation(raw: unknown, reasons: string[]): void {
  if (typeof raw !== 'object' || raw === null) {
    reasons.push('location is required');
    return;
  }
  const location = raw as Record<string, unknown>;
  if (!isNonEmptyString(location.addressLine)) reasons.push('location.addressLine is required');
  if (!isNonEmptyString(location.locality)) reasons.push('location.locality is required');
  if (!isNonEmptyString(location.postalCode) || !/^\d{3}$/.test(location.postalCode as string)) {
    reasons.push('location.postalCode must be exactly 3 digits');
  }
  if (
    !isNonEmptyString(location.municipality) ||
    !capitalRegionMunicipalities.has(location.municipality as string)
  ) {
    reasons.push('location.municipality must be a capital-region municipality');
  }
  if (
    typeof location.latitude !== 'number' ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    reasons.push('location.latitude must be a finite number between -90 and 90');
  }
  if (
    typeof location.longitude !== 'number' ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    reasons.push('location.longitude must be a finite number between -180 and 180');
  }
  if (
    !isNonEmptyString(location.geometryPrecision) ||
    !geometryPrecisions.has(location.geometryPrecision as LeadGeometryPrecision)
  ) {
    reasons.push('location.geometryPrecision must be a supported precision');
  }
  if (!isNonEmptyString(location.geometryNote)) reasons.push('location.geometryNote is required');
}

function validateSourceRecords(
  raw: unknown,
  leadId: string | null,
  reasons: string[]
): LeadSourceRecord[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    reasons.push('sourceRecords must be a non-empty array (every candidate needs provenance)');
    return [];
  }

  const records: LeadSourceRecord[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      reasons.push(`sourceRecords[${index}] must be an object`);
      return;
    }
    const record = item as Record<string, unknown>;
    if (!isNonEmptyString(record.kind) || !evidenceKinds.has(record.kind as LeadEvidenceKind)) {
      reasons.push(`sourceRecords[${index}].kind must be one of: ${[...evidenceKinds].join(', ')}`);
    }
    const hasUrl = isNonEmptyString(record.source_url);
    const hasCitation = isNonEmptyString(record.source_citation);
    if (!hasUrl && !hasCitation) {
      reasons.push(`sourceRecords[${index}] must carry a source_url or a source_citation`);
    }
    if (hasUrl && !/^https?:\/\//i.test(record.source_url as string)) {
      reasons.push(`sourceRecords[${index}].source_url must be an http(s) URL`);
    }
    if (!isNonEmptyString(record.source_label)) {
      reasons.push(`sourceRecords[${index}].source_label is required`);
    }
    if (
      !isNonEmptyString(record.observed_at) ||
      !Number.isFinite(Date.parse(record.observed_at as string))
    ) {
      reasons.push(`sourceRecords[${index}].observed_at must be a parseable timestamp`);
    }
    if (!isNonEmptyString(record.language)) {
      reasons.push(`sourceRecords[${index}].language is required`);
    }
    if (
      typeof record.source_metadata !== 'object' ||
      record.source_metadata === null ||
      Array.isArray(record.source_metadata)
    ) {
      reasons.push(`sourceRecords[${index}].source_metadata must be an object`);
    } else {
      const metadata = record.source_metadata as Record<string, unknown>;
      if (leadId !== null && metadata.leadId !== leadId) {
        reasons.push(
          `sourceRecords[${index}].source_metadata.leadId must equal the lead's own leadId (idempotency key)`
        );
      }
    }
    records.push(record as unknown as LeadSourceRecord);
  });

  return records;
}

function validateAccessConditions(raw: unknown, reasons: string[]): LeadAccessCondition[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    reasons.push('accessConditions must be a non-empty array');
    return [];
  }

  const conditions: LeadAccessCondition[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      reasons.push(`accessConditions[${index}] must be an object`);
      return;
    }
    const condition = item as Record<string, unknown>;
    if (
      !isNonEmptyString(condition.access_area) ||
      !accessAreas.has(condition.access_area as LeadAccessArea)
    ) {
      reasons.push(
        `accessConditions[${index}].access_area must be one of: ${[...accessAreas].join(', ')}`
      );
    }
    if (
      !isNonEmptyString(condition.restraint_condition) ||
      !restraintConditions.has(condition.restraint_condition as LeadRestraintCondition)
    ) {
      reasons.push(
        `accessConditions[${index}].restraint_condition must be one of: ${[...restraintConditions].join(', ')}`
      );
    }
    if (
      !isNonEmptyString(condition.permission_requirement) ||
      !permissionRequirements.has(condition.permission_requirement as LeadPermissionRequirement)
    ) {
      reasons.push(
        `accessConditions[${index}].permission_requirement must be one of: ${[...permissionRequirements].join(', ')}`
      );
    }
    if (
      condition.access_area === 'other_bounded' &&
      !isNonEmptyString(condition.access_area_note)
    ) {
      reasons.push(
        `accessConditions[${index}].access_area_note is required when access_area is other_bounded`
      );
    }
    if (
      condition.restraint_condition === 'other_sourced' &&
      !isNonEmptyString(condition.restraint_note)
    ) {
      reasons.push(
        `accessConditions[${index}].restraint_note is required when restraint_condition is other_sourced`
      );
    }
    if (
      typeof condition.dog_eligibility !== 'object' ||
      condition.dog_eligibility === null ||
      Array.isArray(condition.dog_eligibility)
    ) {
      reasons.push(`accessConditions[${index}].dog_eligibility must be an object`);
    }
    if (
      typeof condition.availability_window !== 'object' ||
      condition.availability_window === null ||
      Array.isArray(condition.availability_window)
    ) {
      reasons.push(`accessConditions[${index}].availability_window must be an object`);
    }
    conditions.push(condition as unknown as LeadAccessCondition);
  });

  return conditions;
}

function readLeadId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = (raw as Record<string, unknown>).leadId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Maps a validated Lead to the exact command shape public.create_candidate_place expects.
 * Every source record's provenance (url/citation, observed_at, verbatim claim, language, and the
 * geometry/needs-direct-contact flags) is preserved into evidence source_metadata so a Moderator
 * can see it during review. This function has no side effects and never calls any "publish" or
 * "verify" RPC - candidates it produces are always unpublished. */
export function buildCandidateCommand(lead: Lead): CandidatePlaceCommand {
  return {
    operator: { name: lead.operatorName },
    location: {
      address_line: lead.location.addressLine,
      locality: lead.location.locality,
      postal_code: lead.location.postalCode,
      municipality: lead.location.municipality,
      latitude: lead.location.latitude,
      longitude: lead.location.longitude,
      geometry_precision:
        lead.location.geometryPrecision === 'geoservice_polygon_centroid'
          ? 'official_representative_centroid'
          : lead.location.geometryPrecision,
      geometry_source: lead.location.geometryNote
    },
    category: lead.category,
    website_url: lead.websiteUrl,
    phone: lead.phone,
    opening_hours: {},
    translations: {
      is: { name: lead.nameIs, description: lead.descriptionIs },
      en: { name: lead.nameEn, description: lead.descriptionEn }
    },
    evidence_records: lead.sourceRecords.map((record) => ({
      kind: record.kind,
      source_url: record.source_url,
      source_citation: record.source_citation,
      source_label: record.source_label,
      observed_at: record.observed_at,
      source_metadata: {
        ...record.source_metadata,
        leadId: lead.leadId,
        confidenceTier: lead.confidenceTier,
        needsDirectContact: lead.needsDirectContact,
        geometryNeeded: lead.geometryNeeded,
        language: record.language,
        verbatimClaim: record.verbatim_claim,
        geometryPrecision: lead.location.geometryPrecision,
        geometryNote: lead.location.geometryNote,
        moderatorNotes: lead.moderatorNotes
      }
    })),
    dog_amenities: [],
    access_conditions: lead.accessConditions.map((condition) => ({
      access_area: condition.access_area,
      access_area_note: condition.access_area_note,
      restraint_condition: condition.restraint_condition,
      restraint_note: condition.restraint_note,
      dog_eligibility: condition.dog_eligibility,
      availability_window: condition.availability_window,
      permission_requirement: condition.permission_requirement
    }))
  };
}
