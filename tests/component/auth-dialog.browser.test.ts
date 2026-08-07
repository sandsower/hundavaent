import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page as browserPage } from 'vitest/browser';

import '../../src/app.css';
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

    const dialog = await screen.findByRole('dialog');
    const dialogContent = dialog.querySelector<HTMLElement>('.dialog-content');
    expect(dialogContent).toBeTruthy();
    if (!dialogContent) throw new Error('Expected AuthDialog content');
    expect(screen.getByRole('heading', { name: 'Add Brikk to your favorites' })).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    const facebook = screen.getByRole('button', { name: 'Continue with Facebook' });
    const facebookStyles = getComputedStyle(facebook);
    expect(buttons.findIndex((button) => button.textContent?.includes('Facebook'))).toBeLessThan(
      buttons.findIndex((button) => button.textContent?.includes('Send me'))
    );
    expect(facebookStyles.minHeight).toBe('44px');
    expect(facebookStyles.paddingBlockStart).toBe('10px');
    expect(facebookStyles.paddingBlockEnd).toBe('10px');
    expect(facebookStyles.paddingInlineStart).toBe('13.6px');
    expect(facebookStyles.paddingInlineEnd).toBe('13.6px');
    expect(facebookStyles.borderTopStyle).toBe('none');
    expect(facebookStyles.borderRadius).toBe('999px');
    expect(facebookStyles.fontWeight).toBe('800');
    // Button owns the intent look itself now; it never renders data-intent (retired vocabulary).
    expect(facebook.getAttribute('data-intent')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Send me a sign-in link' }).getAttribute('data-intent')
    ).toBeNull();
    expect(getComputedStyle(dialogContent).paddingInlineStart).toBe('16px');
    expect(getComputedStyle(dialogContent).paddingInlineEnd).toBe('16px');
    expect(screen.getByText("No password needed. We'll email you a sign-in link.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/en/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/en/privacy'
    );
    expect(captureAnalytics).toHaveBeenCalledWith('auth modal opened', {
      origin: 'favourite'
    });
  });

  // Pins the dialog-shell unification (old subtle-border/1.25rem shell -> design-system panel
  // tokens) as an accepted owner decision: the border and corner radius that used to be
  // AuthDialog's own literal values now come from Dialog's `border-border-strong rounded-panel`
  // classes (packages/design-system/src/theme.css), which resolve --hv-border-strong and
  // --hv-radius-panel. Resolved from a probe element rather than hardcoded, following the
  // token-resolution technique in tests/component/button.browser.test.ts, so this pins parity
  // with the token rather than a literal that would drift the moment tokens.css changes.
  it('pins the dialog shell border and corner radius to the panel tokens', async () => {
    render(AuthDialog, {
      lang: 'en',
      copy: catalogues.en,
      providers: { email: true, facebook: true }
    });

    requestAuthentication({
      origin: 'favourite',
      intent: { action: 'favourite', placeId: 'place-1', placeName: 'Brikk' }
    });

    const dialog = await screen.findByRole('dialog');
    const dialogStyles = getComputedStyle(dialog);

    const borderProbe = document.createElement('div');
    borderProbe.style.borderTopColor = 'var(--hv-border-strong)';
    document.body.append(borderProbe);
    const resolvedBorderTopColor = getComputedStyle(borderProbe).borderTopColor;
    borderProbe.remove();

    const radiusProbe = document.createElement('div');
    radiusProbe.style.borderTopLeftRadius = 'var(--hv-radius-panel)';
    document.body.append(radiusProbe);
    const resolvedBorderTopLeftRadius = getComputedStyle(radiusProbe).borderTopLeftRadius;
    radiusProbe.remove();

    expect(dialogStyles.borderTopColor).toBe(resolvedBorderTopColor);
    expect(dialogStyles.borderTopLeftRadius).toBe(resolvedBorderTopLeftRadius);
  });

  it('replaces the form with a concise sent state and preserves the pending intent', async () => {
    let submitted: FormData | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      expect(String(input)).toContain('/en/auth/start');
      submitted = options?.body as FormData;
      return new Response(JSON.stringify({ status: 'link_sent', resendAfterSeconds: 60 }), {
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
    const differentEmail = screen.getByRole('button', { name: 'Use a different email' });
    const sendAgain = await screen.findByRole('button', { name: 'Send again in 60s' });
    expect(sendAgain).toBeDisabled();
    expect(getComputedStyle(differentEmail).fontWeight).toBe('850');
    expect(getComputedStyle(sendAgain).fontWeight).toBe('850');
  });

  // Pins the bind:this focus path (AuthDialog.svelte's emailInput binding) that replaced the old
  // dialog.querySelector lookup after Dialog stopped exposing its element to consumers.
  // useDifferentEmail's queueMicrotask still runs after Svelte's own state-driven DOM update, so
  // awaiting a microtask turn here (rather than a specific waitFor condition) mirrors that timing
  // directly instead of asserting through it.
  it('returns focus to the email input after choosing to use a different email', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 'link_sent', resendAfterSeconds: 60 }), {
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

    await fireEvent.click(
      screen.getByRole('button', { name: catalogues.en['auth.differentEmail'] })
    );
    await new Promise((resolve) => setTimeout(resolve));

    expect(document.activeElement).toBe(await screen.findByLabelText('Email address'));
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
        return new Response(JSON.stringify({ status: 'link_sent' }), {
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
    expect(await screen.findByRole('button', { name: 'Send again in 60s' })).toBeDisabled();
  });

  it('keeps the Facebook control and compact dialog inset from every viewport edge', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };
    await browserPage.viewport(390, 844);

    try {
      render(AuthDialog, {
        lang: 'en',
        copy: catalogues.en,
        providers: { email: true, facebook: true }
      });
      requestAuthentication({
        origin: 'favourite',
        intent: { action: 'favourite', placeId: 'place-1', placeName: 'Brikk' }
      });

      const dialog = await screen.findByRole('dialog');
      const content = dialog.querySelector<HTMLElement>('.dialog-content');
      const facebook = screen.getByRole('button', { name: 'Continue with Facebook' });
      expect(content).toBeTruthy();
      if (!content) throw new Error('Expected AuthDialog content');

      const contentRect = content.getBoundingClientRect();
      const facebookRect = facebook.getBoundingClientRect();
      const dialogStyles = getComputedStyle(dialog);
      expect(dialogStyles.left).toBe('16px');
      expect(dialogStyles.right).toBe('16px');
      expect(dialogStyles.marginInlineStart).toBe('0px');
      expect(dialogStyles.marginInlineEnd).toBe('0px');
      expect(dialogStyles.marginBottom).toBe('16px');
      expect(getComputedStyle(content).paddingInlineStart).toBe('16px');
      expect(getComputedStyle(content).paddingInlineEnd).toBe('16px');
      expect(facebookRect.left - contentRect.left).toBeCloseTo(16, 0);
      expect(contentRect.right - facebookRect.right).toBeCloseTo(16, 0);
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });
});
