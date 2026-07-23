import type { AccessArea, PermissionRequirement, RestraintCondition } from '$domain/access';
import type { EvidenceKind } from '$domain/evidence';
import type { PlaceCategory } from '$domain/place';
import type { Catalogue, MessageKey } from '$i18n';

export const accessAreaMessageKeys: Record<AccessArea, MessageKey> = {
  indoors: 'access.indoor',
  outdoors: 'access.outdoor',
  designated_area: 'access.designated',
  other_bounded: 'access.otherBounded'
};

export const restraintMessageKeys: Record<RestraintCondition, MessageKey> = {
  leash_required: 'access.leashRequired',
  off_leash_permitted: 'access.offLeash',
  carrier_required: 'access.carrierRequired',
  other_sourced: 'access.otherSourced'
};

export const permissionMessageKeys: Record<PermissionRequirement, MessageKey> = {
  standing_permission: 'access.standingPermission',
  ask_on_arrival: 'access.askOnArrival',
  advance_approval: 'access.advanceApproval'
};

export const evidenceMessageKeys: Record<EvidenceKind, MessageKey> = {
  official_website: 'evidence.officialWebsite',
  venue_representative: 'evidence.venueRepresentative',
  member_report: 'evidence.memberReport',
  direct_observation: 'evidence.directObservation',
  public_record: 'evidence.publicRecord',
  other: 'evidence.other'
};

export const placeCategoryMessageKeys: Record<PlaceCategory, MessageKey> = {
  restaurant: 'category.restaurant',
  cafe: 'category.cafe',
  bar: 'category.bar',
  shop: 'category.shop',
  shopping_centre: 'category.shoppingCentre',
  accommodation: 'category.accommodation',
  park: 'category.park',
  recreation: 'category.recreation',
  culture: 'category.culture',
  service: 'category.service',
  other: 'category.other'
};

export const placeFieldMessageKeys: Readonly<Record<string, MessageKey>> = {
  name: 'placeField.name',
  description: 'placeField.description',
  website_url: 'placeField.websiteUrl',
  phone: 'placeField.phone',
  opening_hours: 'placeField.openingHours',
  dog_amenities: 'placeField.dogAmenities'
};

export const reportReasonMessageKeys: Readonly<Record<string, MessageKey>> = {
  inaccurate: 'reportReason.inaccurate',
  unsafe: 'reportReason.unsafe',
  misleading: 'reportReason.misleading',
  obsolete: 'reportReason.obsolete',
  closed: 'reportReason.closed',
  moved: 'reportReason.moved',
  successor_place: 'reportReason.successorPlace'
};

export function localizePlaceField(value: string, copy: Catalogue): string {
  const messageKey = placeFieldMessageKeys[value];
  return messageKey ? copy[messageKey] : value;
}

export function localizeReportReason(value: string, copy: Catalogue): string {
  const messageKey = reportReasonMessageKeys[value];
  return messageKey ? copy[messageKey] : value;
}

const openingHoursMessageKeys: Readonly<Record<string, MessageKey>> = {
  monday: 'hours.monday',
  tuesday: 'hours.tuesday',
  wednesday: 'hours.wednesday',
  thursday: 'hours.thursday',
  friday: 'hours.friday',
  saturday: 'hours.saturday',
  sunday: 'hours.sunday'
};

const amenityMessageKeys: Readonly<Record<string, MessageKey>> = {
  water_bowl: 'amenity.waterBowl'
};

export function localizeAccessArea(value: AccessArea, copy: Catalogue): string {
  return copy[accessAreaMessageKeys[value]];
}

export function localizeRestraint(value: RestraintCondition, copy: Catalogue): string {
  return copy[restraintMessageKeys[value]];
}

export function localizePermission(value: PermissionRequirement, copy: Catalogue): string {
  return copy[permissionMessageKeys[value]];
}

export function localizeEvidenceKind(value: EvidenceKind, copy: Catalogue): string {
  return copy[evidenceMessageKeys[value]];
}

export function localizePlaceCategory(value: PlaceCategory, copy: Catalogue): string {
  return copy[placeCategoryMessageKeys[value]];
}

const weekdayOrder = Object.keys(openingHoursMessageKeys);

export interface OpeningHoursRow {
  key: string;
  text: string;
}

// Stored opening-hours objects carry no reliable key order, so presentation
// re-establishes the Monday-to-Sunday week before any free-text entries.
function orderedOpeningHoursEntries(
  value: Readonly<Record<string, unknown>>
): [string, unknown][] {
  return Object.entries(value).toSorted(([a], [b]) => {
    const aIndex = weekdayOrder.indexOf(a);
    const bIndex = weekdayOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function formatOpeningHoursRows(
  value: Readonly<Record<string, unknown>>,
  copy: Catalogue
): OpeningHoursRow[] {
  return orderedOpeningHoursEntries(value).map(([key, item]) => {
    const messageKey = openingHoursMessageKeys[key];
    const label = messageKey ? copy[messageKey] : key;
    return { key, text: `${label}: ${formatStructuredValue(item)}` };
  });
}

export function formatOpeningHours(
  value: Readonly<Record<string, unknown>>,
  copy: Catalogue,
  fallback: string
): string {
  if (Object.keys(value).length === 0) return fallback;
  return formatOpeningHoursRows(value, copy)
    .map((row) => row.text)
    .join(' · ');
}

export function formatDogAmenities(values: readonly string[], copy: Catalogue): string {
  return values
    .map((value) => {
      const messageKey = amenityMessageKeys[value];
      return messageKey ? copy[messageKey] : value;
    })
    .join(', ');
}

function formatStructuredValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatStructuredValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
