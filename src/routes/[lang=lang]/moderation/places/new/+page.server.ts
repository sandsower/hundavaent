import { fail } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import type { PlaceCategory } from '$domain/place';
import { parseAvailabilityWindow, parseDogEligibility } from '$domain/access-schema';
import type { Json } from '$server/db/generated.types';
import {
  createCandidatePlace,
  type CandidatePlaceCommand
} from '$server/moderation/place-moderation';

import type { Actions, PageServerLoad } from './$types';

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
const accessAreasAllowed = new Set(['indoors', 'outdoors', 'designated_area', 'other_bounded']);
const restraintsAllowed = new Set([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);
const permissionsAllowed = new Set(['standing_permission', 'ask_on_arrival', 'advance_approval']);
const availabilityStatesAllowed = new Set(['whenever_open', 'limited', 'not_stated']);
const evidenceKindsAllowed = new Set([
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
]);
const geometryPrecisionsAllowed = new Set([
  'moderator_confirmed_point',
  'official_address_point',
  'official_representative_centroid',
  'municipality_anchor_pending_geocode'
]);

export const load: PageServerLoad = () => ({
  defaultObservedAt: new Date().toISOString().slice(0, 16)
});

export const actions: Actions = {
  default: async ({ locals, params, request }) => {
    const lang = parseLocale(params.lang);
    const copy = catalogues[lang];
    const values = readValues(await request.formData());
    const command = toCommand(values);

    if (!command) {
      return fail(400, {
        success: false,
        error: copy['moderation.incomplete'],
        values: snapshotValues(values)
      });
    }

    if (!locals.supabase) {
      return fail(503, {
        success: false,
        error: copy['error.unexpectedBody'],
        values: snapshotValues(values)
      });
    }

    const result = await createCandidatePlace(locals.supabase, command, locals.requestId);

    if (result.status === 'success') {
      return {
        success: true,
        placeId: result.value.placeId,
        version: result.value.version
      };
    }

    const status =
      result.status === 'validation_error'
        ? 400
        : result.status === 'forbidden'
          ? 403
          : result.status === 'conflict'
            ? 409
            : 503;
    const errorMessage =
      result.status === 'forbidden'
        ? copy['moderation.unauthorized']
        : result.status === 'conflict'
          ? copy['moderation.versionConflict']
          : result.status === 'infrastructure_error'
            ? copy['error.unexpectedBody']
            : copy['moderation.incomplete'];

    return fail(status, {
      success: false,
      error: errorMessage,
      values: snapshotValues(values)
    });
  }
};

interface CandidateFormValues extends Record<string, string> {
  operatorName: string;
  category: string;
  websiteUrl: string;
  phone: string;
  nameIs: string;
  descriptionIs: string;
  nameEn: string;
  descriptionEn: string;
  addressLine: string;
  locality: string;
  postalCode: string;
  municipality: string;
  latitude: string;
  longitude: string;
  geometryPrecision: string;
  geometrySource: string;
  evidenceKinds: string;
  evidenceUrls: string;
  evidenceCitations: string;
  evidenceSourceLabels: string;
  evidenceObservedAts: string;
  accessArea: string;
  restraintCondition: string;
  permissionRequirement: string;
  accessAreas: string;
  restraintConditions: string;
  permissionRequirements: string;
  accessAreaNotes: string;
  restraintNotes: string;
  maximumWeights: string;
  maximumDogs: string;
  eligibilityNotes: string;
  availabilityDays: string;
  availabilityStartsAt: string;
  availabilityEndsAt: string;
  availabilityStartsOn: string;
  availabilityEndsOn: string;
  availabilityStates: string;
  dogAmenities: string;
}

function readValues(formData: FormData): CandidateFormValues {
  const value = (name: string) => String(formData.get(name) ?? '').trim();
  const values = (name: string) =>
    formData
      .getAll(name)
      .map((item) => String(item).trim())
      .join('\u001f');

  return {
    operatorName: value('operatorName'),
    category: value('category'),
    websiteUrl: value('websiteUrl'),
    phone: value('phone'),
    nameIs: value('nameIs'),
    descriptionIs: value('descriptionIs'),
    nameEn: value('nameEn'),
    descriptionEn: value('descriptionEn'),
    addressLine: value('addressLine'),
    locality: value('locality'),
    postalCode: value('postalCode'),
    municipality: value('municipality'),
    latitude: value('latitude'),
    longitude: value('longitude'),
    geometryPrecision: value('geometryPrecision'),
    geometrySource: value('geometrySource'),
    evidenceKinds: values('evidenceKind'),
    evidenceUrls: values('evidenceUrl'),
    evidenceCitations: values('evidenceCitation'),
    evidenceSourceLabels: values('evidenceSourceLabel'),
    evidenceObservedAts: values('evidenceObservedAt'),
    accessArea: value('accessArea'),
    restraintCondition: value('restraintCondition'),
    permissionRequirement: value('permissionRequirement'),
    accessAreas: values('accessArea'),
    restraintConditions: values('restraintCondition'),
    permissionRequirements: values('permissionRequirement'),
    accessAreaNotes: values('accessAreaNote'),
    restraintNotes: values('restraintNote'),
    maximumWeights: values('maximumWeightKg'),
    maximumDogs: values('maximumDogs'),
    eligibilityNotes: values('eligibilityNotes'),
    availabilityDays: values('availabilityDays'),
    availabilityStartsAt: values('availabilityStartsAt'),
    availabilityEndsAt: values('availabilityEndsAt'),
    availabilityStartsOn: values('availabilityStartsOn'),
    availabilityEndsOn: values('availabilityEndsOn'),
    availabilityStates: values('availabilityState'),
    dogAmenities: value('dogAmenities')
  };
}

function snapshotValues(values: CandidateFormValues): Record<string, string> {
  return values;
}

function toCommand(values: CandidateFormValues): CandidatePlaceCommand | null {
  const split = (value: string) => value.split('\u001f');
  const accessAreas = split(values.accessAreas);
  const restraints = split(values.restraintConditions);
  const permissions = split(values.permissionRequirements);
  const availabilityStates = split(values.availabilityStates);
  const evidenceKinds = split(values.evidenceKinds);
  const evidenceUrls = split(values.evidenceUrls);
  const evidenceCitations = split(values.evidenceCitations);
  const evidenceSourceLabels = split(values.evidenceSourceLabels);
  const evidenceObservedAts = split(values.evidenceObservedAts);
  if (
    accessAreas.length === 0 ||
    restraints.length !== accessAreas.length ||
    permissions.length !== accessAreas.length ||
    availabilityStates.length !== accessAreas.length ||
    evidenceKinds.length === 0 ||
    evidenceUrls.length !== evidenceKinds.length ||
    evidenceCitations.length !== evidenceKinds.length ||
    evidenceSourceLabels.length !== evidenceKinds.length ||
    evidenceObservedAts.length !== evidenceKinds.length
  )
    return null;

  const at = (value: string, index: number) => split(value)[index] ?? '';
  const accessConditions: CandidatePlaceCommand['access_conditions'] = [];
  for (let index = 0; index < accessAreas.length; index += 1) {
    const accessArea = accessAreas[index];
    const restraint = restraints[index];
    const permission = permissions[index];
    const availabilityState = availabilityStates[index];
    if (
      !accessAreasAllowed.has(accessArea) ||
      !restraintsAllowed.has(restraint) ||
      !permissionsAllowed.has(permission) ||
      !availabilityStatesAllowed.has(availabilityState)
    )
      return null;
    const maximumWeight = at(values.maximumWeights, index);
    const maximumDogCount = at(values.maximumDogs, index);
    const days = at(values.availabilityDays, index)
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean)
      .map(Number);
    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return null;
    const eligibilityNotes = at(values.eligibilityNotes, index);
    const dogEligibility: Record<string, Json> =
      maximumWeight || maximumDogCount || eligibilityNotes
        ? {
            scope: 'restricted',
            ...(maximumWeight ? { maximumWeightKg: Number(maximumWeight) } : {}),
            ...(maximumDogCount ? { maximumDogs: Number(maximumDogCount) } : {}),
            ...(eligibilityNotes ? { notes: eligibilityNotes } : {})
          }
        : { scope: 'all_dogs' };
    const availabilityWindow: Record<string, Json> = {
      ...(days.length ? { days } : {}),
      ...(at(values.availabilityStartsAt, index)
        ? { startsAt: at(values.availabilityStartsAt, index) }
        : {}),
      ...(at(values.availabilityEndsAt, index)
        ? { endsAt: at(values.availabilityEndsAt, index) }
        : {}),
      ...(at(values.availabilityStartsOn, index)
        ? { startsOn: at(values.availabilityStartsOn, index) }
        : {}),
      ...(at(values.availabilityEndsOn, index)
        ? { endsOn: at(values.availabilityEndsOn, index) }
        : {})
    };
    if (
      parseDogEligibility(dogEligibility) === null ||
      parseAvailabilityWindow(availabilityWindow) === null ||
      (availabilityState === 'limited' && Object.keys(availabilityWindow).length === 0) ||
      (availabilityState !== 'limited' && Object.keys(availabilityWindow).length > 0)
    )
      return null;
    accessConditions.push({
      access_area: accessArea as CandidatePlaceCommand['access_conditions'][number]['access_area'],
      access_area_note: at(values.accessAreaNotes, index) || null,
      restraint_condition:
        restraint as CandidatePlaceCommand['access_conditions'][number]['restraint_condition'],
      restraint_note: at(values.restraintNotes, index) || null,
      dog_eligibility: dogEligibility,
      availability_window: availabilityWindow,
      availability_state:
        availabilityState as CandidatePlaceCommand['access_conditions'][number]['availability_state'],
      permission_requirement:
        permission as CandidatePlaceCommand['access_conditions'][number]['permission_requirement']
    });
  }
  const required = [
    values.operatorName,
    values.category,
    values.nameIs,
    values.descriptionIs,
    values.nameEn,
    values.descriptionEn,
    values.addressLine,
    values.locality,
    values.postalCode,
    values.municipality,
    values.latitude,
    values.longitude,
    values.geometryPrecision,
    values.geometrySource,
    values.accessArea,
    values.restraintCondition,
    values.permissionRequirement
  ];
  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);
  const evidenceRecords: CandidatePlaceCommand['evidence_records'] = [];
  for (let index = 0; index < evidenceKinds.length; index += 1) {
    const kind = evidenceKinds[index];
    const sourceUrl = evidenceUrls[index] ?? '';
    const sourceCitation = evidenceCitations[index] ?? '';
    const sourceLabel = evidenceSourceLabels[index] ?? '';
    const observedValue = evidenceObservedAts[index] ?? '';
    const observedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(observedValue)
      ? `${observedValue}:00.000Z`
      : '';
    if (
      !evidenceKindsAllowed.has(kind) ||
      (!sourceUrl && !sourceCitation) ||
      !sourceLabel ||
      !observedAt
    )
      return null;
    evidenceRecords.push({
      kind: kind as CandidatePlaceCommand['evidence_records'][number]['kind'],
      source_url: sourceUrl || null,
      source_citation: sourceCitation || null,
      source_label: sourceLabel,
      observed_at: observedAt,
      source_metadata: {}
    });
  }

  if (
    required.some((value) => !value) ||
    !placeCategories.has(values.category as PlaceCategory) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !geometryPrecisionsAllowed.has(values.geometryPrecision) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !/^\d{3}$/.test(values.postalCode)
  ) {
    return null;
  }

  return {
    operator: { name: values.operatorName },
    location: {
      address_line: values.addressLine,
      locality: values.locality,
      postal_code: values.postalCode,
      municipality: values.municipality,
      latitude,
      longitude,
      geometry_precision:
        values.geometryPrecision as CandidatePlaceCommand['location']['geometry_precision'],
      geometry_source: values.geometrySource
    },
    category: values.category as PlaceCategory,
    website_url: values.websiteUrl || null,
    phone: values.phone || null,
    opening_hours: {},
    translations: {
      is: { name: values.nameIs, description: values.descriptionIs },
      en: { name: values.nameEn, description: values.descriptionEn }
    },
    evidence_records: evidenceRecords,
    dog_amenities: values.dogAmenities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    access_conditions: accessConditions
  };
}
