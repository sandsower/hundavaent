import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import {
  filterPublishedPlaces,
  haversineDistanceKm,
  launchCategoryFor,
  normalizeSearchText,
  reconcileSelectedPlace
} from '$lib/discovery/filter';
import { defaultDiscoveryFilters } from '$lib/discovery/state';
import type { PublishedPlaceSummary } from '$server/discovery/public-places';

const places: PublishedPlaceSummary[] = [
  {
    placeId: '30000000-0000-4000-8000-000000000001',
    name: 'Kaffi Hið Íslenska',
    category: 'cafe',
    locality: 'Reykjavík',
    latitude: 64.1466,
    longitude: -21.9426,
    accessConditionCount: 1,
    simpleAccessSummary: true,
    accessArea: 'indoors',
    restraintCondition: 'leash_required',
    permissionRequirement: 'ask_on_arrival',
    accessConditions: [
      {
        accessArea: 'indoors',
        restraintCondition: 'leash_required',
        permissionRequirement: 'ask_on_arrival'
      }
    ]
  },
  {
    placeId: '30000000-0000-4000-8000-000000000002',
    name: 'Elliðaárdalur',
    category: 'park',
    locality: 'Reykjavík',
    latitude: 64.119,
    longitude: -21.845,
    accessConditionCount: 1,
    simpleAccessSummary: true,
    accessArea: 'designated_area',
    restraintCondition: 'off_leash_permitted',
    permissionRequirement: 'standing_permission',
    accessConditions: [
      {
        accessArea: 'designated_area',
        restraintCondition: 'off_leash_permitted',
        permissionRequirement: 'standing_permission'
      }
    ]
  },
  {
    placeId: '30000000-0000-4000-8000-000000000003',
    name: 'Menningarhúsið',
    category: 'culture',
    locality: 'Kópavogur',
    latitude: 64.111,
    longitude: -21.907,
    accessConditionCount: 1,
    simpleAccessSummary: true,
    accessArea: 'outdoors',
    restraintCondition: 'leash_required',
    permissionRequirement: 'advance_approval',
    accessConditions: [
      {
        accessArea: 'outdoors',
        restraintCondition: 'leash_required',
        permissionRequirement: 'advance_approval'
      }
    ]
  }
];

describe('discovery filtering', () => {
  it('normalizes Icelandic accents, case, and whitespace', () => {
    expect(normalizeSearchText('  Hið ÍSLENSKA  ')).toBe('hið islenska');
  });

  it('maps only launch taxonomy categories into filter groups', () => {
    expect(launchCategoryFor('restaurant')).toBe('food_drink');
    expect(launchCategoryFor('shopping_centre')).toBe('shopping');
    expect(launchCategoryFor('recreation')).toBe('outdoors');
    expect(launchCategoryFor('accommodation')).toBe('accommodation');
    expect(launchCategoryFor('culture')).toBe('public_cultural');
    expect(launchCategoryFor('service')).toBeNull();
    expect(launchCategoryFor('other')).toBeNull();
  });

  it('matches localized name and structured labels accent-insensitively', () => {
    expect(
      filterPublishedPlaces(
        places,
        { ...defaultDiscoveryFilters, query: 'islenska innandyra' },
        catalogues.is
      ).map((place) => place.placeId)
    ).toEqual([places[0].placeId]);
    expect(
      filterPublishedPlaces(
        places,
        { ...defaultDiscoveryFilters, query: 'food drink reykjavik' },
        catalogues.en
      ).map((place) => place.placeId)
    ).toEqual([places[0].placeId]);
  });

  it('combines category, area, access, restraint, and permission filters', () => {
    expect(
      filterPublishedPlaces(
        places,
        {
          ...defaultDiscoveryFilters,
          category: 'outdoors',
          area: 'Reykjavík',
          accessArea: 'designated_area',
          restraintCondition: 'off_leash_permitted',
          permissionRequirement: 'standing_permission'
        },
        catalogues.en
      )
    ).toEqual([places[1]]);
  });

  it('matches only verified dimension combinations of a multi-condition Place', () => {
    const multiConditionPlace: PublishedPlaceSummary = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000004',
      name: 'Mixed Access Place',
      accessConditionCount: 2,
      simpleAccessSummary: false,
      accessArea: null,
      restraintCondition: null,
      permissionRequirement: null,
      accessConditions: [
        {
          accessArea: 'indoors',
          restraintCondition: 'carrier_required',
          permissionRequirement: 'standing_permission'
        },
        {
          accessArea: 'outdoors',
          restraintCondition: 'leash_required',
          permissionRequirement: 'ask_on_arrival'
        }
      ]
    };

    for (const filters of [
      { accessArea: 'indoors' as const },
      { restraintCondition: 'carrier_required' as const },
      { permissionRequirement: 'ask_on_arrival' as const }
    ]) {
      expect(
        filterPublishedPlaces(
          [multiConditionPlace],
          { ...defaultDiscoveryFilters, ...filters },
          catalogues.en
        )
      ).toEqual([multiConditionPlace]);
    }

    expect(
      filterPublishedPlaces(
        [multiConditionPlace],
        {
          ...defaultDiscoveryFilters,
          accessArea: 'indoors',
          restraintCondition: 'carrier_required',
          permissionRequirement: 'standing_permission'
        },
        catalogues.en
      )
    ).toEqual([multiConditionPlace]);
    expect(
      filterPublishedPlaces(
        [multiConditionPlace],
        {
          ...defaultDiscoveryFilters,
          accessArea: 'indoors',
          restraintCondition: 'leash_required'
        },
        catalogues.en
      )
    ).toEqual([]);

    expect(
      filterPublishedPlaces(
        [multiConditionPlace],
        { ...defaultDiscoveryFilters, query: 'indoors carrier generally allowed' },
        catalogues.en
      )
    ).toEqual([multiConditionPlace]);
    expect(
      filterPublishedPlaces(
        [multiConditionPlace],
        { ...defaultDiscoveryFilters, query: 'indoors carrier ask on arrival' },
        catalogues.en
      )
    ).toEqual([]);
    expect(
      filterPublishedPlaces(
        [multiConditionPlace],
        { ...defaultDiscoveryFilters, query: 'innandyra burðartösku almennt leyfðir' },
        catalogues.is
      )
    ).toEqual([multiConditionPlace]);
    expect(
      filterPublishedPlaces(
        [multiConditionPlace],
        { ...defaultDiscoveryFilters, query: 'innandyra burðartösku spyrja við komu' },
        catalogues.is
      )
    ).toEqual([]);
  });

  it('uses Haversine distance only when both origin and distance are available', () => {
    const origin = { latitude: 64.1466, longitude: -21.9426 };
    expect(haversineDistanceKm(origin, origin)).toBe(0);
    expect(
      filterPublishedPlaces(
        places,
        { ...defaultDiscoveryFilters, distanceKm: 3 },
        catalogues.en,
        origin
      ).map((place) => place.placeId)
    ).toEqual([places[0].placeId]);
    expect(
      filterPublishedPlaces(places, { ...defaultDiscoveryFilters, distanceKm: 3 }, catalogues.en)
    ).toEqual(places);
  });

  it('clears a stale or filtered selected Place', () => {
    expect(reconcileSelectedPlace(places[0].placeId, [places[1]])).toBeNull();
    expect(reconcileSelectedPlace(places[1].placeId, [places[1]])).toBe(places[1].placeId);
  });

  it('filters a representative 500-Place set deterministically', () => {
    const representative = Array.from({ length: 500 }, (_, index) => ({
      ...places[index % places.length],
      placeId: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Place ${index}`
    }));

    const result = filterPublishedPlaces(
      representative,
      { ...defaultDiscoveryFilters, category: 'outdoors', area: 'Reykjavík' },
      catalogues.en
    );

    expect(result).toHaveLength(167);
    expect(result.every((place) => place.category === 'park')).toBe(true);
  });
});
