import type { Json } from '$server/db/generated.types';
import type {
  SuggestionInputError,
  SuggestionProposal
} from '$server/suggestions/suggestion-input';

export const suggestionDraftSectionIds = [
  'identity',
  'location',
  'translations',
  'hours-and-amenities',
  'access-condition',
  'evidence',
  'proposal'
] as const;

export type SuggestionDraftSectionId = (typeof suggestionDraftSectionIds)[number];
export type SuggestionDraftParseResult =
  | { ok: true; sectionId: SuggestionDraftSectionId; payload: Record<string, Json> }
  | { ok: false; error: SuggestionInputError | 'invalid' };

export function parseSuggestionDraftSection(
  sectionId: string,
  formData: FormData
): SuggestionDraftParseResult {
  if (!isSuggestionDraftSectionId(sectionId)) return { ok: false, error: 'invalid' };
  const payload = parseJsonObject(formData.get('sectionPayload'));
  if (!payload) return { ok: false, error: 'invalid' };
  const patch = parseSectionPatch(sectionId, payload);
  return patch ? { ok: true, sectionId, payload: patch } : { ok: false, error: 'invalid' };
}

export function isSuggestionDraftSectionId(value: string): value is SuggestionDraftSectionId {
  return suggestionDraftSectionIds.some((sectionId) => sectionId === value);
}

function parseSectionPatch(
  sectionId: SuggestionDraftSectionId,
  payload: Record<string, unknown>
): Record<string, Json> | null {
  switch (sectionId) {
    case 'identity':
      return parseIdentity(payload);
    case 'location':
      return parseLocation(payload);
    case 'translations':
      return parseTranslations(payload);
    case 'hours-and-amenities':
      return parseHoursAndAmenities(payload);
    case 'access-condition':
      return parseAccessCondition(payload);
    case 'evidence':
      return parseEvidence(payload);
    case 'proposal':
      return parseProposal(payload);
  }
}

function parseProposal(payload: Record<string, unknown>): Record<string, Json> | null {
  if (
    !hasOnlyKeys(payload, [
      'purpose',
      'operator_name',
      'category',
      'location',
      'translations',
      'website_url',
      'phone',
      'opening_hours',
      'dog_amenities',
      'access_condition',
      'evidence'
    ])
  )
    return null;
  const identity = parseIdentity({
    purpose: payload.purpose,
    operator_name: payload.operator_name,
    category: payload.category
  });
  const location = parseLocation({ location: payload.location });
  const translations = parseTranslations({ translations: payload.translations });
  const details = parseHoursAndAmenities({
    website_url: payload.website_url,
    phone: payload.phone,
    opening_hours: payload.opening_hours,
    dog_amenities: payload.dog_amenities
  });
  const access = parseAccessCondition({ access_condition: payload.access_condition });
  const evidence = parseEvidence({ evidence: payload.evidence });
  return identity && location && translations && details && access && evidence
    ? { ...identity, ...location, ...translations, ...details, ...access, ...evidence }
    : null;
}

function parseIdentity(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['purpose', 'operator_name', 'category'])) return null;
  const operatorName = requiredText(payload.operator_name);
  if (
    payload.purpose !== 'dog_access_destination' ||
    !operatorName ||
    !categories.has(String(payload.category) as SuggestionProposal['category'])
  )
    return null;
  return {
    purpose: payload.purpose,
    operator_name: operatorName,
    category: String(payload.category)
  };
}

function parseLocation(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['location']) || !isRecord(payload.location)) return null;
  const location = payload.location;
  if (
    !hasOnlyKeys(location, [
      'address_line',
      'locality',
      'postal_code',
      'municipality',
      'latitude',
      'longitude'
    ])
  )
    return null;
  const addressLine = requiredText(location.address_line);
  const locality = requiredText(location.locality);
  const municipality = requiredText(location.municipality);
  if (
    !addressLine ||
    !locality ||
    !municipality ||
    typeof location.postal_code !== 'string' ||
    !/^\d{3}$/.test(location.postal_code) ||
    typeof location.latitude !== 'number' ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    typeof location.longitude !== 'number' ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  )
    return null;
  return {
    location: {
      address_line: addressLine,
      locality,
      postal_code: location.postal_code,
      municipality,
      latitude: location.latitude,
      longitude: location.longitude
    }
  };
}

function parseTranslations(payload: Record<string, unknown>): Record<string, Json> | null {
  if (
    !hasOnlyKeys(payload, ['translations']) ||
    !isRecord(payload.translations) ||
    !hasOnlyKeys(payload.translations, ['is', 'en'])
  )
    return null;
  const is = parseTranslation(payload.translations.is);
  const en = parseTranslation(payload.translations.en);
  return is && en ? { translations: { is, en } } : null;
}

function parseTranslation(value: unknown): Record<string, Json> | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'description', 'needs_review'])) return null;
  const name = requiredText(value.name);
  const description = requiredText(value.description);
  if (
    !name ||
    !description ||
    (value.needs_review !== undefined && typeof value.needs_review !== 'boolean')
  )
    return null;
  return {
    name,
    description,
    ...(typeof value.needs_review === 'boolean' ? { needs_review: value.needs_review } : {})
  };
}

function parseHoursAndAmenities(payload: Record<string, unknown>): Record<string, Json> | null {
  if (
    !hasOnlyKeys(payload, ['website_url', 'phone', 'opening_hours', 'dog_amenities']) ||
    !isJsonObject(payload.opening_hours) ||
    !Array.isArray(payload.dog_amenities)
  )
    return null;
  const websiteUrl = optionalUrl(payload.website_url);
  const phone = optionalText(payload.phone);
  const amenities = payload.dog_amenities.map(requiredText);
  if (websiteUrl === undefined || phone === undefined || amenities.some((item) => item === null))
    return null;
  return {
    website_url: websiteUrl,
    phone,
    opening_hours: payload.opening_hours,
    dog_amenities: amenities as string[]
  };
}

function parseAccessCondition(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['access_condition']) || !isRecord(payload.access_condition))
    return null;
  const value = payload.access_condition;
  if (
    !hasOnlyKeys(value, [
      'access_area',
      'access_area_note',
      'restraint_condition',
      'restraint_note',
      'dog_eligibility',
      'availability_state',
      'availability_window',
      'permission_requirement'
    ]) ||
    !accessAreas.has(String(value.access_area)) ||
    !restraints.has(String(value.restraint_condition)) ||
    !permissions.has(String(value.permission_requirement)) ||
    !availabilityStates.has(String(value.availability_state)) ||
    !isRecord(value.dog_eligibility) ||
    value.dog_eligibility.scope !== 'all_dogs' ||
    !isJsonObject(value.availability_window)
  )
    return null;
  const accessAreaNote = optionalText(value.access_area_note);
  const restraintNote = optionalText(value.restraint_note);
  if (
    accessAreaNote === undefined ||
    restraintNote === undefined ||
    (value.access_area === 'other_bounded' && !accessAreaNote) ||
    (value.restraint_condition === 'other_sourced' && !restraintNote)
  )
    return null;
  const hasWindow = Object.keys(value.availability_window).length > 0;
  if ((value.availability_state === 'limited') !== hasWindow) return null;
  return {
    access_condition: {
      access_area: String(value.access_area),
      access_area_note: accessAreaNote,
      restraint_condition: String(value.restraint_condition),
      restraint_note: restraintNote,
      dog_eligibility: { scope: 'all_dogs' },
      availability_state: String(value.availability_state),
      availability_window: value.availability_window,
      permission_requirement: String(value.permission_requirement)
    }
  };
}

function parseEvidence(payload: Record<string, unknown>): Record<string, Json> | null {
  if (!hasOnlyKeys(payload, ['evidence']) || !isRecord(payload.evidence)) return null;
  const value = payload.evidence;
  if (
    !hasOnlyKeys(value, [
      'kind',
      'source_url',
      'source_citation',
      'source_label',
      'observed_at',
      'explanation',
      'source_metadata'
    ]) ||
    !evidenceKinds.has(String(value.kind)) ||
    !isJsonObject(value.source_metadata)
  )
    return null;
  const sourceUrl = optionalUrl(value.source_url);
  const sourceCitation = optionalText(value.source_citation);
  const sourceLabel = requiredText(value.source_label);
  const observedAt = requiredText(value.observed_at);
  const explanation = requiredText(value.explanation);
  if (
    sourceUrl === undefined ||
    sourceCitation === undefined ||
    (!sourceUrl && !sourceCitation) ||
    !sourceLabel ||
    !observedAt ||
    !Number.isFinite(Date.parse(observedAt)) ||
    !explanation
  )
    return null;
  return {
    evidence: {
      kind: String(value.kind),
      source_url: sourceUrl,
      source_citation: sourceCitation,
      source_label: sourceLabel,
      observed_at: observedAt,
      explanation,
      source_metadata: value.source_metadata
    }
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
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).every((key) => keys.includes(key)) &&
    keys.filter((key) => key !== 'needs_review').every((key) => key in value)
  );
}
function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() || null : undefined;
}
function optionalUrl(value: unknown): string | null | undefined {
  const text = optionalText(value);
  if (!text) return text;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : undefined;
  } catch {
    return undefined;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isJsonObject(value: unknown): value is Record<string, Json> {
  return isRecord(value) && Object.values(value).every(isJson);
}
function isJson(value: unknown): value is Json {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.every(isJson)) ||
    (isRecord(value) && Object.values(value).every(isJson))
  );
}

const categories = new Set([
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
const accessAreas = new Set(['indoors', 'outdoors', 'designated_area', 'other_bounded']);
const restraints = new Set([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);
const permissions = new Set(['standing_permission', 'ask_on_arrival', 'advance_approval']);
const availabilityStates = new Set(['whenever_open', 'limited', 'not_stated']);
const evidenceKinds = new Set([
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
]);
