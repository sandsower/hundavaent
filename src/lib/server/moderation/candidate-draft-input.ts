import { parseAvailabilityWindow, parseDogEligibility } from '$domain/access-schema';
import type { PlaceCategory } from '$domain/place';
import type { Json } from '$server/db/generated.types';

export const candidateDraftSectionIds = [
  'identity',
  'location',
  'translations',
  'details',
  'access_conditions',
  'evidence_records'
] as const;

export type CandidateDraftSectionId = (typeof candidateDraftSectionIds)[number];

export function isCandidateDraftSectionId(value: string): value is CandidateDraftSectionId {
  return candidateDraftSectionIds.some((sectionId) => sectionId === value);
}

export function parseCandidateDraftSectionPatch(
  sectionId: string,
  formData: FormData
): Record<string, Json> | null {
  if (!isCandidateDraftSectionId(sectionId)) return null;
  if (sectionId === 'location') return parseLocation(formData);

  const payload = parseJsonObject(formData.get('sectionPayload'));
  if (!payload) return null;
  if (sectionId === 'identity') return parseIdentity(payload);
  if (sectionId === 'translations') return parseTranslations(payload);
  if (sectionId === 'details') return parseDetails(payload);
  if (sectionId === 'access_conditions') return parseAccessConditions(payload);
  return parseEvidenceRecords(payload);
}

function parseIdentity(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['operator', 'category']) || !isRecord(payload.operator)) return null;
  if (!hasOnlyKeys(payload.operator, ['name'])) return null;
  const name = requiredText(payload.operator.name);
  if (!name || !isPlaceCategory(payload.category)) return null;
  return { operator: { name }, category: payload.category };
}

function parseLocation(formData: FormData): Record<string, Json> | null {
  const addressLine = requiredText(formData.get('addressLine'));
  const locality = requiredText(formData.get('locality'));
  const postalCode = requiredText(formData.get('postalCode'));
  const municipality = requiredText(formData.get('municipality'));
  const latitude = Number(formData.get('latitude'));
  const longitude = Number(formData.get('longitude'));
  const geometryPrecision = String(formData.get('geometryPrecision') ?? '').trim();
  const geometrySource = requiredText(formData.get('geometrySource'));
  if (
    !addressLine ||
    !locality ||
    !postalCode ||
    !municipality ||
    !/^\d{3}$/.test(postalCode) ||
    !capitalRegionMunicipalities.has(municipality) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !geometryPrecisions.has(geometryPrecision) ||
    !geometrySource
  ) {
    return null;
  }
  return {
    location: {
      address_line: addressLine,
      locality,
      postal_code: postalCode,
      municipality,
      latitude,
      longitude,
      geometry_precision: geometryPrecision,
      geometry_source: geometrySource
    }
  };
}

function parseTranslations(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['translations']) || !isRecord(payload.translations)) return null;
  if (!hasOnlyKeys(payload.translations, ['is', 'en'])) return null;
  const icelandic = parseTranslation(payload.translations.is);
  const english = parseTranslation(payload.translations.en);
  if (!icelandic || !english) return null;
  return { translations: { is: icelandic, en: english } };
}

function parseTranslation(value: unknown): Record<string, Json> | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'description'])) return null;
  const name = requiredText(value.name);
  const description = requiredText(value.description);
  return name && description ? { name, description } : null;
}

function parseDetails(payload: Record<string, unknown>): Record<string, Json> | null {
  if (
    !hasOnlyKeys(payload, ['website_url', 'phone', 'opening_hours', 'dog_amenities']) ||
    !isRecord(payload.opening_hours) ||
    !isJsonObject(payload.opening_hours) ||
    !Array.isArray(payload.dog_amenities)
  ) {
    return null;
  }
  const websiteUrl = optionalUrl(payload.website_url);
  const phone = optionalText(payload.phone);
  const dogAmenities = payload.dog_amenities.map(requiredText);
  if (websiteUrl === undefined || phone === undefined || dogAmenities.some((item) => !item)) {
    return null;
  }
  return {
    website_url: websiteUrl,
    phone,
    opening_hours: payload.opening_hours,
    dog_amenities: dogAmenities as string[]
  };
}

function parseAccessConditions(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['access_conditions']) || !Array.isArray(payload.access_conditions)) {
    return null;
  }
  const conditions = payload.access_conditions.map(parseAccessCondition);
  return conditions.some((condition) => condition === null)
    ? null
    : { access_conditions: conditions as Record<string, Json>[] };
}

function parseAccessCondition(value: unknown): Record<string, Json> | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'access_area',
      'access_area_note',
      'restraint_condition',
      'restraint_note',
      'dog_eligibility',
      'availability_state',
      'availability_window',
      'permission_requirement'
    ]) ||
    !isOptionalUuid(value.id) ||
    !accessAreas.has(String(value.access_area)) ||
    !restraintConditions.has(String(value.restraint_condition)) ||
    !availabilityStates.has(String(value.availability_state)) ||
    !permissionRequirements.has(String(value.permission_requirement)) ||
    !isJsonObject(value.dog_eligibility) ||
    !isJsonObject(value.availability_window) ||
    parseDogEligibility(value.dog_eligibility) === null ||
    parseAvailabilityWindow(value.availability_window) === null
  ) {
    return null;
  }
  const accessAreaNote = optionalText(value.access_area_note);
  const restraintNote = optionalText(value.restraint_note);
  if (accessAreaNote === undefined || restraintNote === undefined) return null;

  const availabilityState = String(value.availability_state);
  const hasWindow = Object.keys(value.availability_window).length > 0;
  if ((availabilityState === 'limited') !== hasWindow) return null;

  return {
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    access_area: String(value.access_area),
    access_area_note: accessAreaNote,
    restraint_condition: String(value.restraint_condition),
    restraint_note: restraintNote,
    dog_eligibility: value.dog_eligibility,
    availability_state: availabilityState,
    availability_window: value.availability_window,
    permission_requirement: String(value.permission_requirement)
  };
}

function parseEvidenceRecords(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['evidence_records']) || !Array.isArray(payload.evidence_records)) {
    return null;
  }
  const evidence = payload.evidence_records.map(parseEvidenceRecord);
  return evidence.some((record) => record === null)
    ? null
    : { evidence_records: evidence as Record<string, Json>[] };
}

function parseEvidenceRecord(value: unknown): Record<string, Json> | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'kind',
      'source_url',
      'source_citation',
      'source_label',
      'observed_at',
      'source_metadata'
    ]) ||
    !isOptionalUuid(value.id) ||
    !evidenceKinds.has(String(value.kind)) ||
    !isJsonObject(value.source_metadata)
  ) {
    return null;
  }
  const sourceUrl = optionalUrl(value.source_url);
  const sourceCitation = optionalText(value.source_citation);
  const sourceLabel = requiredText(value.source_label);
  const observedAt = requiredText(value.observed_at);
  if (
    sourceUrl === undefined ||
    sourceCitation === undefined ||
    (!sourceUrl && !sourceCitation) ||
    !sourceLabel ||
    !observedAt ||
    !Number.isFinite(Date.parse(observedAt))
  ) {
    return null;
  }
  return {
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    kind: String(value.kind),
    source_url: sourceUrl,
    source_citation: sourceCitation,
    source_label: sourceLabel,
    observed_at: observedAt,
    source_metadata: value.source_metadata
  };
}

function parseJsonObject(value: FormDataEntryValue | null): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim() || null;
}

function optionalUrl(value: unknown): string | null | undefined {
  const normalized = optionalText(value);
  if (normalized === undefined || normalized === null) return normalized;
  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:' ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function isOptionalUuid(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && uuidPattern.test(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isJsonObject(value: unknown): value is Record<string, Json> {
  return isRecord(value) && Object.values(value).every(isJson);
}

function isJson(value: unknown): value is Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === 'string' && placeCategories.has(value as PlaceCategory);
}

const placeCategories = new Set<PlaceCategory>([
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
const capitalRegionMunicipalities = new Set([
  'reykjavik',
  'kopavogur',
  'seltjarnarnes',
  'gardabaer',
  'hafnarfjordur',
  'mosfellsbaer',
  'kjosarhreppur'
]);
const geometryPrecisions = new Set([
  'moderator_confirmed_point',
  'official_address_point',
  'official_representative_centroid',
  'municipality_anchor_pending_geocode'
]);
const accessAreas = new Set(['indoors', 'outdoors', 'designated_area', 'other_bounded']);
const restraintConditions = new Set([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);
const availabilityStates = new Set(['whenever_open', 'limited', 'not_stated']);
const permissionRequirements = new Set([
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
]);
const evidenceKinds = new Set([
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
