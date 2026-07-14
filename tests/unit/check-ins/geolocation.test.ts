import { describe, expect, it, vi } from 'vitest';

import { requestOneTimeLocation } from '$lib/check-ins/geolocation';

function permissionDeniedError(): GeolocationPositionError {
  return {
    code: 1,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message: 'denied'
  } as GeolocationPositionError;
}

function positionUnavailableError(): GeolocationPositionError {
  return {
    code: 2,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message: 'unavailable'
  } as GeolocationPositionError;
}

describe('requestOneTimeLocation', () => {
  it('resolves unavailable immediately when no geolocation capability exists', async () => {
    await expect(requestOneTimeLocation(undefined)).resolves.toEqual({ status: 'unavailable' });
  });

  it('resolves granted with a single reading on success, never retrying', async () => {
    const getCurrentPosition = vi.fn<
      (
        onSuccess: (position: GeolocationPosition) => void,
        onError: (error: GeolocationPositionError) => void,
        options: PositionOptions
      ) => void
    >((onSuccess) => {
      onSuccess({
        coords: { latitude: 64.14, longitude: -21.9, accuracy: 12 },
        timestamp: 1_000
      } as GeolocationPosition);
    });

    const outcome = await requestOneTimeLocation({ getCurrentPosition }, 8_000, 30_000);

    expect(outcome).toEqual({
      status: 'granted',
      reading: { latitude: 64.14, longitude: -21.9, accuracyMeters: 12, capturedAt: 1_000 }
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: 8_000,
      maximumAge: 30_000
    });
  });

  it('resolves denied when the browser reports permission denial', async () => {
    const getCurrentPosition = vi.fn(
      (
        _onSuccess: (position: GeolocationPosition) => void,
        onError: (error: GeolocationPositionError) => void
      ) => onError(permissionDeniedError())
    );

    await expect(requestOneTimeLocation({ getCurrentPosition })).resolves.toEqual({
      status: 'denied'
    });
  });

  it('resolves unavailable for any non-permission browser error', async () => {
    const getCurrentPosition = vi.fn(
      (
        _onSuccess: (position: GeolocationPosition) => void,
        onError: (error: GeolocationPositionError) => void
      ) => onError(positionUnavailableError())
    );

    await expect(requestOneTimeLocation({ getCurrentPosition })).resolves.toEqual({
      status: 'unavailable'
    });
  });

  it('resolves timeout on its own schedule and never calls back again afterward', async () => {
    vi.useFakeTimers();
    try {
      let capturedSuccess: ((position: GeolocationPosition) => void) | undefined;
      const getCurrentPosition = vi.fn((onSuccess: (position: GeolocationPosition) => void) => {
        capturedSuccess = onSuccess;
        // The browser never calls back within the acquisition window in this scenario.
      });

      const promise = requestOneTimeLocation({ getCurrentPosition }, 8_000, 30_000);
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(promise).resolves.toEqual({ status: 'timeout' });

      // A late browser callback after the timeout already settled must not change the outcome or
      // throw -- this proves there is no automatic retry and no stale-callback resolution.
      expect(() =>
        capturedSuccess?.({
          coords: { latitude: 1, longitude: 1, accuracy: 1 },
          timestamp: 1
        } as GeolocationPosition)
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
