import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';

const { captureAnalytics } = vi.hoisted(() => ({ captureAnalytics: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { capture: captureAnalytics }
}));

const placeId = '30000000-0000-4000-8000-000000000003';
const placeName = 'Published Place';

afterEach(() => {
  captureAnalytics.mockClear();
  vi.unstubAllGlobals();
});

describe('FavouriteControl', () => {
  it('establishes Place mode when rendered outside the discovery shell', () => {
    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: true,
      favourite: true,
      copy: catalogues.en,
      signInHref: ''
    });

    const button = screen.getByRole('button', {
      name: 'Remove Published Place from saved places'
    });
    const controlRoot = button.closest('[data-favourite-place]');
    expect(controlRoot?.getAttribute('data-ui-mode')).toBe('place');
    expect(button.getAttribute('data-intent')).toBe('selected');
  });

  it.each([
    ['en', catalogues.en, 'Sign in to save Published Place'],
    ['is', catalogues.is, 'Skrá inn til að vista Published Place']
  ] as const)('offers a private signed-out invitation in %s', (_, copy, label) => {
    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: false,
      favourite: false,
      copy,
      signInHref: `/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&favourite=${placeId}`)}`
    });

    const link = screen.getByRole('link', { name: label });
    expect(link.getAttribute('href')).toContain(`favourite%3D${placeId}`);
    expect(link.classList.contains('hv-control')).toBe(true);
    expect(link.getAttribute('data-intent')).toBe('secondary');
  });

  it.each([
    [false, 'Save Published Place', 'secondary', 'idle'],
    [true, 'Remove Published Place from saved places', 'selected', 'selected']
  ] as const)(
    'exposes the saved state semantically when favourite is %s',
    (favourite, label, intent, state) => {
      render(FavouriteControl, {
        placeId,
        placeName,
        signedIn: true,
        favourite,
        copy: catalogues.en,
        signInHref: ''
      });

      const button = screen.getByRole('button', { name: label });
      expect(button.classList.contains('hv-control')).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe(String(favourite));
      expect(button.getAttribute('data-intent')).toBe(intent);
      expect(button.getAttribute('data-state')).toBe(state);
    }
  );

  it('requires explicit confirmation after authentication before saving', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ placeId, isFavourite: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    const onChange = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: true,
      favourite: false,
      copy: catalogues.en,
      signInHref: '',
      pendingConfirmation: true,
      onChange
    });

    expect(fetchMock).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm saving Published Place' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(placeId, true, expect.any(HTMLButtonElement))
    );
    expect(fetchMock).toHaveBeenCalledWith(`/api/favourites/${placeId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ desiredState: true })
    });
    expect(captureAnalytics).toHaveBeenCalledWith('place saved', {
      place_id: placeId,
      saved: true
    });
  });

  it('applies only the authoritative desired-state response', async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ placeId, isFavourite: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
      )
    );

    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: true,
      favourite: true,
      copy: catalogues.en,
      signInHref: '',
      onChange
    });

    await fireEvent.click(
      screen.getByRole('button', { name: 'Remove Published Place from saved places' })
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(placeId, false, expect.any(HTMLButtonElement))
    );
    expect(captureAnalytics).toHaveBeenCalledWith('place saved', {
      place_id: placeId,
      saved: false
    });
  });

  it('fails safely without changing state when the server response is unusable', async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 }))
    );

    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: true,
      favourite: false,
      copy: catalogues.en,
      signInHref: '',
      onChange
    });

    const button = screen.getByRole('button', { name: 'Save Published Place' });
    await fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'We could not update this saved place. Please try again.'
      )
    );
    expect(screen.getByRole('alert').classList.contains('hv-status')).toBe(true);
    expect(screen.getByRole('alert').getAttribute('data-status')).toBe('error');
    expect(onChange).not.toHaveBeenCalled();
    expect(captureAnalytics).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
