import { describe, expect, it } from 'vitest';

import { clusterMapPlaces, isTerminalMapCluster } from '$lib/discovery/clusters';

const places = [
  { placeId: 'a', name: 'A', latitude: 64.1466, longitude: -21.9426 },
  { placeId: 'b', name: 'B', latitude: 64.14661, longitude: -21.94261 },
  { placeId: 'c', name: 'C', latitude: 64.1, longitude: -21.8 }
];

describe('map marker clustering', () => {
  it('clusters nearby Places at capital-region zoom', () => {
    const clusters = clusterMapPlaces(places, 11, null);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((cluster) => cluster.placeIds.includes('a'))?.placeIds).toEqual([
      'a',
      'b'
    ]);
  });

  it('keeps the selected Place individually addressable', () => {
    const clusters = clusterMapPlaces(places, 11, 'a');
    expect(clusters.find((cluster) => cluster.placeIds.includes('a'))?.placeIds).toEqual(['a']);
  });

  it('separates markers as zoom increases', () => {
    const separated = clusterMapPlaces(
      [places[0], { ...places[1], latitude: 64.1476, longitude: -21.9436 }],
      18,
      null
    );
    expect(separated).toHaveLength(2);
  });

  it('recognizes a cluster that cannot separate at the maximum interactive zoom', () => {
    expect(isTerminalMapCluster([places[0], places[1]], 18)).toBe(true);
    expect(
      isTerminalMapCluster(
        [places[0], { ...places[1], latitude: 64.1476, longitude: -21.9436 }],
        18
      )
    ).toBe(false);
  });
});
