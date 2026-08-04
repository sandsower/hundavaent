import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { page as browserPage } from 'vitest/browser';

import { catalogues } from '$i18n';
import type { ImpactRecord } from '$server/impact/impact-record';
import ImpactPage from '../../src/routes/[lang=lang]/account/impact/+page.svelte';

const impact: ImpactRecord = {
  memberSince: '2026-01-02T12:00:00Z',
  activeWeeks: 8,
  activeMonths: 3,
  creditedPlaces: 14,
  creditedCategoryGroups: 5,
  creditedMunicipalities: 4,
  validRatings: 7,
  submissionsTotal: 6,
  pendingSubmissions: 1,
  rejectedSubmissions: 1,
  resolvedWithoutContribution: 2,
  confirmedContributions: 3,
  revokedContributions: 1,
  recentOutcomes: [
    {
      contributionId: '94800000-0000-4000-8000-000000000401',
      kind: 'accepted_suggestion',
      state: 'confirmed',
      confirmedAt: '2026-07-24T10:00:00Z',
      revokedAt: null,
      subjectPlaceId: '94800000-0000-4000-8000-000000000201',
      placeName: 'Kaffihúsið',
      availability: 'available',
      successorPlaceId: null,
      successorName: null,
      successorAvailable: false,
      suggestionId: '94800000-0000-4000-8000-000000000301',
      placeFlagId: null
    },
    {
      contributionId: '94800000-0000-4000-8000-000000000402',
      kind: 'applied_correction',
      state: 'revoked',
      confirmedAt: '2026-07-20T10:00:00Z',
      revokedAt: '2026-07-22T10:00:00Z',
      subjectPlaceId: '94800000-0000-4000-8000-000000000202',
      placeName: 'Gamla búðin',
      availability: 'inactive',
      successorPlaceId: '94800000-0000-4000-8000-000000000203',
      successorName: 'Nýja búðin',
      successorAvailable: true,
      suggestionId: null,
      placeFlagId: '94800000-0000-4000-8000-000000000302'
    },
    {
      contributionId: '94800000-0000-4000-8000-000000000403',
      kind: 'confirmed_report',
      state: 'confirmed',
      confirmedAt: '2026-07-19T10:00:00Z',
      revokedAt: null,
      subjectPlaceId: '94800000-0000-4000-8000-000000000204',
      placeName: 'Eldri staður',
      availability: 'inactive',
      successorPlaceId: '94800000-0000-4000-8000-000000000205',
      successorName: 'Næsti staður',
      successorAvailable: false,
      suggestionId: null,
      placeFlagId: '94800000-0000-4000-8000-000000000303'
    }
  ]
};

describe('private impact record', () => {
  it.each([
    [
      'en',
      'Your impact',
      'Your rhythm',
      'Places explored',
      'Knowledge shared',
      'Useful contributions'
    ],
    [
      'is',
      'Áhrifin þín',
      'Takturinn þinn',
      'Staðir kannaðir',
      'Þekking sem þú deildir',
      'Gagnleg framlög'
    ]
  ] as const)(
    'renders the four balanced pillars and private framing in %s',
    (lang, title, rhythm, exploration, knowledge, contribution) => {
      renderPage(lang);

      expect(screen.getByRole('heading', { name: title, level: 1 })).toBeTruthy();
      expect(screen.getByRole('heading', { name: rhythm })).toBeTruthy();
      expect(screen.getByRole('heading', { name: exploration })).toBeTruthy();
      expect(screen.getByRole('heading', { name: knowledge })).toBeTruthy();
      expect(screen.getByRole('heading', { name: contribution })).toBeTruthy();
      expect(document.querySelectorAll('[data-impact-pillar]')).toHaveLength(4);
      expect(document.querySelectorAll('[data-impact-icon]')).not.toHaveLength(0);
      for (const metric of document.querySelectorAll('.metrics > div')) {
        expect(metric.children[0]?.tagName).toBe('DT');
        expect(metric.children[1]?.tagName).toBe('DD');
      }
      expect(
        screen.getByText(
          lang === 'en' ? 'Only you can see this page.' : 'Aðeins þú getur séð þessa síðu.'
        )
      ).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/leaderboard|top member|stigatafla|\bXP\b/i);
    }
  );

  it('shows confirmed and revoked outcomes honestly and links an inactive Place to its successor', () => {
    renderPage('en');

    const confirmed = document.querySelector('[data-outcome-state="confirmed"]');
    const revoked = document.querySelector('[data-outcome-state="revoked"]');
    expect(confirmed).toBeTruthy();
    expect(revoked).toBeTruthy();
    expect(within(confirmed as HTMLElement).getByText('Kaffihúsið')).toBeTruthy();
    expect(within(revoked as HTMLElement).getByText('Gamla búðin')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to Nýja búðin' }).getAttribute('href')).toBe(
      '/en?place=94800000-0000-4000-8000-000000000203'
    );
    expect(
      screen.getByText('Continues as Næsti staður, which is not currently available in discovery.')
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Næsti staður/ })).toBeNull();
    expect(within(revoked as HTMLElement).getByText('Revoked 22 July 2026')).toBeTruthy();
  });

  it('leads with confirmed impact and recent outcomes before participation detail', () => {
    renderPage('en');

    const backLink = document.querySelector('[data-impact-back]');
    const hero = document.querySelector('.impact-hero');
    const summary = document.querySelector('[data-impact-summary]');
    const outcomes = document.querySelector('[data-impact-outcomes]');
    const participation = document.querySelector('[data-impact-participation]');

    expect(backLink).toBeTruthy();
    expect(hero).toBeTruthy();
    expect(summary).toBeTruthy();
    expect(outcomes).toBeTruthy();
    expect(participation).toBeTruthy();
    expect(appearsBefore(backLink, hero)).toBe(true);
    expect(appearsBefore(summary, outcomes)).toBe(true);
    expect(appearsBefore(outcomes, participation)).toBe(true);
    expect(within(summary as HTMLElement).getByText('3')).toBeTruthy();
    expect(within(summary as HTMLElement).getByText('confirmed useful contributions')).toBeTruthy();
  });

  it('renders recent outcomes as an evenly sized desktop ledger', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };
    await browserPage.viewport(1280, 900);

    try {
      renderPage('en');

      const rows = [...document.querySelectorAll<HTMLElement>('.outcome-list > li')];
      const rectangles = rows.map((row) => row.getBoundingClientRect());

      expect(rows).toHaveLength(3);
      expect(Math.max(...rectangles.map(({ width }) => width))).toBeCloseTo(
        Math.min(...rectangles.map(({ width }) => width)),
        0
      );
      expect(Math.max(...rectangles.map(({ height }) => height))).toBeCloseTo(
        Math.min(...rectangles.map(({ height }) => height)),
        0
      );
      expect(new Set(rectangles.map(({ left }) => Math.round(left))).size).toBe(1);
      expect(rectangles[0].top).toBeLessThan(rectangles[1].top);
      expect(rectangles[1].top).toBeLessThan(rectangles[2].top);
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });

  it('uses singular contribution wording for a single confirmed contribution', () => {
    renderPage('en', true, undefined, {
      ...impact,
      confirmedContributions: 1
    });

    expect(screen.getByText('confirmed useful contribution')).toBeTruthy();
    expect(screen.queryByText('confirmed useful contributions')).toBeNull();
  });

  it('keeps participation compact while preserving all four detailed records', () => {
    renderPage('en');

    const pillars = [...document.querySelectorAll<HTMLElement>('[data-impact-pillar]')];

    expect(pillars).toHaveLength(4);
    for (const pillar of pillars) {
      expect(pillar.tagName).toBe('DETAILS');
      expect((pillar as HTMLDetailsElement).open).toBe(false);
      expect(pillar.querySelector('summary [data-pillar-snapshot]')).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: 'How you participate', level: 2 })).toBeTruthy();
  });

  // The catalogue read is uncapped, so this strip caps itself. Earned Achievements must keep their
  // place: an unbounded run of locked tiers would otherwise crowd every one of them out.
  it('shows the closest upcoming tiers without crowding out the earned history', () => {
    renderPage('en');

    expect(screen.getByText('First Favourite')).toBeTruthy();
    expect(screen.getByText('First Rating')).toBeTruthy();
    expect(screen.getByText('Categories - Silver')).toBeTruthy();
    expect(screen.getByText('Municipalities - Silver')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all Achievements' })).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();
    expect(
      within(document.querySelector('[data-achievement-kind="earned"]') as HTMLElement).getByRole(
        'heading',
        { name: 'Already earned' }
      )
    ).toBeTruthy();
    expect(
      within(document.querySelector('[data-achievement-kind="upcoming"]') as HTMLElement).getByRole(
        'heading',
        { name: 'Next on your trail' }
      )
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-achievement-kind="upcoming"] progress')).toHaveLength(
      2
    );
    expect(document.querySelectorAll('[data-achievement-badge]')).toHaveLength(4);
    for (const icon of document.querySelectorAll('[data-impact-icon], [data-achievement-icon]')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      if (icon.hasAttribute('data-achievement-icon')) {
        expect(icon.closest('[data-achievement-badge]')).toBeTruthy();
      }
    }
  });

  it('states honestly when Achievements are disabled', () => {
    renderPage('en', false);

    expect(
      screen.getByText('Achievements are not active right now. Your recorded impact is unaffected.')
    ).toBeTruthy();
    expect(
      screen.queryByText('Your first Achievement will appear here when you earn it.')
    ).toBeNull();
  });

  it('celebrates one unread confirmed verification without exposing it publicly', () => {
    renderPage('en', true, {
      status: 'available',
      value: {
        hasUnread: true,
        latestConfirmedAt: '2026-07-24T10:00:00Z',
        latestTaskKind: 'dog_amenities',
        latestPlaceId: '94800000-0000-4000-8000-000000000201'
      }
    });

    const celebration = screen.getByTestId('trusted-verification-celebration');
    expect(within(celebration).getByText('A fact you verified was confirmed')).toBeTruthy();
    expect(within(celebration).getByRole('button', { name: 'Got it' })).toBeTruthy();
    expect(
      within(celebration).getByRole('link', { name: 'See the updated place' }).getAttribute('href')
    ).toBe('/en?place=94800000-0000-4000-8000-000000000201');
    expect(celebration.querySelectorAll('.spark')).toHaveLength(3);
  });
});

function appearsBefore(earlier: Element | null, later: Element | null): boolean {
  return Boolean(
    earlier && later && earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING
  );
}

function renderPage(
  lang: 'is' | 'en',
  achievementsEnabled = true,
  trustedVerificationFeedback:
    | {
        status: 'available';
        value: {
          hasUnread: boolean;
          latestConfirmedAt: string | null;
          latestTaskKind: 'access_freshness' | 'dog_amenities' | null;
          latestPlaceId: string | null;
        };
      }
    | { status: 'unavailable' } = { status: 'unavailable' },
  impactRecord: ImpactRecord = impact
) {
  return render(ImpactPage, {
    params: { lang },
    data: {
      lang,
      copy: catalogues[lang],
      impact: impactRecord,
      rhythm: { status: 'available', weeks: weeklyRhythmWeeks() },
      contributor: {
        status: 'available',
        value: {
          status: 'contributor',
          policyVersion: 'v1',
          statusSince: '2026-06-01T12:00:00Z'
        }
      },
      achievements: {
        status: 'available',
        value: {
          enabled: achievementsEnabled,
          achievements: [
            {
              entry: 'bespoke',
              key: 'first_favourite',
              group: 'participation',
              displayOrder: 1,
              nameIs: 'Fyrsta uppáhaldið',
              nameEn: 'First Favourite',
              descriptionIs: 'Þú vistaðir stað.',
              descriptionEn: 'You saved a Place.',
              kind: 'earned',
              earnedAt: '2026-07-04T12:00:00Z'
            },
            {
              entry: 'bespoke',
              key: 'first_rating',
              group: 'participation',
              displayOrder: 2,
              nameIs: 'Fyrsta einkunn',
              nameEn: 'First Rating',
              descriptionIs: 'Þú gafst einkunn.',
              descriptionEn: 'You rated a Place.',
              kind: 'earned',
              earnedAt: '2026-07-03T12:00:00Z'
            },
            {
              entry: 'bespoke',
              key: 'first_checkin',
              group: 'participation',
              displayOrder: 3,
              nameIs: 'Fyrsta innritun',
              nameEn: 'First Check-in',
              descriptionIs: 'Þú skráðir innritun.',
              descriptionEn: 'You checked in.',
              kind: 'earned',
              earnedAt: '2026-07-02T12:00:00Z'
            },
            {
              kind: 'earned',
              entry: 'tier',
              key: 'contributions_bronze',
              group: 'contribution_quality',
              displayOrder: 20,
              collection: 'contributions',
              tier: 'bronze',
              collectionNameIs: 'Framlög',
              collectionNameEn: 'Contributions',
              collectionDescriptionIs: 'Framlög frá þér sem umsjónarmaður hefur staðfest.',
              collectionDescriptionEn: 'Contributions of yours confirmed by a Moderator.',
              earnedAt: '2026-07-01T12:00:00Z'
            },
            {
              kind: 'locked',
              entry: 'tier',
              key: 'place_categories_silver',
              group: 'exploration',
              displayOrder: 15,
              collection: 'place_categories',
              tier: 'silver',
              collectionNameIs: 'Flokkar',
              collectionNameEn: 'Categories',
              collectionDescriptionIs: 'Flokkar staða sem þú hefur innritað þig á.',
              collectionDescriptionEn: 'Categories of Place you have checked in at.',
              earnedAt: null,
              progress: {
                kind: 'credited_categories',
                current: 2,
                target: 3
              }
            },
            {
              kind: 'locked',
              entry: 'tier',
              key: 'municipalities_silver',
              group: 'exploration',
              displayOrder: 18,
              collection: 'municipalities',
              tier: 'silver',
              collectionNameIs: 'Sveitarfélög',
              collectionNameEn: 'Municipalities',
              collectionDescriptionIs: 'Sveitarfélög þar sem þú hefur innritað þig.',
              collectionDescriptionEn: 'Municipalities where you have checked in.',
              earnedAt: null,
              progress: {
                kind: 'credited_municipalities',
                current: 2,
                target: 4
              }
            }
          ]
        }
      },
      trustedVerificationFeedback
    },
    form: null
  } as never);
}

function weeklyRhythmWeeks() {
  return Array.from({ length: 8 }, (_, index) => {
    const startsAt = new Date('2026-06-01T00:00:00Z');
    startsAt.setUTCDate(startsAt.getUTCDate() + index * 7);
    const endsAt = new Date(startsAt);
    endsAt.setUTCDate(endsAt.getUTCDate() + 6);
    return {
      startsOn: startsAt.toISOString().slice(0, 10),
      endsOn: endsAt.toISOString().slice(0, 10),
      current: index === 7,
      active: index % 2 === 0
    };
  });
}
