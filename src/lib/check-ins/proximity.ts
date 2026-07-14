import type { PlaceCategory } from '$domain/place';

// The approved proximity policy, implemented exactly as proposed and unit-tested here, ready for
// production activation once an operator approves the deployment policy.
export const POINT_RADIUS_METERS = 150;
export const POLYGON_BUFFER_METERS = 50;
export const OUTDOOR_FALLBACK_RADIUS_METERS = 300;
export const MAXIMUM_ACCURACY_METERS = 100;
export const MAXIMUM_STALENESS_MS = 30_000;

// Places in these categories use the outdoor fallback radius when no boundary polygon is present.
// No Place in the current schema carries a boundary polygon yet, so every current outdoor Place
// resolves through this 300m fallback.
const outdoorCategories = new Set<PlaceCategory>(['park', 'recreation']);

export type ProximityDecision = 'confirmed' | 'not_confirmed' | 'unknown';

export function isProximityDecision(value: unknown): value is ProximityDecision {
  return value === 'confirmed' || value === 'not_confirmed' || value === 'unknown';
}

export interface GeographicPoint {
  latitude: number;
  longitude: number;
}

// A simple closed ring of at least three points.
// The branch below is implemented and unit-tested ahead of future schema support for this data.
export interface PolygonBoundary {
  points: GeographicPoint[];
}

export interface ProximityPlace {
  category: PlaceCategory;
  location: GeographicPoint;
  boundary?: PolygonBoundary | null;
}

// A one-time geolocation reading. Callers must discard this value immediately after computing a
// decision -- it must never be assigned to state that outlives the synchronous decision call, and
// it must never be sent to the server, logged, or included in an error report.
export interface CoordinateReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  /** Epoch milliseconds, from the browser's `GeolocationPosition.timestamp`. */
  capturedAt: number;
}

const earthRadiusMeters = 6_371_000;

export function isReadingUsable(reading: CoordinateReading, now: number = Date.now()): boolean {
  if (
    !Number.isFinite(reading.accuracyMeters) ||
    reading.accuracyMeters > MAXIMUM_ACCURACY_METERS
  ) {
    return false;
  }
  return now - reading.capturedAt <= MAXIMUM_STALENESS_MS;
}

/**
 * Reduces a one-time geolocation reading to the tri-state proximity decision sent to the server.
 * A missing or unusable (stale or low-accuracy) reading always yields 'unknown' -- the same
 * outcome as never requesting location at all, so the caller never needs a separate error state
 * for it. An out-of-range reading yields 'not_confirmed' and never blocks the Check-in.
 */
export function decideProximity(
  place: ProximityPlace,
  reading: CoordinateReading | null,
  now: number = Date.now()
): ProximityDecision {
  if (!reading || !isReadingUsable(reading, now)) return 'unknown';
  return isWithinRange(place, reading) ? 'confirmed' : 'not_confirmed';
}

function isWithinRange(place: ProximityPlace, reading: CoordinateReading): boolean {
  if (place.boundary && place.boundary.points.length >= 3) {
    if (isPointInPolygon(reading, place.boundary.points)) return true;
    return distanceToPolygonMeters(reading, place.boundary.points) <= POLYGON_BUFFER_METERS;
  }

  const radius = outdoorCategories.has(place.category)
    ? OUTDOOR_FALLBACK_RADIUS_METERS
    : POINT_RADIUS_METERS;
  return distanceMeters(reading, place.location) <= radius;
}

/** Haversine great-circle distance in meters. */
export function distanceMeters(a: GeographicPoint, b: GeographicPoint): number {
  const latRadiansA = toRadians(a.latitude);
  const latRadiansB = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latRadiansA) * Math.cos(latRadiansB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Ray-casting point-in-polygon test, adequate for the small local extents Hundavænt covers. */
export function isPointInPolygon(point: GeographicPoint, ring: GeographicPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const vertexI = ring[i];
    const vertexJ = ring[j];
    const intersects =
      vertexI.latitude > point.latitude !== vertexJ.latitude > point.latitude &&
      point.longitude <
        ((vertexJ.longitude - vertexI.longitude) * (point.latitude - vertexI.latitude)) /
          (vertexJ.latitude - vertexI.latitude) +
          vertexI.longitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolygonMeters(point: GeographicPoint, ring: GeographicPoint[]): number {
  let minimum = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    minimum = Math.min(minimum, distanceToSegmentMeters(point, ring[j], ring[i]));
  }
  return minimum;
}

// Approximates the segment in a local equirectangular projection (adequate at Hundavænt's
// capital-region scale) rather than pulling in a full geodesic-projection dependency.
function distanceToSegmentMeters(
  point: GeographicPoint,
  segmentStart: GeographicPoint,
  segmentEnd: GeographicPoint
): number {
  const cosLatitude = Math.cos(toRadians(point.latitude));
  const toPlane = (geographicPoint: GeographicPoint) => ({
    x: geographicPoint.longitude * cosLatitude,
    y: geographicPoint.latitude
  });
  const p = toPlane(point);
  const a = toPlane(segmentStart);
  const b = toPlane(segmentEnd);

  const segmentDeltaX = b.x - a.x;
  const segmentDeltaY = b.y - a.y;
  const segmentLengthSquared = segmentDeltaX ** 2 + segmentDeltaY ** 2;
  const t =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * segmentDeltaX + (p.y - a.y) * segmentDeltaY) / segmentLengthSquared
          )
        );
  const nearest: GeographicPoint = {
    longitude: (a.x + t * segmentDeltaX) / cosLatitude,
    latitude: a.y + t * segmentDeltaY
  };
  return distanceMeters(point, nearest);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
