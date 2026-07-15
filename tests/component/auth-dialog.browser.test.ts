import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AuthDialog from '$lib/auth/AuthDialog.svelte';
import { requestAuthentication } from '$lib/auth/controller';
import { catalogues } from '$i18n';

const { captureAnalytics } = vi.hoisted(() => ({ captureAnalytics: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { capture: captureAnalytics }
}));

afterEach(() => {
  captureAnalytics.mockClear();
  vi.unstubAllGlobals();
});

describe('AuthDialog', () => {
  it('opens a contextual Favorite funnel with Facebook first and concise passwordless email copy', async () => {
    render(AuthDialog, {
      lang: 'en',
      copy: catalogues.en,
      providers: { email: true, facebook: true }
    });

    requestAuthentication({
      origin: 'favourite',
      intent: { action: 'favourite', placeId: 'place-1', placeName: 'Brikk' }
    });

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Add Brikk to your favorites' })).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons.findIndex((button) => button.textContent?.includes('Facebook'))).toBeLessThan(
      buttons.findIndex((button) => button.textContent?.includes('Send me'))
    );
    expect(screen.getByText("No password needed. We'll email you a sign-in link.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/en/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/en/privacy'
    );
    expect(captureAnalytics).toHaveBeenCalledWith('auth modal opened', {
      origin: 'favourite'
    });
  });

  it('replaces the form with a concise sent state and preserves the pending intent', async () => {
    let submitted: FormData | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      expect(String(input)).toContain('/en/auth/start');
      submitted = options?.body as FormData;
      return new Response(JSON.stringify({ status: 'link_sent', resendAfterSeconds: 30 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(AuthDialog, {
      lang: 'en',
      copy: catalogues.en,
      providers: { email: true, facebook: true }
    });

    requestAuthentication({
      origin: 'rating',
      intent: {
        action: 'rating',
        placeId: 'place-1',
        placeName: 'Brikk',
        overallRating: 2
      }
    });
    await fireEvent.input(await screen.findByLabelText('Email address'), {
      target: { value: 'friend@example.is' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Check your email' })).toBeTruthy()
    );
    expect(screen.getByText('We sent a sign-in link to friend@example.is.')).toBeTruthy();
    expect(Object.fromEntries(submitted!.entries())).toMatchObject({
      intentAction: 'rating',
      placeId: 'place-1',
      overallRating: '2'
    });
    expect(screen.getByRole('button', { name: 'Send again in 30s' })).toBeDisabled();
  });

  it('preserves a server-normalized Favorite intent after the anchor fallback navigates', async () => {
    const placeId = '30000000-0000-4000-8000-000000000003';
    history.replaceState(
      null,
      '',
      `/en?auth=open&authReturnTo=%2Fen%3Fplace%3D${placeId}&authIntent=favourite&authPlace=${placeId}`
    );
    let submitted: FormData | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
        submitted = options?.body as FormData;
        return new Response(JSON.stringify({ status: 'link_sent', resendAfterSeconds: 30 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      })
    );

    render(AuthDialog, {
      lang: 'en',
      copy: catalogues.en,
      providers: { email: true, facebook: true }
    });

    await fireEvent.input(await screen.findByLabelText('Email address'), {
      target: { value: 'fallback@example.is' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }));

    await waitFor(() => expect(submitted).not.toBeNull());
    expect(Object.fromEntries(submitted!.entries())).toMatchObject({
      intentAction: 'favourite',
      placeId,
      returnTo: `/en?place=${placeId}`
    });
  });
});
