import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import AccountPage from '../../src/routes/[lang=lang]/account/+page.svelte';

function signedInData(overrides: Record<string, unknown> = {}) {
  return {
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
    canModerate: false,
    ...overrides
  };
}

describe('Member account', () => {
  it('renders nothing for signed-out visitors, who are redirected to the sign-in dialog', () => {
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

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('organizes the signed-in account around user jobs and keeps administration in settings', async () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData(),
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Your places' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Contributions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your impact' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See my impact' }).getAttribute('href')).toBe(
      '/en/account/impact'
    );
    expect(screen.getByRole('link', { name: 'Open my places' }).getAttribute('href')).toBe(
      '/en/history'
    );
    // The trail panel is the achievements door; without facts it carries the plain label.
    expect(screen.getByRole('link', { name: 'My Achievements' }).getAttribute('href')).toBe(
      '/en/account/achievements'
    );
    // The recap is hub-hidden until the member base grows; the route stays direct-only.
    expect(screen.queryByRole('link', { name: 'Open my recap' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Weekly recap' })).toBeNull();
    // Contributor status moved off the hub; it is reachable from the impact page instead.
    expect(screen.queryByRole('link', { name: 'My Contributor status' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'View favorites' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Moderation workspace' })).toBeNull();
    expect(screen.queryByText('friend@example.is')).toBeNull();

    await fireEvent.click(screen.getByText('Settings'));

    expect(screen.getByText('friend@example.is')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start deletion request' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('surfaces private facts on the destination cards when they are available', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        accountFacts: {
          saved: { status: 'available', count: 12 },
          visits: { status: 'available', lastVisitedAt: '2026-07-12T10:00:00Z' },
          suggestions: { status: 'available', awaitingReview: 1, needsReply: 2 },
          achievements: {
            status: 'available',
            next: {
              kind: 'credited_places',
              current: 4,
              target: 5
            }
          }
        }
      }),
      form: null
    } as never);

    expect(screen.getByText(/12 places saved/)).toBeTruthy();
    expect(screen.getByText(/Last visit/)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: "You're close to your next Achievement!" })
        .getAttribute('href')
    ).toBe('/en/account/achievements');
    expect(screen.getByText('1 Suggestion awaiting review')).toBeTruthy();
    expect(screen.getByText('2 Suggestions need your reply')).toBeTruthy();
  });

  it('keeps every destination card quiet when no facts are loadable', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData(),
      form: null
    } as never);

    expect(screen.queryByText(/places saved/)).toBeNull();
    expect(screen.queryByText(/Last visit/)).toBeNull();
    expect(screen.queryByText(/awaiting review/)).toBeNull();
    // Without facts the achievements door never teases; it keeps the plain label.
    expect(screen.queryByText(/next Achievement/)).toBeNull();
    expect(screen.getByRole('link', { name: 'My Achievements' })).toBeTruthy();
  });

  it('requires a second confirming step before a deletion request is submittable', async () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData(),
      form: null
    } as never);

    await fireEvent.click(screen.getByText('Settings'));

    const start = screen.getByRole('button', { name: 'Start deletion request' });
    expect(start.getAttribute('type')).toBe('button');
    expect(screen.queryByRole('button', { name: 'Confirm deletion request' })).toBeNull();

    await fireEvent.click(start);

    expect(screen.getByRole('button', { name: 'Confirm deletion request' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(screen.queryByRole('button', { name: 'Confirm deletion request' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start deletion request' })).toBeTruthy();
  });

  it('echoes a recorded deletion request inside the deletion section instead of a request button', async () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        member: {
          email: 'friend@example.is',
          provider: 'email',
          createdAt: '2026-07-01T12:00:00Z',
          deletionStatus: 'requested',
          deletionRequestedAt: '2026-07-20T09:00:00Z'
        }
      }),
      form: null
    } as never);

    await fireEvent.click(screen.getByText('Settings'));

    expect(
      screen.getByText('Your request is recorded. We will contact you before anything is deleted.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start deletion request' })).toBeNull();
  });

  it('keeps the deletion confirmation visible on a full-page re-render after the action', () => {
    // A no-JS confirm submits natively and re-renders from scratch; the settings section must
    // open itself so the only confirmation notice on the page is actually visible.
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        member: {
          email: 'friend@example.is',
          provider: 'email',
          createdAt: '2026-07-01T12:00:00Z',
          deletionStatus: 'requested',
          deletionRequestedAt: '2026-07-25T09:00:00Z'
        }
      }),
      form: { action: 'requestDeletion', success: 'deletion_requested' }
    } as never);

    expect(
      screen.getByText('Your request is recorded. We will contact you before anything is deleted.')
    ).toBeTruthy();
  });

  it('offers the localized moderation workspace only to capable Members', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        member: {
          email: 'moderator@example.is',
          provider: 'email',
          createdAt: '2026-07-01T12:00:00Z',
          deletionStatus: 'active',
          deletionRequestedAt: null
        },
        canModerate: true
      }),
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Moderation workspace' })).toBeTruthy();
    const moderationLink = screen.getByRole('link', { name: 'Open moderation workspace' });
    expect(moderationLink.getAttribute('href')).toBe('/en/moderation');
  });

  it('shows earned verification access and a visible unread badge on the impact card', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        member: {
          email: 'trusted@example.is',
          provider: 'email',
          createdAt: '2026-07-01T12:00:00Z',
          deletionStatus: 'active',
          deletionRequestedAt: null
        },
        trustedVerification: { status: 'available', hasTasks: true },
        trustedVerificationFeedback: {
          status: 'available',
          value: { hasUnread: true }
        }
      }),
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Help keep places current' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See verification tasks' }).getAttribute('href')).toBe(
      '/en/account/keep-current'
    );
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See my impact' })).toBeTruthy();
  });

  it('shows the private eight-week trail oldest-to-newest with neutral open weeks', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        weeklyRhythmHistory: {
          status: 'available',
          weeks: [
            { startsOn: '2026-05-25', endsOn: '2026-05-31', current: false, active: false },
            { startsOn: '2026-06-01', endsOn: '2026-06-07', current: false, active: true },
            { startsOn: '2026-06-08', endsOn: '2026-06-14', current: false, active: false },
            { startsOn: '2026-06-15', endsOn: '2026-06-21', current: false, active: true },
            { startsOn: '2026-06-22', endsOn: '2026-06-28', current: false, active: true },
            { startsOn: '2026-06-29', endsOn: '2026-07-05', current: false, active: false },
            { startsOn: '2026-07-06', endsOn: '2026-07-12', current: false, active: true },
            { startsOn: '2026-07-13', endsOn: '2026-07-19', current: true, active: true }
          ]
        }
      }),
      form: null
    } as never);

    const history = document.querySelector('[data-weekly-rhythm-history]');
    expect(history?.getAttribute('data-state')).toBe('available');
    const weeks = [...(history?.querySelectorAll('[data-week-start]') ?? [])];
    expect(weeks).toHaveLength(8);
    expect(weeks[0]?.getAttribute('data-week-start')).toBe('2026-05-25');
    expect(weeks[7]?.getAttribute('data-week-start')).toBe('2026-07-13');
    expect(weeks[0]?.getAttribute('data-state')).toBe('open');
    expect(weeks[7]?.getAttribute('data-state')).toBe('active');
    expect(screen.getByText('Your eight-week trail')).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.queryByText(/failed|missed|reset/i)).toBeNull();
  });

  it('keeps weekly history failure private and reassuring', () => {
    render(AccountPage, {
      params: { lang: 'is' },
      data: signedInData({
        lang: 'is',
        copy: catalogues.is,
        returnTo: '/is',
        weeklyRhythmHistory: { status: 'unavailable' }
      }),
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Átta vikna slóðin þín' })).toBeTruthy();
    expect(
      screen.getByText('Það tekur augnablik að hlaða slóðina þína. Virknin þín er áfram varðveitt.')
    ).toBeTruthy();
  });
});
