import type { GeographicPoint } from './filter';

const locationKey = 'hundavaent:discovery-location';
const denialKey = 'hundavaent:discovery-location-denied';

export function saveSessionLocation(storage: Storage, point: GeographicPoint): void {
  storage.setItem(
    locationKey,
    JSON.stringify({
      latitude: roundCoordinate(point.latitude),
      longitude: roundCoordinate(point.longitude)
    })
  );
  storage.removeItem(denialKey);
}

export function loadSessionLocation(storage: Storage): GeographicPoint | null {
  const stored = storage.getItem(locationKey);
  if (!stored) return null;

  try {
    const value = JSON.parse(stored) as Partial<GeographicPoint>;
    return isLatitude(value.latitude) && isLongitude(value.longitude)
      ? { latitude: value.latitude, longitude: value.longitude }
      : null;
  } catch {
    return null;
  }
}

export function markLocationDenied(storage: Storage): void {
  storage.removeItem(locationKey);
  storage.setItem(denialKey, '1');
}

export function wasLocationDenied(storage: Storage): boolean {
  return storage.getItem(denialKey) === '1';
}

export function clearSessionLocation(storage: Storage): void {
  storage.removeItem(locationKey);
  storage.removeItem(denialKey);
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}
