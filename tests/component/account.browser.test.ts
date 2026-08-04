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
    // The featured card only mentions Achievements when a tier is genuinely close; without
    // facts it says nothing about them at all.
    expect(screen.queryByRole('link', { name: /Achievement/ })).toBeNull();
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
    // Without facts the featured card never teases or even mentions Achievements.
    expect(screen.queryByText(/next Achievement/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Achievement/ })).toBeNull();
    // And without a snapshot the card falls back to the standing promise about the record.
    expect(
      screen.getByText(
        'A private, lasting record of the ways you have helped Hundavænt stay useful.'
      )
    ).toBeTruthy();
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

  it('leads the featured card with the confirmed count and one live outcome as proof', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        impactSnapshot: {
          status: 'available',
          value: {
            confirmedContributions: 3,
            recentOutcomes: [
              // A revoked outcome is not proof of anything, even when it is the most recent.
              {
                contributionId: '94800000-0000-4000-8000-000000000401',
                kind: 'accepted_suggestion',
                state: 'revoked',
                confirmedAt: '2026-07-22T10:00:00Z',
                revokedAt: '2026-07-23T10:00:00Z',
                subjectPlaceId: '94800000-0000-4000-8000-000000000201',
                placeName: 'Gamla búðin',
                availability: 'inactive',
                successorPlaceId: null,
                successorName: null,
                successorAvailable: false,
                suggestionId: '94800000-0000-4000-8000-000000000301',
                placeFlagId: null
              },
              {
                contributionId: '94800000-0000-4000-8000-000000000402',
                kind: 'applied_correction',
                state: 'confirmed',
                confirmedAt: '2026-07-20T10:00:00Z',
                revokedAt: null,
                subjectPlaceId: '94800000-0000-4000-8000-000000000202',
                placeName: 'Hlemmur Mathöll',
                availability: 'available',
                successorPlaceId: null,
                successorName: null,
                successorAvailable: false,
                suggestionId: null,
                placeFlagId: '94800000-0000-4000-8000-000000000302'
              }
            ]
          }
        }
      }),
      form: null
    } as never);

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('confirmed useful contributions')).toBeTruthy();
    expect(screen.getByText(/Your Correction to Hlemmur Mathöll is live/)).toBeTruthy();
    expect(screen.getByText('20 July 2026')).toBeTruthy();
    expect(screen.queryByText(/Gamla búðin/)).toBeNull();
    // With a live snapshot the card leads with evidence, not the standing promise.
    expect(
      screen.queryByText(
        'A private, lasting record of the ways you have helped Hundavænt stay useful.'
      )
    ).toBeNull();
  });

  it('uses singular wording for a single confirmed contribution', () => {
    render(AccountPage, {
      params: { lang: 'en' },
      data: signedInData({
        impactSnapshot: {
          status: 'available',
          value: { confirmedContributions: 1, recentOutcomes: [] }
        }
      }),
      form: null
    } as never);

    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('confirmed useful contribution')).toBeTruthy();
    expect(screen.queryByText('confirmed useful contributions')).toBeNull();
  });

  it('keeps an impact snapshot failure private and falls back to the localized promise', () => {
    render(AccountPage, {
      params: { lang: 'is' },
      data: signedInData({
        lang: 'is',
        copy: catalogues.is,
        returnTo: '/is',
        impactSnapshot: { status: 'unavailable' }
      }),
      form: null
    } as never);

    expect(
      screen.getByText('Varanlegt einkayfirlit yfir það sem þú hefur gert Hundavænt gagnlegra.')
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sjá áhrifin mín' })).toBeTruthy();
  });
});
