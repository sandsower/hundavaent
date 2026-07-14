import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import AccountPage from '../../src/routes/[lang=lang]/account/+page.svelte';

describe('Member account', () => {
  it('shows only available sign-in methods without implementation warnings', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        member: null,
        returnTo: '/en',
        authStatus: 'unavailable',
        providers: { email: false, facebook: false }
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Welcome to Hundavænt' })).toBeTruthy();
    expect(screen.queryByText('Facebook sign-in is not ready in this environment.')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Email address' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send sign-in link' })).toBeNull();
    expect(
      screen.getByText('Sign-in is taking a short break. Please try again soon.')
    ).toBeTruthy();
  });

  it('organizes the signed-in account around user jobs and keeps administration in settings', async () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        member: {
          email: 'friend@example.is',
          provider: 'email',
          createdAt: '2026-07-01T12:00:00Z',
          deletionStatus: 'active',
          deletionRequestedAt: null
        },
        returnTo: '/en',
        authStatus: null,
        providers: { email: true, facebook: false },
        canModerate: false
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Saved places' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Visits' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Contributions' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Moderation workspace' })).toBeNull();
    expect(screen.queryByText('friend@example.is')).toBeNull();

    await fireEvent.click(screen.getByText('Settings'));

    expect(screen.getByText('friend@example.is')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start deletion request' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('offers the localized moderation workspace only to capable Members', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        member: {
          email: 'moderator@example.is',
          provider: 'email',
          createdAt: '2026-07-01T12:00:00Z',
          deletionStatus: 'active',
          deletionRequestedAt: null
        },
        returnTo: '/en',
        authStatus: null,
        providers: { email: true, facebook: false },
        canModerate: true
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Moderation workspace' })).toBeTruthy();
    const moderationLink = screen.getByRole('link', { name: 'Open moderation workspace' });
    expect(moderationLink.getAttribute('href')).toBe('/en/moderation');
  });

  it('explains Facebook data use when Facebook is the available sign-in method', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        member: null,
        returnTo: '/en',
        authStatus: null,
        providers: { email: false, facebook: true }
      },
      form: null
    } as never);

    expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeTruthy();
    expect(
      screen.getByText(
        'Facebook will share the account details needed to sign you in. Hundavænt will never post to Facebook.'
      )
    ).toBeTruthy();
  });
});
