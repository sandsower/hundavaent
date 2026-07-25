import type { Json } from '$server/db/generated.types';
import type { RequestSupabaseClient } from '$server/db/clients';
import {
  notStatedByMember,
  type AccessArea,
  type AvailabilityState,
  type AvailabilityWindow,
  type DogEligibility,
  type PermissionRequirement,
  type RestraintCondition
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
  expectedItemVersion: number;
  expectedDraftVersion: number;
  freshnessUntil: string;
  publicationReason: string;
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
  | { status: 'not_publishable' }
  | { status: 'infrastructure_error' };

export interface PublicationChecks {
  candidate: boolean;
  operatorAndCategory: boolean;
  capitalRegionLocation: boolean;
  geometryQuality: boolean;
  icelandicTranslation: boolean;
  englishTranslation: boolean;
  accessCondition: boolean;
  publishableRestraintNote: boolean;
}

export interface CandidatePublicationReview {
  placeId: string;
  version: number;
  lifecycle: string;
  candidateStatus: 'pending' | 'needs_information' | 'rejected' | 'published';
  itemVersion: number;
  draftVersion: number;
  draftPayload: Json | null;
  draftUpdatedBy: string | null;
  draftUpdatedAt: string | null;
  readinessState: 'ready' | 'blocked';
  readinessIssues: string[];
  originatingSuggestionId: string | null;
  contributorId: string | null;
  wheelchairAccessibility: WheelchairAccessibility;
  operatorName: string;
  category: string;
  websiteUrl: string | null;
  phone: string | null;
  openingHours: Readonly<Record<string, Json>>;
  dogAmenities: string[];
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
  sourceMetadata: Readonly<Record<string, Json>>;
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

export async function updateModeratedPlaceLocation(
  client: RequestSupabaseClient,
  command: LocationCorrectionCommand,
  requestId: string
): Promise<CommandResult<CorrectedLocation>> {
  try {
    const { data, error } = await client.rpc('update_moderated_place_location', {
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
        expected_item_version: command.expectedItemVersion,
        expected_draft_version: command.expectedDraftVersion,
        freshness_until: command.freshnessUntil,
        publication_reason: command.publicationReason,
        decision_metadata: {
          source: 'moderation_workbench',
          publication_reason: command.publicationReason
        }
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

    const candidateRow = data[0] as unknown as DatabaseReviewRowInput | undefined;
    if (data.length !== 1 || !isCandidateReviewRow(candidateRow)) {
      return { status: 'infrastructure_error' };
    }

    const row = candidateRow;
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
      // A minimal Suggestion carries the server's own sentence where the Member stated no
      // restraint rule, and accept copies that note onto the Candidate. The note is publishable
      // text: it renders on a public Place profile in English, untranslated, as a rule nobody
      // stated. Publication waits until a Moderator writes the real rule or clears the note,
      // exactly as it waits for a translation.
      publishableRestraintNote: accessConditions.every(
        (condition) => condition.restraintNote?.trim() !== notStatedByMember
      )
    };
    const ready = Object.entries(checks).every(
      ([check, passed]) => passed || (check === 'candidate' && row.lifecycle === 'published')
    );

    return {
      status: 'success',
      value: {
        placeId: row.place_id,
        version: row.version,
        lifecycle: row.lifecycle,
        candidateStatus: row.candidate_status,
        itemVersion: row.item_version,
        draftVersion: row.draft_version,
        draftPayload: row.draft_payload,
        draftUpdatedBy: row.draft_updated_by,
        draftUpdatedAt: row.draft_updated_at,
        readinessState: row.readiness_state,
        readinessIssues: row.readiness_issues,
        originatingSuggestionId: row.originating_suggestion_id,
        contributorId: row.contributor_id,
        wheelchairAccessibility: row.wheelchair_accessibility,
        operatorName: row.operator_name,
        category: row.category,
        websiteUrl: row.website_url,
        phone: row.phone,
        openingHours: row.opening_hours,
        dogAmenities: row.dog_amenities,
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
        ready
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
    return { status: 'not_publishable' };
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
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const accessArea = item.accessArea ?? item.access_area;
    const accessAreaNote = item.accessAreaNote ?? item.access_area_note;
    const restraintCondition = item.restraintCondition ?? item.restraint_condition;
    const restraintNote = item.restraintNote ?? item.restraint_note;
    const dogEligibility = item.dogEligibility ?? item.dog_eligibility;
    const availabilityWindow = item.availabilityWindow ?? item.availability_window;
    const availabilityState = item.availabilityState ?? item.availability_state;
    const permissionRequirement = item.permissionRequirement ?? item.permission_requirement;
    if (
      !hasText(item.id) ||
      !isAccessArea(accessArea) ||
      !isOptionalText(accessAreaNote) ||
      !isRestraint(restraintCondition) ||
      !isOptionalText(restraintNote) ||
      parseDogEligibility(dogEligibility) === null ||
      parseAvailabilityWindow(availabilityWindow) === null ||
      (availabilityState !== undefined && !isAvailabilityState(availabilityState)) ||
      !isPermission(permissionRequirement)
    )
      return null;
    conditions.push({
      id: item.id,
      accessArea,
      accessAreaNote: accessAreaNote ?? null,
      restraintCondition,
      restraintNote: restraintNote ?? null,
      dogEligibility: parseDogEligibility(dogEligibility) as DogEligibility,
      availabilityWindow: parseAvailabilityWindow(availabilityWindow) as AvailabilityWindow,
      ...(availabilityState === undefined ? {} : { availabilityState }),
      permissionRequirement
    });
  }
  return conditions;
}

function parseModerationEvidence(value: Json): ModerationEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const records: ModerationEvidence[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const sourceUrl = item.sourceUrl ?? item.source_url;
    const sourceCitation = item.sourceCitation ?? item.source_citation;
    const sourceLabel = item.sourceLabel ?? item.source_label;
    const observedAt = item.observedAt ?? item.observed_at;
    const sourceMetadata = item.sourceMetadata ?? item.source_metadata;
    if (
      !hasText(item.id) ||
      !isEvidenceKind(item.kind) ||
      !isOptionalText(sourceUrl) ||
      !isOptionalText(sourceCitation) ||
      !hasText(sourceLabel) ||
      !hasText(observedAt) ||
      !Number.isFinite(Date.parse(observedAt)) ||
      !isJsonObject(sourceMetadata)
    )
      return null;
    records.push({
      id: item.id,
      kind: item.kind,
      sourceUrl: sourceUrl ?? null,
      sourceCitation: sourceCitation ?? null,
      sourceLabel,
      observedAt,
      sourceMetadata
    });
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
  candidate_status: 'pending' | 'needs_information' | 'rejected' | 'published';
  item_version: number;
  draft_version: number;
  draft_payload: Json | null;
  draft_updated_by: string | null;
  draft_updated_at: string | null;
  readiness_state: 'ready' | 'blocked';
  readiness_issues: string[];
  originating_suggestion_id: string | null;
  contributor_id: string | null;
  wheelchair_accessibility: WheelchairAccessibility;
  operator_name: string;
  category: string;
  website_url: string | null;
  phone: string | null;
  opening_hours: Readonly<Record<string, Json>>;
  dog_amenities: string[];
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
    isCandidateReviewStatus(row.candidate_status) &&
    Number.isInteger(row.item_version) &&
    row.item_version > 0 &&
    Number.isInteger(row.draft_version) &&
    row.draft_version >= 0 &&
    (row.draft_payload === null || isJsonObject(row.draft_payload)) &&
    (row.draft_updated_by === null || hasText(row.draft_updated_by)) &&
    (row.draft_updated_at === null || hasText(row.draft_updated_at)) &&
    (row.readiness_state === 'ready' || row.readiness_state === 'blocked') &&
    Array.isArray(row.readiness_issues) &&
    row.readiness_issues.every(hasText) &&
    (row.originating_suggestion_id === null || hasText(row.originating_suggestion_id)) &&
    (row.contributor_id === null || hasText(row.contributor_id)) &&
    isWheelchairAccessibility(row.wheelchair_accessibility) &&
    hasText(row.operator_name) &&
    hasText(row.category) &&
    (row.website_url === null || hasText(row.website_url)) &&
    (row.phone === null || hasText(row.phone)) &&
    isJsonObject(row.opening_hours) &&
    Array.isArray(row.dog_amenities) &&
    row.dog_amenities.every(hasText) &&
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

function isCandidateReviewStatus(value: unknown): value is DatabaseReviewRow['candidate_status'] {
  return (
    value === 'pending' ||
    value === 'needs_information' ||
    value === 'rejected' ||
    value === 'published'
  );
}

function isJsonObject(value: unknown): value is Readonly<Record<string, Json>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
