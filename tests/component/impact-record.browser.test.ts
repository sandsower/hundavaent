import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

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

  it('keeps both milestones visible after a long earned history without claiming anything', () => {
    renderPage('en');

    expect(screen.getByText('First Favourite')).toBeTruthy();
    expect(screen.getByText('Category Curious')).toBeTruthy();
    expect(screen.getByText('Capital Region Wanderer')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all Achievements' })).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();
    for (const icon of document.querySelectorAll('[data-impact-icon], [data-achievement-icon]')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
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
});

function renderPage(lang: 'is' | 'en', achievementsEnabled = true) {
  return render(ImpactPage, {
    params: { lang },
    data: {
      lang,
      copy: catalogues[lang],
      impact,
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
              key: 'first_accepted_contribution',
              group: 'contribution_quality',
              displayOrder: 4,
              nameIs: 'Fyrsta framlag',
              nameEn: 'First Contribution',
              descriptionIs: 'Framlag var samþykkt.',
              descriptionEn: 'A contribution was accepted.',
              kind: 'earned',
              earnedAt: '2026-07-01T12:00:00Z'
            },
            {
              key: 'category_curious',
              group: 'exploration',
              displayOrder: 5,
              nameIs: 'Forvitinn um flokka',
              nameEn: 'Category Curious',
              descriptionIs: 'Þú kannar flokka.',
              descriptionEn: 'You explore categories.',
              kind: 'milestone',
              earnedAt: null,
              progress: {
                kind: 'credited_categories',
                current: 2,
                target: 4
              }
            },
            {
              key: 'capital_region_wanderer',
              group: 'exploration',
              displayOrder: 6,
              nameIs: 'Flakkari á höfuðborgarsvæðinu',
              nameEn: 'Capital Region Wanderer',
              descriptionIs: 'Þú kannar sveitarfélög.',
              descriptionEn: 'You explore municipalities.',
              kind: 'milestone',
              earnedAt: null,
              progress: {
                kind: 'credited_municipalities',
                current: 2,
                target: 4
              }
            }
          ]
        }
      }
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
