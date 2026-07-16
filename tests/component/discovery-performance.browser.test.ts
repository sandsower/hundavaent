import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import { clusterMapPlaces } from '$lib/discovery/clusters';
import { filterPublishedPlaces } from '$lib/discovery/filter';
import { defaultDiscoveryFilters } from '$lib/discovery/state';
import type { PublishedPlaceSummary } from '$server/discovery/public-places';

const representativePlaces: PublishedPlaceSummary[] = Array.from({ length: 500 }, (_, index) => ({
  placeId: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: index % 2 === 0 ? `Kaffi ${index}` : `Garður ${index}`,
  category: index % 2 === 0 ? ('cafe' as const) : ('park' as const),
  locality: index % 3 === 0 ? 'Reykjavík' : index % 3 === 1 ? 'Kópavogur' : 'Hafnarfjörður',
  latitude: 64.08 + (index % 25) * 0.004,
  longitude: -22.02 + (index % 20) * 0.012,
  accessConditionCount: 1,
  simpleAccessSummary: true,
  accessArea: index % 2 === 0 ? ('indoors' as const) : ('outdoors' as const),
  restraintCondition: 'leash_required' as const,
  permissionRequirement: 'standing_permission' as const,
  accessConditions: [
    {
      accessArea: index % 2 === 0 ? ('indoors' as const) : ('outdoors' as const),
      restraintCondition: 'leash_required' as const,
      permissionRequirement: 'standing_permission' as const
    }
  ],
  primaryPhoto: null
}));

describe('representative capital-region discovery budget', () => {
  it('filters 500 verified Place summaries within the 50 ms browser budget', () => {
    const durations: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const startedAt = performance.now();
      const result = filterPublishedPlaces(
        representativePlaces,
        {
          ...defaultDiscoveryFilters,
          query: 'kaffi reykjavik',
          category: 'food_drink',
          area: 'Reykjavík',
          accessArea: 'indoors'
        },
        catalogues.is
      );
      durations.push(performance.now() - startedAt);
      expect(result.length).toBeGreaterThan(0);
    }

    durations.sort((left, right) => left - right);
    expect(durations[Math.floor(durations.length * 0.95)]).toBeLessThanOrEqual(50);
  });

  it('reduces representative initial marker density below the 150-element budget', () => {
    const clusters = clusterMapPlaces(representativePlaces, 9, null);
    expect(clusters.length).toBeLessThanOrEqual(150);
    expect(clusters.flatMap((cluster) => cluster.placeIds)).toHaveLength(500);
  });
});
