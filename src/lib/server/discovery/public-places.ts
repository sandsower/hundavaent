import type {
  AccessArea,
  AvailabilityState,
  AvailabilityWindow,
  DogEligibility,
  PermissionRequirement,
  RestraintCondition
} from '$domain/access';
import { parseAvailabilityWindow, parseDogEligibility } from '$domain/access-schema';
import type { PlaceCategory } from '$domain/place';
import type { Locale } from '$i18n';
import type { Database, Json } from '$server/db/generated.types';
import type { RequestSupabaseClient } from '$server/db/clients';
import {
  getSummary,
  type DogFriendlinessRpcClient,
  type DogFriendlinessSummary
} from '$server/dog-friendliness/dog-friendliness';
import {
  listPublishedPlacePhotos,
  signPlaceMediaUrl,
  signPlaceMediaUrls
} from '$server/place-media/place-media';
import type { PlacePhotoRightsBasis } from '$server/place-media/place-media-input';

type ListRow = Database['public']['Functions']['list_published_places_v2']['Returns'][number];
type ProfileRow =
  Database['public']['Functions']['get_published_place_profile_v2']['Returns'][number];
const publishedPhotoUrlTtlSeconds = 300;

export interface PublishedPlaceSummary {
  placeId: string;
  name: string;
  category: PlaceCategory;
  locality: string;
  latitude: number;
  longitude: number;
  accessConditionCount: number;
  simpleAccessSummary: boolean;
  accessArea: AccessArea | null;
  restraintCondition: RestraintCondition | null;
  permissionRequirement: PermissionRequirement | null;
  accessConditions: PublishedAccessConditionSummary[];
  primaryPhoto: PublishedPlacePrimaryPhoto | null;
}

export interface PublishedPlacePrimaryPhoto {
  mediaId: string;
  url: string;
  widthPx: number;
  heightPx: number;
  altTextIs: string;
  altTextEn: string;
  rightsBasis: PlacePhotoRightsBasis;
  sourceUrl: string | null;
  licenseReference: string;
  licenseUrl: string | null;
  attributionText: string;
  attributionUrl: string | null;
  urlExpiresAt: string;
}

export interface PublishedAccessConditionSummary {
  accessArea: AccessArea;
  restraintCondition: RestraintCondition;
  permissionRequirement: PermissionRequirement;
  dogEligibilityState?: 'all_dogs' | 'small_dogs_only' | 'special' | 'not_stated';
  availabilityState?: AvailabilityState;
}

export interface PublishedAccessFacts {
  id: string;
  accessArea: AccessArea;
  accessAreaNote: string | null;
  restraintCondition: RestraintCondition;
  restraintNote: string | null;
  dogEligibility: DogEligibility;
  availabilityWindow: AvailabilityWindow;
  availabilityState?: AvailabilityState;
  permissionRequirement: PermissionRequirement;
  accessInformationUrls?: string[];
}

export interface PublishedPlacePhoto {
  mediaId: string;
  url: string;
  widthPx: number;
  heightPx: number;
  altTextIs: string;
  altTextEn: string;
  rightsBasis: PlacePhotoRightsBasis | null;
  sourceUrl: string | null;
  licenseReference: string;
  licenseUrl: string | null;
  attributionText: string;
  attributionUrl: string | null;
  isPrimary: boolean;
  urlExpiresAt: string;
}

export interface PublishedPlaceProfile {
  placeId: string;
  name: string;
  description: string;
  category: PlaceCategory;
  location: {
    addressLine: string;
    locality: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  websiteUrl: string | null;
  phone: string | null;
  openingHours: Readonly<Record<string, Json>>;
  dogAmenities: string[];
  accessInformationUrls?: string[];
  accessConditions: PublishedAccessFacts[];
  dogFriendlinessSummary: DogFriendlinessSummary;
  photos: PublishedPlacePhoto[];
}

export type PublicListResult =
  | { status: 'success'; value: PublishedPlaceSummary[] }
  | { status: 'invalid_response' }
  | { status: 'infrastructure_error' };

export type PublicProfileResult =
  | { status: 'success'; value: PublishedPlaceProfile }
  | { status: 'not_found' }
  | { status: 'invalid_response' }
  | { status: 'infrastructure_error' };

export type PublicPhotoDeliveryResult =
  | { status: 'success'; value: { url: string; urlExpiresAt: string } }
  | { status: 'not_found' }
  | { status: 'infrastructure_error' };

export async function listPublished(
  client: RequestSupabaseClient,
  locale: Locale
): Promise<PublicListResult> {
  try {
    const { data, error } = await client.rpc('list_published_places_v2', {
      requested_locale: locale
    });

    if (error) {
      return { status: 'infrastructure_error' };
    }

    if (!Array.isArray(data) || !data.every(isListRowWithoutCoordinates)) {
      return { status: 'invalid_response' };
    }

    const summaries = data.filter(hasValidCoordinates).map(mapListRow);
    const primaryPhotos = await resolvePublishedPlacePrimaryPhotos(
      client,
      summaries.map((place) => place.placeId)
    );

    return {
      status: 'success',
      value: summaries.map((place) => ({
        ...place,
        primaryPhoto: primaryPhotos.get(place.placeId) ?? null
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

async function resolvePublishedPlacePrimaryPhotos(
  client: RequestSupabaseClient,
  placeIds: string[]
): Promise<Map<string, PublishedPlacePrimaryPhoto>> {
  const photos = new Map<string, PublishedPlacePrimaryPhoto>();
  if (placeIds.length === 0) return photos;
  try {
    const { data, error } = await client.rpc('list_published_place_primary_photos', {
      requested_place_ids: placeIds
    });
    if (error || !Array.isArray(data) || !data.every(isPrimaryPhotoRow)) return photos;

    const requestedIds = new Set(placeIds);
    const requestedRows = data.filter((row) => requestedIds.has(row.place_id));
    const urlExpiresAt = new Date(Date.now() + publishedPhotoUrlTtlSeconds * 1_000).toISOString();
    const signedUrls = await signPlaceMediaUrls(
      client,
      'place-photos',
      requestedRows.map((row) => row.storage_object_path),
      publishedPhotoUrlTtlSeconds
    );

    for (const row of requestedRows) {
      const url = signedUrls.get(row.storage_object_path);
      if (!url || photos.has(row.place_id)) continue;
      photos.set(row.place_id, {
        mediaId: row.media_id,
        url,
        widthPx: row.width_px,
        heightPx: row.height_px,
        altTextIs: row.alt_text_is,
        altTextEn: row.alt_text_en,
        rightsBasis: row.rights_basis as PlacePhotoRightsBasis,
        sourceUrl: row.source_url,
        licenseReference: row.license_reference,
        licenseUrl: row.license_url,
        attributionText: row.attribution_text,
        attributionUrl: row.attribution_url,
        urlExpiresAt
      });
    }
  } catch {
    // Photography is supplementary. Keep the compact directory usable when media lookup fails.
  }
  return photos;
}

export async function getPublishedProfile(
  client: RequestSupabaseClient,
  placeId: string,
  locale: Locale
): Promise<PublicProfileResult> {
  try {
    const { data, error } = await client.rpc('get_published_place_profile_v2', {
      requested_place_id: placeId,
      requested_locale: locale
    });

    if (error) {
      return { status: 'infrastructure_error' };
    }

    if (!Array.isArray(data)) {
      return { status: 'invalid_response' };
    }

    if (data.length === 0) {
      return { status: 'not_found' };
    }

    if (!data.every(isProfileRow) || data.some((row) => row.place_id !== placeId)) {
      return { status: 'invalid_response' };
    }

    const first = data[0];

    if (!first || data.some((row) => !hasSameProfileIdentity(first, row))) {
      return { status: 'invalid_response' };
    }

    const summaryResult = await getSummary(client as unknown as DogFriendlinessRpcClient, placeId);
    const dogFriendlinessSummary: DogFriendlinessSummary =
      summaryResult.status === 'success'
        ? summaryResult.value
        : hiddenDogFriendlinessSummary(placeId);

    const photos = await resolvePublishedPlacePhotos(client, placeId);

    return {
      status: 'success',
      value: {
        placeId: first.place_id,
        name: first.name,
        description: first.description,
        category: first.category as PlaceCategory,
        location: {
          addressLine: first.address_line,
          locality: first.locality,
          postalCode: first.postal_code,
          latitude: first.latitude,
          longitude: first.longitude
        },
        websiteUrl: first.website_url,
        phone: first.phone,
        openingHours: first.opening_hours as Readonly<Record<string, Json>>,
        dogAmenities: first.dog_amenities as string[],
        accessConditions: data.map(mapAccessFacts),
        // Evidence URLs are moderator provenance, not visitor-facing place links. The public card
        // exposes only the Place's clearly labelled website when one exists.
        accessInformationUrls: [],
        dogFriendlinessSummary,
        photos
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function refreshPublishedPhotoUrl(
  client: RequestSupabaseClient,
  placeId: string,
  mediaId: string
): Promise<PublicPhotoDeliveryResult> {
  const photosResult = await listPublishedPlacePhotos(client, placeId);
  if (photosResult.status !== 'success') return { status: 'infrastructure_error' };

  const photo = photosResult.value.find((candidate) => candidate.mediaId === mediaId);
  if (!photo) return { status: 'not_found' };

  const bucket = photo.storageBucket as 'place-evidence' | 'place-photos';
  try {
    const urlExpiresAt = new Date(Date.now() + publishedPhotoUrlTtlSeconds * 1_000).toISOString();
    const url = await signPlaceMediaUrl(
      client,
      bucket,
      photo.storageObjectPath,
      publishedPhotoUrlTtlSeconds
    );
    return url
      ? {
          status: 'success',
          value: { url, urlExpiresAt }
        }
      : { status: 'not_found' };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

// A signing failure or infrastructure hiccup degrades to an empty gallery rather than failing the
// whole profile - Photos are supplementary to the Access Conditions a Visitor actually needs.
async function resolvePublishedPlacePhotos(
  client: RequestSupabaseClient,
  placeId: string
): Promise<PublishedPlacePhoto[]> {
  const photosResult = await listPublishedPlacePhotos(client, placeId);
  if (photosResult.status !== 'success') {
    return [];
  }

  const urlExpiresAt = new Date(Date.now() + publishedPhotoUrlTtlSeconds * 1_000).toISOString();
  const signedByBucket = new Map<'place-evidence' | 'place-photos', Map<string, string>>();
  for (const bucket of ['place-evidence', 'place-photos'] as const) {
    const paths = photosResult.value
      .filter((photo) => photo.storageBucket === bucket)
      .map((photo) => photo.storageObjectPath);
    if (paths.length > 0) {
      signedByBucket.set(
        bucket,
        await signPlaceMediaUrls(client, bucket, paths, publishedPhotoUrlTtlSeconds)
      );
    }
  }

  return photosResult.value.flatMap((photo) => {
    const bucket = photo.storageBucket as 'place-evidence' | 'place-photos';
    const url = signedByBucket.get(bucket)?.get(photo.storageObjectPath);
    return url
      ? [
          {
            mediaId: photo.mediaId,
            url,
            widthPx: photo.widthPx,
            heightPx: photo.heightPx,
            altTextIs: photo.altTextIs,
            altTextEn: photo.altTextEn,
            rightsBasis: photo.rightsBasis,
            sourceUrl: photo.sourceUrl,
            licenseReference: photo.licenseReference,
            licenseUrl: photo.licenseUrl,
            attributionText: photo.attributionText,
            attributionUrl: photo.attributionUrl,
            isPrimary: photo.isPrimary,
            urlExpiresAt
          }
        ]
      : [];
  });
}

function hiddenDogFriendlinessSummary(placeId: string): DogFriendlinessSummary {
  return {
    placeId,
    visible: false,
    eligibleCount: null,
    trailingTwelveMonthCount: null,
    dimensions: [],
    overallMean: null,
    overallVisible: false
  };
}

function mapListRow(row: ListRow): PublishedPlaceSummary {
  const accessConditions = parsePublishedAccessConditionSummaries(row.access_conditions);
  if (!accessConditions) throw new Error('Invalid access condition summaries reached mapper');
  return {
    placeId: row.place_id,
    name: row.name,
    category: row.category as PlaceCategory,
    locality: row.locality,
    latitude: row.latitude,
    longitude: row.longitude,
    accessConditionCount: row.access_condition_count,
    simpleAccessSummary: row.simple_access_summary,
    accessArea: row.access_area as AccessArea | null,
    restraintCondition: row.restraint_condition as RestraintCondition | null,
    permissionRequirement: row.permission_requirement as PermissionRequirement | null,
    accessConditions,
    primaryPhoto: null
  };
}

function isPrimaryPhotoRow(
  row: Database['public']['Functions']['list_published_place_primary_photos']['Returns'][number]
): boolean {
  return (
    hasText(row.place_id) &&
    hasText(row.media_id) &&
    row.storage_bucket === 'place-photos' &&
    hasText(row.storage_object_path) &&
    Number.isInteger(row.width_px) &&
    row.width_px > 0 &&
    Number.isInteger(row.height_px) &&
    row.height_px > 0 &&
    hasText(row.alt_text_is) &&
    hasText(row.alt_text_en) &&
    photoRightsBases.has(row.rights_basis) &&
    hasText(row.license_reference) &&
    hasText(row.attribution_text) &&
    isOptionalHttpUrl(row.source_url) &&
    isOptionalHttpUrl(row.license_url) &&
    isOptionalHttpUrl(row.attribution_url)
  );
}

function mapAccessFacts(row: ProfileRow): PublishedAccessFacts {
  const dogEligibility = parseDogEligibility(row.dog_eligibility);
  const availabilityWindow = parseAvailabilityWindow(row.availability_window);
  const accessInformationUrls = parseUrlList(row.access_information_urls);
  if (!dogEligibility || !availabilityWindow || !accessInformationUrls) {
    throw new Error('Invalid access facts reached mapper');
  }
  return {
    id: row.access_condition_id,
    accessArea: row.access_area as AccessArea,
    accessAreaNote: publicVisitorNote(row.access_area_note),
    restraintCondition: row.restraint_condition as RestraintCondition,
    restraintNote: publicVisitorNote(row.restraint_note),
    dogEligibility,
    availabilityWindow,
    availabilityState: row.availability_state as AvailabilityState,
    permissionRequirement: row.permission_requirement as PermissionRequirement,
    accessInformationUrls: []
  };
}

function publicVisitorNote(value: string | null): string | null {
  if (value === null) return null;
  const note = value.trim();
  if (note.length === 0) return null;
  if (
    /https?:\/\//i.test(note) ||
    /\b(?:arcgis|moderator|reconfirm(?:ation)?|evidence source|postal code|verification (?:due|state|status))\b/i.test(
      note
    )
  ) {
    return null;
  }
  return note;
}

function isListRowWithoutCoordinates(row: ListRow): boolean {
  const publicAccessConditions = parsePublishedAccessConditionSummaries(row.access_conditions);
  return (
    hasText(row.place_id) &&
    hasText(row.name) &&
    placeCategories.has(row.category) &&
    hasText(row.locality) &&
    Number.isInteger(row.access_condition_count) &&
    row.access_condition_count > 0 &&
    publicAccessConditions !== null &&
    publicAccessConditions.length === row.access_condition_count &&
    typeof row.simple_access_summary === 'boolean' &&
    (row.access_condition_count === 1
      ? accessAreas.has(row.access_area ?? '') &&
        restraintConditions.has(row.restraint_condition ?? '') &&
        permissionRequirements.has(row.permission_requirement ?? '') &&
        publicAccessConditions[0]?.accessArea === row.access_area &&
        publicAccessConditions[0]?.restraintCondition === row.restraint_condition &&
        publicAccessConditions[0]?.permissionRequirement === row.permission_requirement
      : row.access_area === null &&
        row.restraint_condition === null &&
        row.permission_requirement === null) &&
    true
  );
}

function parsePublishedAccessConditionSummaries(
  value: Json
): PublishedAccessConditionSummary[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const parsed: PublishedAccessConditionSummary[] = [];
  for (const condition of value) {
    if (
      !isJsonObject(condition) ||
      !hasOnlyKeys(condition, publishedAccessConditionSummaryKeys) ||
      typeof condition.accessArea !== 'string' ||
      !accessAreas.has(condition.accessArea) ||
      typeof condition.restraintCondition !== 'string' ||
      !restraintConditions.has(condition.restraintCondition) ||
      typeof condition.permissionRequirement !== 'string' ||
      !permissionRequirements.has(condition.permissionRequirement) ||
      typeof condition.dogEligibilityState !== 'string' ||
      !dogEligibilitySummaryStates.has(condition.dogEligibilityState) ||
      typeof condition.availabilityState !== 'string' ||
      !availabilityStates.has(condition.availabilityState)
    ) {
      return null;
    }

    parsed.push({
      accessArea: condition.accessArea as AccessArea,
      restraintCondition: condition.restraintCondition as RestraintCondition,
      permissionRequirement: condition.permissionRequirement as PermissionRequirement,
      dogEligibilityState:
        condition.dogEligibilityState as PublishedAccessConditionSummary['dogEligibilityState'],
      availabilityState: condition.availabilityState as AvailabilityState
    });
  }
  return parsed;
}

function hasValidCoordinates(row: ListRow): boolean {
  return isLatitude(row.latitude) && isLongitude(row.longitude);
}

function isProfileRow(row: ProfileRow): boolean {
  return (
    hasText(row.place_id) &&
    hasText(row.name) &&
    hasText(row.description) &&
    placeCategories.has(row.category) &&
    hasText(row.address_line) &&
    hasText(row.locality) &&
    /^\d{3}$/.test(row.postal_code) &&
    isLatitude(row.latitude) &&
    isLongitude(row.longitude) &&
    isOptionalText(row.website_url) &&
    isOptionalText(row.phone) &&
    isJsonObject(row.opening_hours) &&
    isStringArray(row.dog_amenities) &&
    hasText(row.access_condition_id) &&
    accessAreas.has(row.access_area) &&
    isOptionalText(row.access_area_note) &&
    restraintConditions.has(row.restraint_condition) &&
    isOptionalText(row.restraint_note) &&
    parseDogEligibility(row.dog_eligibility) !== null &&
    parseAvailabilityWindow(row.availability_window) !== null &&
    availabilityStates.has(row.availability_state) &&
    permissionRequirements.has(row.permission_requirement) &&
    parseUrlList(row.access_information_urls) !== null
  );
}

function hasSameProfileIdentity(first: ProfileRow, row: ProfileRow): boolean {
  return (
    row.place_id === first.place_id &&
    row.name === first.name &&
    row.description === first.description &&
    row.category === first.category &&
    row.address_line === first.address_line &&
    row.locality === first.locality &&
    row.postal_code === first.postal_code &&
    row.latitude === first.latitude &&
    row.longitude === first.longitude &&
    row.website_url === first.website_url &&
    row.phone === first.phone &&
    JSON.stringify(row.opening_hours) === JSON.stringify(first.opening_hours) &&
    JSON.stringify(row.dog_amenities) === JSON.stringify(first.dog_amenities)
  );
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalText(value: unknown): value is string | null {
  return value === null || hasText(value);
}

function isOptionalHttpUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (!hasText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: Json): value is string[] {
  return Array.isArray(value) && value.every(hasText);
}

function parseUrlList(value: Json): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !isUrl(item)) return null;
    urls.push(item);
  }
  return [...new Set(urls)];
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function hasOnlyKeys(
  value: { [key: string]: Json | undefined },
  allowed: ReadonlySet<string>
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

const placeCategories = new Set<string>([
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
const accessAreas = new Set<string>(['indoors', 'outdoors', 'designated_area', 'other_bounded']);
const restraintConditions = new Set<string>([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);
const permissionRequirements = new Set<string>([
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
]);
const photoRightsBases = new Set<string>([
  'explicit_permission',
  'cc0',
  'public_domain',
  'cc_by',
  'cc_by_sa',
  'official_reuse'
]);
const availabilityStates = new Set<string>(['whenever_open', 'limited', 'not_stated']);
const dogEligibilitySummaryStates = new Set<string>([
  'all_dogs',
  'small_dogs_only',
  'special',
  'not_stated'
]);
const publishedAccessConditionSummaryKeys = new Set([
  'accessArea',
  'restraintCondition',
  'permissionRequirement',
  'dogEligibilityState',
  'availabilityState'
]);
