import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import CheckInControl from '$lib/check-ins/CheckInControl.svelte';
import type { ProximityPlace } from '$lib/check-ins/proximity';

const { captureAnalytics } = vi.hoisted(() => ({ captureAnalytics: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { capture: captureAnalytics }
}));

const placeId = '30000000-0000-4000-8000-000000000003';
const placeName = 'Published Place';
const place: ProximityPlace = {
  category: 'park',
  location: { latitude: 64.146, longitude: -21.942 }
};

afterEach(() => {
  captureAnalytics.mockClear();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('CheckInControl', () => {
  it.each([
    ['en', catalogues.en, 'Sign in to check in at Published Place'],
    ['is', catalogues.is, 'Skráðu þig inn til að skrá heimsókn hjá Published Place']
  ] as const)('offers a private signed-out invitation in %s', (_, copy, label) => {
    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: _,
      copy,
      signedIn: false,
      signInHref: `/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}`)}`,
      proximityAssistEnabled: false
    });

    expect(screen.getByRole('link', { name: label })).toBeTruthy();
  });

  it.each([
    ['en', catalogues.en, 'This records that you visited right now', 'Check-ins are private.'],
    ['is', catalogues.is, 'Þetta er skráð sem heimsókn núna', 'Innritanir eru einkamál.']
  ] as const)(
    'shows time and privacy explanations before acting, in %s',
    (lang, copy, time, privacy) => {
      render(CheckInControl, {
        placeId,
        placeName,
        place,
        lang,
        copy,
        signedIn: true,
        signInHref: '',
        proximityAssistEnabled: false
      });

      expect(screen.getByText(new RegExp(time))).toBeTruthy();
      expect(screen.getByText(new RegExp(privacy))).toBeTruthy();
      expect(
        screen.getByRole('button', {
          name: copy['checkIn.actionAccessible'].replace('{name}', placeName)
        })
      ).toBeTruthy();
    }
  );

  it('hides the location assist entirely when the proximity policy is disabled', () => {
    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: false
    });

    expect(screen.queryByRole('button', { name: 'Use my location to confirm' })).toBeNull();
  });

  it('shows the location assist only when the fail-closed policy flag is enabled', () => {
    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: true
    });

    expect(screen.getByRole('button', { name: 'Use my location to confirm' })).toBeTruthy();
  });

  it('records a no-location Check-in and shows the server result', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        checkInId: 'c1',
        placeId,
        proximityConfirmed: 'unknown',
        checkedInAt: '2026-07-12T14:32:00Z',
        alreadyCheckedIn: false
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: false
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Check in at Published Place' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain("You're checked in")
    );
    expect(fetchMock).toHaveBeenCalledWith(`/api/check-ins/${placeId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proximityDecision: 'unknown' })
    });
    expect(captureAnalytics).toHaveBeenCalledWith('check in completed', {
      place_id: placeId,
      outcome: 'created',
      proximity: 'unknown'
    });
  });

  it('shows the idempotent "already checked in today" copy for a duplicate result', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        checkInId: 'c1',
        placeId,
        proximityConfirmed: 'unknown',
        checkedInAt: '2026-07-12T09:00:00Z',
        alreadyCheckedIn: true
      })
    );

    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: false
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Check in at Published Place' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('You already checked in here today.')
    );
    expect(captureAnalytics).toHaveBeenCalledWith('check in completed', {
      place_id: placeId,
      outcome: 'duplicate',
      proximity: 'unknown'
    });
  });

  it('prefills the duplicate result from a server-loaded initial status without requiring a click', () => {
    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: false,
      initialCheckedInAt: '2026-07-12T09:00:00Z'
    });

    expect(screen.getByRole('status').textContent).toContain('You already checked in here today.');
  });

  it('shows a recoverable message when the Place became unavailable mid-action', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'place_unavailable' }, 409));

    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: false
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Check in at Published Place' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'This place is no longer available, so the check-in could not be completed.'
      )
    );
  });

  it('falls back to the no-location path on permission denial and remembers it for the session', async () => {
    const getCurrentPosition = vi.fn(
      (_onSuccess: PositionCallback, onError: PositionErrorCallback) =>
        onError({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3
        })
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });

    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: true
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Use my location to confirm' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Location was not shared')
    );
    // The Member is offered the no-location action and is not asked for permission again.
    expect(screen.getByRole('button', { name: 'Check in at Published Place' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use my location to confirm' })).toBeNull();
    expect(captureAnalytics).toHaveBeenCalledWith('location permission resolved', {
      context: 'check_in',
      outcome: 'denied'
    });
  });

  it('confirms proximity from a mocked in-range reading and never sends coordinates to the server', async () => {
    const getCurrentPosition = vi.fn((onSuccess: PositionCallback) =>
      onSuccess({
        coords: {
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          accuracy: 15,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({})
        },
        timestamp: Date.now(),
        toJSON: () => ({})
      } as GeolocationPosition)
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({
        checkInId: 'c1',
        placeId,
        proximityConfirmed: 'confirmed',
        checkedInAt: '2026-07-12T14:32:00Z',
        alreadyCheckedIn: false
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(CheckInControl, {
      placeId,
      placeName,
      place,
      lang: 'en',
      copy: catalogues.en,
      signedIn: true,
      signInHref: '',
      proximityAssistEnabled: true
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Use my location to confirm' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ proximityDecision: 'confirmed' });
    expect(Object.keys(sentBody)).not.toContain('latitude');
    expect(Object.keys(sentBody)).not.toContain('longitude');
    expect(Object.keys(sentBody)).not.toContain('accuracy');
    expect(captureAnalytics).toHaveBeenCalledWith('location permission resolved', {
      context: 'check_in',
      outcome: 'granted'
    });
    await waitFor(() =>
      expect(captureAnalytics).toHaveBeenCalledWith('check in completed', {
        place_id: placeId,
        outcome: 'created',
        proximity: 'confirmed'
      })
    );
  });
});
