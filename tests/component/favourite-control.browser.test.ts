import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
import { authRequestEventName } from '$lib/auth/controller';

const { captureAnalytics } = vi.hoisted(() => ({ captureAnalytics: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { capture: captureAnalytics }
}));

const placeId = '30000000-0000-4000-8000-000000000003';
const placeName = 'Published Place';
const changedAt = '2026-07-13T12:00:00.000Z';

function mutationPayload(
  isFavourite: boolean,
  recognition: {
    firstTimeForPlace?: boolean;
    activatedCurrentWeek?: boolean;
  } = {}
) {
  return {
    placeId,
    isFavourite,
    changedAt,
    recognition: {
      action: 'favourite',
      recognized: recognition.firstTimeForPlace ?? false,
      firstTimeForPlace: recognition.firstTimeForPlace ?? false,
      activatedCurrentWeek: recognition.activatedCurrentWeek ?? false,
      currentWeek: {
        startsOn: '2026-07-13',
        endsOn: '2026-07-19',
        active: recognition.firstTimeForPlace ?? false
      }
    }
  };
}

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
      name: 'Remove Published Place from favorites'
    });
    const controlRoot = button.closest('[data-favourite-place]');
    expect(controlRoot?.getAttribute('data-ui-mode')).toBe('place');
    // Button owns the pressed look itself now; it never renders data-intent.
    expect(button.getAttribute('data-intent')).toBeNull();
  });

  it.each([
    ['en', catalogues.en, 'Sign in to add Published Place to favorites'],
    ['is', catalogues.is, 'Skrá inn til að bæta í uppáhald: Published Place']
  ] as const)('offers a private signed-out invitation in %s', async (_, copy, label) => {
    const receiveRequest = vi.fn();
    window.addEventListener(authRequestEventName, receiveRequest);
    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: false,
      favourite: false,
      copy,
      signInHref: `/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}`)}`
    });

    const link = screen.getByRole('link', { name: label });
    expect(link.getAttribute('href')).not.toContain('favourite');
    expect(link.getAttribute('href')).toContain(`place%3D${placeId}`);
    expect(link.classList.contains('favourite-toggle')).toBe(true);
    // Button owns the control look itself now; it never renders data-intent.
    expect(link.getAttribute('data-intent')).toBeNull();
    await fireEvent.click(link);
    expect(receiveRequest).toHaveBeenCalledOnce();
    expect((receiveRequest.mock.calls[0][0] as CustomEvent).detail).toEqual({
      origin: 'favourite',
      intent: { action: 'favourite', placeId, placeName }
    });
    window.removeEventListener(authRequestEventName, receiveRequest);
  });

  it.each([
    [false, 'Add Published Place to favorites', 'idle'],
    [true, 'Remove Published Place from favorites', 'selected']
  ] as const)(
    'exposes the saved state semantically when favourite is %s',
    (favourite, label, state) => {
      render(FavouriteControl, {
        placeId,
        placeName,
        signedIn: true,
        favourite,
        copy: catalogues.en,
        signInHref: ''
      });

      const button = screen.getByRole('button', { name: label });
      expect(button.classList.contains('favourite-toggle')).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe(String(favourite));
      // Button owns the pressed look itself now; it never renders data-intent, and
      // aria-pressed above already carries the semantic this used to stand in for.
      expect(button.getAttribute('data-intent')).toBeNull();
      expect(button.getAttribute('data-state')).toBe(state);
    }
  );

  it('applies the Favorite immediately for an authenticated Member', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(mutationPayload(true)), {
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
      onChange
    });

    expect(fetchMock).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Add Published Place to favorites' }));

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
          new Response(JSON.stringify(mutationPayload(false)), {
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
      screen.getByRole('button', { name: 'Remove Published Place from favorites' })
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(placeId, false, expect.any(HTMLButtonElement))
    );
    expect(captureAnalytics).toHaveBeenCalledWith('place saved', {
      place_id: placeId,
      saved: false
    });
  });

  it('emits only server-authoritative first-save recognition and same-tab week activation', async () => {
    const onRecognized = vi.fn();
    const activation = vi.fn();
    window.addEventListener('hundavaent:weekly-rhythm-activated', activation);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              mutationPayload(true, {
                firstTimeForPlace: true,
                activatedCurrentWeek: true
              })
            ),
            {
              status: 200,
              headers: { 'content-type': 'application/json' }
            }
          )
      )
    );

    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: true,
      favourite: false,
      copy: catalogues.en,
      signInHref: '',
      onRecognized
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Add Published Place to favorites' }));

    await waitFor(() =>
      expect(onRecognized).toHaveBeenCalledWith({
        action: 'favourite',
        recognized: true,
        firstTimeForPlace: true,
        activatedCurrentWeek: true,
        currentWeek: {
          startsOn: '2026-07-13',
          endsOn: '2026-07-19',
          active: true
        }
      })
    );
    expect(activation).toHaveBeenCalledOnce();
    expect((activation.mock.calls[0][0] as CustomEvent).detail).toEqual({
      startsOn: '2026-07-13',
      endsOn: '2026-07-19',
      active: true
    });
    window.removeEventListener('hundavaent:weekly-rhythm-activated', activation);
  });

  it('applies an authoritative active week even when this save did not activate it', async () => {
    const activation = vi.fn();
    window.addEventListener('hundavaent:weekly-rhythm-activated', activation);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              mutationPayload(true, {
                firstTimeForPlace: true,
                activatedCurrentWeek: false
              })
            ),
            {
              status: 200,
              headers: { 'content-type': 'application/json' }
            }
          )
      )
    );

    render(FavouriteControl, {
      placeId,
      placeName,
      signedIn: true,
      favourite: false,
      copy: catalogues.en,
      signInHref: ''
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Add Published Place to favorites' }));

    await waitFor(() => expect(activation).toHaveBeenCalledOnce());
    expect((activation.mock.calls[0][0] as CustomEvent).detail).toEqual({
      startsOn: '2026-07-13',
      endsOn: '2026-07-19',
      active: true
    });
    window.removeEventListener('hundavaent:weekly-rhythm-activated', activation);
  });

  it('rejects a successful response without authoritative recognition metadata', async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ placeId, isFavourite: true, changedAt }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
      )
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

    await fireEvent.click(screen.getByRole('button', { name: 'Add Published Place to favorites' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
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

    const button = screen.getByRole('button', { name: 'Add Published Place to favorites' });
    await fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'We could not update your favorites. Please try again.'
      )
    );
    expect(screen.getByRole('alert').classList.contains('hv-status')).toBe(true);
    expect(screen.getByRole('alert').getAttribute('data-status')).toBe('error');
    expect(onChange).not.toHaveBeenCalled();
    expect(captureAnalytics).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
