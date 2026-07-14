import { describe, expect, it } from 'vitest';

import {
  MAXIMUM_ACCURACY_METERS,
  MAXIMUM_STALENESS_MS,
  OUTDOOR_FALLBACK_RADIUS_METERS,
  POINT_RADIUS_METERS,
  POLYGON_BUFFER_METERS,
  decideProximity,
  distanceMeters,
  isPointInPolygon,
  isReadingUsable,
  type CoordinateReading,
  type ProximityPlace
} from '$lib/check-ins/proximity';

const now = Date.parse('2026-07-12T12:00:00Z');
const cafePlace: ProximityPlace = {
  category: 'cafe',
  location: { latitude: 64.146, longitude: -21.942 }
};
const parkPlace: ProximityPlace = {
  category: 'park',
  location: { latitude: 64.15, longitude: -21.95 }
};

function readingAt(
  point: { latitude: number; longitude: number },
  overrides: Partial<CoordinateReading> = {}
): CoordinateReading {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMeters: 20,
    capturedAt: now,
    ...overrides
  };
}

describe('decideProximity', () => {
  it('records unknown when no reading was taken at all (the no-location path)', () => {
    expect(decideProximity(cafePlace, null, now)).toBe('unknown');
  });

  it('confirms a point-Location Place within the 150m radius', () => {
    const nearby = offsetMeters(cafePlace.location, 100);
    expect(decideProximity(cafePlace, readingAt(nearby), now)).toBe('confirmed');
  });

  it('does not confirm a point-Location Place just outside the 150m radius, but still succeeds as not_confirmed', () => {
    const distant = offsetMeters(cafePlace.location, POINT_RADIUS_METERS + 50);
    expect(decideProximity(cafePlace, readingAt(distant), now)).toBe('not_confirmed');
  });

  it('uses the wider 300m outdoor fallback radius when a Place has no boundary polygon', () => {
    const distant = offsetMeters(parkPlace.location, OUTDOOR_FALLBACK_RADIUS_METERS - 50);
    expect(decideProximity(parkPlace, readingAt(distant), now)).toBe('confirmed');
    expect(
      decideProximity(
        cafePlace,
        readingAt(offsetMeters(cafePlace.location, OUTDOOR_FALLBACK_RADIUS_METERS - 50)),
        now
      )
    ).toBe('not_confirmed');
  });

  it('confirms inside a large bounded outdoor polygon even far from its centroid', () => {
    const largePolygonPlace: ProximityPlace = {
      category: 'park',
      location: { latitude: 64.15, longitude: -21.95 },
      boundary: {
        points: [
          { latitude: 64.14, longitude: -21.97 },
          { latitude: 64.14, longitude: -21.93 },
          { latitude: 64.16, longitude: -21.93 },
          { latitude: 64.16, longitude: -21.97 }
        ]
      }
    };
    // Deep inside the polygon, far outside what the 300m fallback radius from the centroid would
    // have covered -- proves the polygon branch, not the fallback radius, is what confirms this.
    const insideCorner = { latitude: 64.141, longitude: -21.969 };
    expect(distanceMeters(largePolygonPlace.location, insideCorner)).toBeGreaterThan(
      OUTDOOR_FALLBACK_RADIUS_METERS
    );
    expect(decideProximity(largePolygonPlace, readingAt(insideCorner), now)).toBe('confirmed');
  });

  it('confirms just outside a polygon boundary within the 50m buffer', () => {
    const squarePlace: ProximityPlace = {
      category: 'park',
      location: { latitude: 64.15, longitude: -21.95 },
      boundary: {
        points: [
          { latitude: 64.149, longitude: -21.951 },
          { latitude: 64.149, longitude: -21.949 },
          { latitude: 64.151, longitude: -21.949 },
          { latitude: 64.151, longitude: -21.951 }
        ]
      }
    };
    const justOutside = offsetMeters(
      { latitude: 64.151, longitude: -21.95 },
      POLYGON_BUFFER_METERS - 10
    );
    expect(isPointInPolygon(justOutside, squarePlace.boundary!.points)).toBe(false);
    expect(decideProximity(squarePlace, readingAt(justOutside), now)).toBe('confirmed');

    const wellOutside = offsetMeters(
      { latitude: 64.151, longitude: -21.95 },
      POLYGON_BUFFER_METERS + 200
    );
    expect(decideProximity(squarePlace, readingAt(wellOutside), now)).toBe('not_confirmed');
  });

  it('falls back to unknown for a reading worse than the 100m accuracy ceiling', () => {
    const reading = readingAt(cafePlace.location, { accuracyMeters: MAXIMUM_ACCURACY_METERS + 1 });
    expect(isReadingUsable(reading, now)).toBe(false);
    expect(decideProximity(cafePlace, reading, now)).toBe('unknown');
  });

  it('falls back to unknown for a reading older than the 30s staleness ceiling', () => {
    const reading = readingAt(cafePlace.location, { capturedAt: now - MAXIMUM_STALENESS_MS - 1 });
    expect(isReadingUsable(reading, now)).toBe(false);
    expect(decideProximity(cafePlace, reading, now)).toBe('unknown');
  });

  it('accepts a reading exactly at the accuracy and staleness ceilings', () => {
    const reading = readingAt(cafePlace.location, {
      accuracyMeters: MAXIMUM_ACCURACY_METERS,
      capturedAt: now - MAXIMUM_STALENESS_MS
    });
    expect(isReadingUsable(reading, now)).toBe(true);
  });
});

/** Offsets a point due north by approximately the given number of meters, for test fixtures only. */
function offsetMeters(
  point: { latitude: number; longitude: number },
  meters: number
): { latitude: number; longitude: number } {
  const metersPerDegreeLatitude = 111_320;
  return {
    latitude: point.latitude + meters / metersPerDegreeLatitude,
    longitude: point.longitude
  };
}
