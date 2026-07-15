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
    expect(screen.getByRole('heading', { name: 'Save Brikk for later' })).toBeTruthy();
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
});
