import type { Json } from '$server/db/generated.types';
import type { RequestSupabaseClient } from '$server/db/clients';
import type {
  AccessArea,
  AvailabilityState,
  AvailabilityWindow,
  DogEligibility,
  PermissionRequirement,
  RestraintCondition
} from '$domain/access';
import type { EvidenceKind } from '$domain/evidence';
import { parseAvailabilityWindow, parseDogEligibility } from '$domain/access-schema';
import {
  isWheelchairAccessibility,
  type PlaceCategory,
  type WheelchairAccessibility
} from '$domain/place';
import type { CommandResult } from '$domain/results';

export interface CandidatePlaceCommand {
  operator: { name: string };
  location: {
    address_line: string;
    locality: string;
    postal_code: string;
    municipality: string;
    latitude: number;
    longitude: number;
    geometry_precision: LocationGeometryPrecision;
    geometry_source: string;
  };
  category: PlaceCategory;
  wheelchair_accessibility: WheelchairAccessibility;
  website_url: string | null;
  phone: string | null;
  opening_hours: Readonly<Record<string, Json>>;
  translations: {
    is: { name: string; description: string };
    en: { name: string; description: string };
  };
  evidence_records: Array<{
    kind: EvidenceKind;
    source_url: string | null;
    source_citation: string | null;
    source_label: string;
    observed_at: string;
    source_metadata: Readonly<Record<string, Json>>;
  }>;
  dog_amenities: string[];
  access_conditions: Array<{
    access_area: AccessArea;
    access_area_note?: string | null;
    restraint_condition: RestraintCondition;
    restraint_note?: string | null;
    dog_eligibility: Readonly<Record<string, Json>>;
    availability_window: Readonly<Record<string, Json>>;
    availability_state?: AvailabilityState;
    permission_requirement: PermissionRequirement;
  }>;
}

export type LocationGeometryPrecision =
  | 'moderator_confirmed_point'
  | 'official_address_point'
  | 'official_representative_centroid'
  | 'municipality_anchor_pending_geocode';

export interface LocationCorrectionCommand {
  placeId: string;
  expectedVersion: number;
  addressLine: string;
  locality: string;
  postalCode: string;
  municipality: string;
  latitude: number;
  longitude: number;
  geometryPrecision: LocationGeometryPrecision;
  geometrySource: string;
}

export interface CorrectedLocation {
  placeId: string;
  geometryPrecision: LocationGeometryPrecision;
  version: number;
}

export interface WheelchairAccessibilityCommand {
  placeId: string;
  expectedVersion: number;
  wheelchairAccessibility: WheelchairAccessibility;
}

export interface UpdatedWheelchairAccessibility {
  placeId: string;
  wheelchairAccessibility: WheelchairAccessibility;
  version: number;
}

export interface CreatedCandidate {
  placeId: string;
  version: number;
}

export interface PublishPlaceCommand {
  placeId: string;
  expectedVersion: number;
  conditionVerifications: ReadonlyArray<{
    accessConditionId: string;
    evidenceIds: readonly string[];
  }>;
  freshnessUntil: string;
  decisionMetadata: Readonly<Record<string, Json>>;
}

export interface PublishedPlace {
  placeId: string;
  verificationIds: string[];
  version: number;
  publishedAt: string;
}

export type PublicationResult =
  | { status: 'success'; value: PublishedPlace }
  | { status: 'incomplete' }
  | { status: 'stale' }
  | { status: 'forbidden' }
  | { status: 'already_published' }
  | { status: 'infrastructure_error' };

export interface PublicationChecks {
  candidate: boolean;
  operatorAndCategory: boolean;
  capitalRegionLocation: boolean;
  geometryQuality: boolean;
  icelandicTranslation: boolean;
  englishTranslation: boolean;
  accessCondition: boolean;
  evidence: boolean;
}

export interface CandidatePublicationReview {
  placeId: string;
  version: number;
  lifecycle: string;
  wheelchairAccessibility: WheelchairAccessibility;
  operatorName: string;
  category: string;
  addressLine: string;
  locality: string;
  postalCode: string;
  municipality: string;
  latitude: number;
  longitude: number;
  geometryPrecision: LocationGeometryPrecision;
  geometrySource: string;
  nameIs: string | null;
  descriptionIs: string | null;
  nameEn: string | null;
  descriptionEn: string | null;
  accessConditions: ModerationAccessCondition[];
  evidenceRecords: ModerationEvidence[];
  checks: PublicationChecks;
  ready: boolean;
}

export interface ModerationAccessCondition {
  id: string;
  accessArea: AccessArea;
  accessAreaNote: string | null;
  restraintCondition: RestraintCondition;
  restraintNote: string | null;
  dogEligibility: DogEligibility;
  availabilityWindow: AvailabilityWindow;
  availabilityState?: AvailabilityState;
  permissionRequirement: PermissionRequirement;
}

export interface ModerationEvidence {
  id: string;
  kind: EvidenceKind;
  sourceUrl: string | null;
  sourceCitation: string | null;
  sourceLabel: string;
  observedAt: string;
}

export type CandidateReviewResult =
  | { status: 'success'; value: CandidatePublicationReview }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'infrastructure_error' };

export async function createCandidatePlace(
  client: RequestSupabaseClient,
  command: CandidatePlaceCommand,
  requestId: string
): Promise<CommandResult<CreatedCandidate>> {
  try {
    const { data, error } = await client.rpc('create_candidate_place', {
      command_payload: command as unknown as Json,
      command_request_id: requestId
    });

    if (error) {
      return mapCommandError(error.code);
    }

    if (data.length !== 1 || !isCreatedCandidateRow(data[0])) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: {
        placeId: data[0].place_id,
        version: data[0].version
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function updateCandidatePlaceLocation(
  client: RequestSupabaseClient,
  command: LocationCorrectionCommand,
  requestId: string
): Promise<CommandResult<CorrectedLocation>> {
  try {
    const { data, error } = await client.rpc('update_candidate_place_location', {
      command_payload: {
        place_id: command.placeId,
        expected_version: command.expectedVersion,
        address_line: command.addressLine,
        locality: command.locality,
        postal_code: command.postalCode,
        municipality: command.municipality,
        latitude: command.latitude,
        longitude: command.longitude,
        geometry_precision: command.geometryPrecision,
        geometry_source: command.geometrySource
      },
      command_request_id: requestId
    });

    if (error) return error.code === '55000' ? { status: 'conflict' } : mapCommandError(error.code);
    const row = data[0];
    if (data.length !== 1 || !isCorrectedLocationRow(row)) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        geometryPrecision: row.geometry_precision,
        version: row.version
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function updatePlaceWheelchairAccessibility(
  client: RequestSupabaseClient,
  command: WheelchairAccessibilityCommand,
  requestId: string
): Promise<CommandResult<UpdatedWheelchairAccessibility>> {
  try {
    const { data, error } = await client.rpc('update_place_wheelchair_accessibility', {
      command_payload: {
        place_id: command.placeId,
        expected_version: command.expectedVersion,
        wheelchair_accessibility: command.wheelchairAccessibility
      },
      command_request_id: requestId
    });

    if (error) return mapCommandError(error.code);
    const row = data[0];
    if (data.length !== 1 || !isWheelchairAccessibilityRow(row)) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        wheelchairAccessibility: row.wheelchair_accessibility,
        version: row.version
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function verifyAndPublish(
  client: RequestSupabaseClient,
  command: PublishPlaceCommand,
  requestId: string
): Promise<PublicationResult> {
  try {
    const { data, error } = await client.rpc('verify_and_publish_place', {
      command_payload: {
        place_id: command.placeId,
        expected_version: command.expectedVersion,
        condition_verifications: command.conditionVerifications.map((verification) => ({
          access_condition_id: verification.accessConditionId,
          evidence_ids: [...verification.evidenceIds]
        })),
        freshness_until: command.freshnessUntil,
        decision_metadata: command.decisionMetadata
      } as Json,
      command_request_id: requestId
    });

    if (error) {
      return mapPublicationError(error.code);
    }

    if (data.length !== 1 || !isPublishedPlaceRow(data[0])) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: {
        placeId: data[0].place_id,
        verificationIds: data[0].verification_ids,
        version: data[0].version,
        publishedAt: data[0].published_at
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getCandidatePublicationReview(
  client: RequestSupabaseClient,
  placeId: string
): Promise<CandidateReviewResult> {
  try {
    const { data, error } = await client.rpc('get_moderation_place_review_v2', {
      requested_place_id: placeId
    });

    if (error) {
      return error.code === '42501' ? { status: 'forbidden' } : { status: 'infrastructure_error' };
    }

    if (data.length === 0) {
      return { status: 'not_found' };
    }

    if (data.length !== 1 || !isCandidateReviewRow(data[0])) {
      return { status: 'infrastructure_error' };
    }

    const row = data[0];
    const accessConditions = parseModerationConditions(row.access_conditions);
    const evidenceRecords = parseModerationEvidence(row.evidence_records);
    if (!accessConditions || !evidenceRecords) return { status: 'infrastructure_error' };

    const checks: PublicationChecks = {
      candidate: row.lifecycle === 'candidate',
      operatorAndCategory: hasText(row.operator_name) && hasText(row.category),
      capitalRegionLocation:
        hasText(row.address_line) &&
        hasText(row.locality) &&
        /^\d{3}$/.test(row.postal_code) &&
        capitalRegionMunicipalities.has(row.municipality),
      geometryQuality:
        Number.isFinite(row.latitude) &&
        Number.isFinite(row.longitude) &&
        row.geometry_precision !== 'municipality_anchor_pending_geocode' &&
        hasText(row.geometry_source),
      icelandicTranslation: hasText(row.name_is) && hasText(row.description_is),
      englishTranslation: hasText(row.name_en) && hasText(row.description_en),
      accessCondition: accessConditions.length > 0,
      evidence: evidenceRecords.length > 0
    };

    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        version: row.version,
        lifecycle: row.lifecycle,
        wheelchairAccessibility: row.wheelchair_accessibility,
        operatorName: row.operator_name,
        category: row.category,
        addressLine: row.address_line,
        locality: row.locality,
        postalCode: row.postal_code,
        municipality: row.municipality,
        latitude: row.latitude,
        longitude: row.longitude,
        geometryPrecision: row.geometry_precision,
        geometrySource: row.geometry_source,
        nameIs: row.name_is,
        descriptionIs: row.description_is,
        nameEn: row.name_en,
        descriptionEn: row.description_en,
        accessConditions,
        evidenceRecords,
        checks,
        ready: Object.values(checks).every(Boolean)
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapCommandError(code: string): CommandResult<never> {
  if (code === '42501') {
    return { status: 'forbidden' };
  }

  if (code === '22023' || code === '23502' || code === '23514') {
    return { status: 'validation_error' };
  }

  if (code === '23505' || code === '40001') {
    return { status: 'conflict' };
  }

  return { status: 'infrastructure_error' };
}

function mapPublicationError(code: string): PublicationResult {
  if (code === '42501') {
    return { status: 'forbidden' };
  }

  if (code === '40001') {
    return { status: 'stale' };
  }

  if (code === '55000') {
    return { status: 'already_published' };
  }

  if (code === '22007' || code === '22023' || code === '23502' || code === '23514') {
    return { status: 'incomplete' };
  }

  return { status: 'infrastructure_error' };
}

function isCreatedCandidateRow(
  row: { place_id: string; version: number } | undefined
): row is { place_id: string; version: number } {
  return (
    row !== undefined &&
    row.place_id.trim().length > 0 &&
    Number.isInteger(row.version) &&
    row.version > 0
  );
}

function isPublishedPlaceRow(
  row:
    | {
        place_id: string;
        verification_ids: string[];
        version: number;
        published_at: string;
      }
    | undefined
): row is {
  place_id: string;
  verification_ids: string[];
  version: number;
  published_at: string;
} {
  return (
    row !== undefined &&
    row.place_id.trim().length > 0 &&
    Array.isArray(row.verification_ids) &&
    row.verification_ids.length > 0 &&
    row.verification_ids.every(hasText) &&
    Number.isInteger(row.version) &&
    row.version > 0 &&
    row.published_at.trim().length > 0
  );
}

function isCorrectedLocationRow(
  row: { place_id: string; geometry_precision: string; version: number } | undefined
): row is {
  place_id: string;
  geometry_precision: LocationGeometryPrecision;
  version: number;
} {
  return (
    row !== undefined &&
    hasText(row.place_id) &&
    isLocationGeometryPrecision(row.geometry_precision) &&
    Number.isInteger(row.version) &&
    row.version > 0
  );
}

function isWheelchairAccessibilityRow(
  row: { place_id: string; wheelchair_accessibility: string; version: number } | undefined
): row is {
  place_id: string;
  wheelchair_accessibility: WheelchairAccessibility;
  version: number;
} {
  return (
    row !== undefined &&
    hasText(row.place_id) &&
    isWheelchairAccessibility(row.wheelchair_accessibility) &&
    Number.isInteger(row.version) &&
    row.version > 0
  );
}

function parseModerationConditions(value: Json): ModerationAccessCondition[] | null {
  if (!Array.isArray(value)) return null;
  const conditions: ModerationAccessCondition[] = [];
  for (const item of value) {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      !hasText(item.id) ||
      !isAccessArea(item.accessArea) ||
      !isOptionalText(item.accessAreaNote) ||
      !isRestraint(item.restraintCondition) ||
      !isOptionalText(item.restraintNote) ||
      parseDogEligibility(item.dogEligibility) === null ||
      parseAvailabilityWindow(item.availabilityWindow) === null ||
      (item.availabilityState !== undefined && !isAvailabilityState(item.availabilityState)) ||
      !isPermission(item.permissionRequirement)
    )
      return null;
    conditions.push(item as unknown as ModerationAccessCondition);
  }
  return conditions;
}

function parseModerationEvidence(value: Json): ModerationEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const records: ModerationEvidence[] = [];
  for (const item of value) {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      !hasText(item.id) ||
      !isEvidenceKind(item.kind) ||
      !isOptionalText(item.sourceUrl) ||
      !isOptionalText(item.sourceCitation) ||
      !hasText(item.sourceLabel) ||
      !hasText(item.observedAt) ||
      !Number.isFinite(Date.parse(item.observedAt))
    )
      return null;
    records.push(item as unknown as ModerationEvidence);
  }
  return records;
}

function isOptionalText(value: Json | undefined): value is string | null {
  return value === null || value === undefined || hasText(value);
}

function isAccessArea(value: Json | undefined): value is AccessArea {
  return (
    typeof value === 'string' &&
    ['indoors', 'outdoors', 'designated_area', 'other_bounded'].includes(value)
  );
}

function isRestraint(value: Json | undefined): value is RestraintCondition {
  return (
    typeof value === 'string' &&
    ['leash_required', 'off_leash_permitted', 'carrier_required', 'other_sourced'].includes(value)
  );
}

function isPermission(value: Json | undefined): value is PermissionRequirement {
  return (
    typeof value === 'string' &&
    ['standing_permission', 'ask_on_arrival', 'advance_approval'].includes(value)
  );
}

function isAvailabilityState(value: Json | undefined): value is AvailabilityState {
  return typeof value === 'string' && ['whenever_open', 'limited', 'not_stated'].includes(value);
}

function isEvidenceKind(value: Json | undefined): value is EvidenceKind {
  return (
    typeof value === 'string' &&
    [
      'official_website',
      'venue_representative',
      'member_report',
      'direct_observation',
      'public_record',
      'other'
    ].includes(value)
  );
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

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

type DatabaseReviewRow = {
  place_id: string;
  version: number;
  lifecycle: string;
  wheelchair_accessibility: WheelchairAccessibility;
  operator_name: string;
  category: string;
  address_line: string;
  locality: string;
  postal_code: string;
  municipality: string;
  latitude: number;
  longitude: number;
  geometry_precision: LocationGeometryPrecision;
  geometry_source: string;
  name_is: string | null;
  description_is: string | null;
  name_en: string | null;
  description_en: string | null;
  access_conditions: Json;
  evidence_records: Json;
};

type DatabaseReviewRowInput = Omit<
  DatabaseReviewRow,
  'geometry_precision' | 'wheelchair_accessibility'
> & {
  geometry_precision: string;
  wheelchair_accessibility: string;
};

function isCandidateReviewRow(row: DatabaseReviewRowInput | undefined): row is DatabaseReviewRow {
  return (
    row !== undefined &&
    hasText(row.place_id) &&
    Number.isInteger(row.version) &&
    row.version > 0 &&
    hasText(row.lifecycle) &&
    isWheelchairAccessibility(row.wheelchair_accessibility) &&
    hasText(row.operator_name) &&
    hasText(row.category) &&
    hasText(row.address_line) &&
    hasText(row.locality) &&
    hasText(row.postal_code) &&
    hasText(row.municipality) &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude) &&
    isLocationGeometryPrecision(row.geometry_precision) &&
    hasText(row.geometry_source) &&
    Array.isArray(row.access_conditions) &&
    Array.isArray(row.evidence_records)
  );
}

function isLocationGeometryPrecision(value: unknown): value is LocationGeometryPrecision {
  return (
    typeof value === 'string' &&
    [
      'moderator_confirmed_point',
      'official_address_point',
      'official_representative_centroid',
      'municipality_anchor_pending_geocode'
    ].includes(value)
  );
}
