import type { CoordinateReading } from './proximity';

export const acquisitionTimeoutMs = 8_000;
export const maximumReadingAgeMs = 30_000;

export type GeolocationOutcome =
  | { status: 'granted'; reading: CoordinateReading }
  | { status: 'denied' }
  | { status: 'timeout' }
  | { status: 'unavailable' };

interface GeolocationLike {
  getCurrentPosition(
    onSuccess: (position: GeolocationPosition) => void,
    onError: (error: GeolocationPositionError) => void,
    options: PositionOptions
  ): void;
}

/**
 * Requests exactly one geolocation reading, never retrying automatically. Resolves within
 * `timeoutMs` regardless of what the underlying browser API does, so a Member is never left
 * waiting past the approved acquisition timeout. The caller must discard the returned reading
 * immediately after computing a proximity decision -- this module has no memory of past readings.
 */
export function requestOneTimeLocation(
  geolocation: GeolocationLike | undefined = getBrowserGeolocation(),
  timeoutMs: number = acquisitionTimeoutMs,
  maxAgeMs: number = maximumReadingAgeMs
): Promise<GeolocationOutcome> {
  if (!geolocation) {
    return Promise.resolve({ status: 'unavailable' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: GeolocationOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => settle({ status: 'timeout' }), timeoutMs);

    geolocation.getCurrentPosition(
      (position) => {
        settle({
          status: 'granted',
          reading: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            capturedAt: position.timestamp
          }
        });
      },
      (error) => {
        settle({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxAgeMs }
    );
  });
}

function getBrowserGeolocation(): GeolocationLike | undefined {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
  return navigator.geolocation;
}
