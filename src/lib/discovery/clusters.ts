import type { MapPlace } from '$lib/map/types';

export interface MapPlaceCluster {
  id: string;
  placeIds: string[];
  latitude: number;
  longitude: number;
}

interface WorkingCluster extends MapPlaceCluster {
  x: number;
  y: number;
}

export function clusterMapPlaces(
  places: readonly MapPlace[],
  zoom: number,
  selectedPlaceId: string | null,
  radiusPixels = 72
): MapPlaceCluster[] {
  const ordered = [...places].sort((left, right) => left.placeId.localeCompare(right.placeId));
  const clusters: WorkingCluster[] = [];

  for (const place of ordered) {
    const point = project(place, zoom);
    const nearby =
      place.placeId === selectedPlaceId
        ? undefined
        : clusters.find(
            (cluster) =>
              !cluster.placeIds.includes(selectedPlaceId ?? '') &&
              Math.hypot(cluster.x - point.x, cluster.y - point.y) <= radiusPixels
          );

    if (!nearby) {
      clusters.push({
        id: place.placeId,
        placeIds: [place.placeId],
        latitude: place.latitude,
        longitude: place.longitude,
        x: point.x,
        y: point.y
      });
      continue;
    }

    const count = nearby.placeIds.length;
    nearby.placeIds.push(place.placeId);
    nearby.latitude = (nearby.latitude * count + place.latitude) / (count + 1);
    nearby.longitude = (nearby.longitude * count + place.longitude) / (count + 1);
    nearby.x = (nearby.x * count + point.x) / (count + 1);
    nearby.y = (nearby.y * count + point.y) / (count + 1);
    nearby.id = `cluster:${nearby.placeIds.join(':')}`;
  }

  return clusters.map((cluster) => ({
    id: cluster.id,
    placeIds: cluster.placeIds,
    latitude: cluster.latitude,
    longitude: cluster.longitude
  }));
}

export function isTerminalMapCluster(
  places: readonly MapPlace[],
  maximumInteractiveZoom: number,
  radiusPixels = 72
): boolean {
  if (places.length < 2) return false;
  const clusters = clusterMapPlaces(places, maximumInteractiveZoom, null, radiusPixels);
  return clusters.length === 1 && clusters[0].placeIds.length === places.length;
}

function project(place: MapPlace, zoom: number): { x: number; y: number } {
  const scale = 512 * 2 ** zoom;
  const sinLatitude = Math.sin(
    (Math.max(-85.051129, Math.min(85.051129, place.latitude)) * Math.PI) / 180
  );
  return {
    x: ((place.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
  };
}
