import type { PlaceCategory } from '$domain/place';
import type { Catalogue, MessageKey } from '$i18n';
import type { PublishedPlaceSummary } from '$server/discovery/public-places';

import type { DiscoveryCategory, DiscoveryFilters } from './state';

export interface GeographicPoint {
  latitude: number;
  longitude: number;
}

export function filterPublishedPlaces(
  places: readonly PublishedPlaceSummary[],
  filters: DiscoveryFilters,
  copy: Catalogue,
  origin: GeographicPoint | null = null
): PublishedPlaceSummary[] {
  const queryTokens = normalizeSearchText(filters.query).split(' ').filter(Boolean);

  return places.filter((place) => {
    if (filters.category && launchCategoryFor(place.category) !== filters.category) return false;
    if (filters.area && place.locality !== filters.area) return false;
    if (
      (filters.accessArea || filters.restraintCondition || filters.permissionRequirement) &&
      !place.accessConditions.some(
        (condition) =>
          (!filters.accessArea || condition.accessArea === filters.accessArea) &&
          (!filters.restraintCondition ||
            condition.restraintCondition === filters.restraintCondition) &&
          (!filters.permissionRequirement ||
            condition.permissionRequirement === filters.permissionRequirement)
      )
    ) {
      return false;
    }
    if (filters.distanceKm && origin && haversineDistanceKm(origin, place) > filters.distanceKm) {
      return false;
    }
    if (queryTokens.length > 0) {
      const documents = searchDocuments(place, copy);
      if (!documents.some((document) => queryTokens.every((token) => document.includes(token)))) {
        return false;
      }
    }

    return true;
  });
}

export function launchCategoryFor(category: PlaceCategory): DiscoveryCategory | null {
  switch (category) {
    case 'restaurant':
    case 'cafe':
    case 'bar':
      return 'food_drink';
    case 'shop':
    case 'shopping_centre':
      return 'shopping';
    case 'park':
    case 'recreation':
      return 'outdoors';
    case 'accommodation':
      return 'accommodation';
    case 'culture':
      return 'public_cultural';
    case 'service':
    case 'other':
      return null;
  }
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('is')
    .trim()
    .replace(/\s+/g, ' ');
}

export function haversineDistanceKm(a: GeographicPoint, b: GeographicPoint): number {
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function reconcileSelectedPlace(
  selectedPlaceId: string | null,
  places: readonly PublishedPlaceSummary[]
): string | null {
  return selectedPlaceId && places.some((place) => place.placeId === selectedPlaceId)
    ? selectedPlaceId
    : null;
}

export function availableAreas(places: readonly PublishedPlaceSummary[]): string[] {
  return [...new Set(places.map((place) => place.locality))].sort((left, right) =>
    left.localeCompare(right, 'is')
  );
}

function searchDocuments(place: PublishedPlaceSummary, copy: Catalogue): string[] {
  const launchCategory = launchCategoryFor(place.category);
  const generalKeys = [
    categoryKeys[place.category],
    ...(launchCategory ? [launchCategoryKeys[launchCategory]] : [])
  ];
  const generalTerms = [place.name, place.locality, ...generalKeys.map((key) => copy[key])];

  return place.accessConditions.map((condition) =>
    normalizeSearchText(
      [
        ...generalTerms,
        copy[accessAreaKeys[condition.accessArea]],
        copy[restraintKeys[condition.restraintCondition]],
        copy[permissionKeys[condition.permissionRequirement]]
      ].join(' ')
    )
  );
}

const categoryKeys: Record<PlaceCategory, MessageKey> = {
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
const launchCategoryKeys: Record<DiscoveryCategory, MessageKey> = {
  food_drink: 'directory.categoryFoodDrink',
  shopping: 'directory.categoryShopping',
  outdoors: 'directory.categoryOutdoors',
  accommodation: 'directory.categoryAccommodation',
  public_cultural: 'directory.categoryPublicCultural'
};
const accessAreaKeys = {
  indoors: 'access.indoor',
  outdoors: 'access.outdoor',
  designated_area: 'access.designated',
  other_bounded: 'access.otherBounded'
} as const satisfies Record<NonNullable<PublishedPlaceSummary['accessArea']>, MessageKey>;
const restraintKeys = {
  leash_required: 'access.leashRequired',
  off_leash_permitted: 'access.offLeash',
  carrier_required: 'access.carrierRequired',
  other_sourced: 'access.otherSourced'
} as const satisfies Record<NonNullable<PublishedPlaceSummary['restraintCondition']>, MessageKey>;
const permissionKeys = {
  standing_permission: 'access.standingPermission',
  ask_on_arrival: 'access.askOnArrival',
  advance_approval: 'access.advanceApproval'
} as const satisfies Record<
  NonNullable<PublishedPlaceSummary['permissionRequirement']>,
  MessageKey
>;
const earthRadiusKm = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
