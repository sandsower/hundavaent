import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import type { MyAchievement, MyAchievements } from '$server/achievements/achievements';
import AchievementsPage from '../../src/routes/[lang=lang]/account/achievements/+page.svelte';

const catalogue: MyAchievement[] = [
  {
    key: 'first_favourite',
    group: 'participation',
    displayOrder: 1,
    nameIs: 'Fyrsti vistaði staðurinn',
    nameEn: 'First Favourite',
    descriptionIs: 'Þú vistaðir stað í fyrsta sinn.',
    descriptionEn: 'You saved a place for the first time.',
    earnedAt: '2026-07-01T12:00:00Z',
    isNew: true
  },
  {
    key: 'first_checkin',
    group: 'participation',
    displayOrder: 2,
    nameIs: 'Fyrsta innritunin',
    nameEn: 'First Check-in',
    descriptionIs: 'Þú skráðir heimsókn í fyrsta sinn.',
    descriptionEn: 'You recorded a visit for the first time.',
    earnedAt: '2026-06-15T09:00:00Z',
    isNew: false
  },
  {
    key: 'explorer_ten_places',
    group: 'exploration',
    displayOrder: 3,
    nameIs: 'Landkönnuður',
    nameEn: 'Explorer',
    descriptionIs: 'Heimsæktu tíu ólíka staði.',
    descriptionEn: 'Visit ten different places.',
    earnedAt: null,
    isNew: false
  },
  {
    key: 'one_year_member',
    group: 'longevity',
    displayOrder: 4,
    nameIs: 'Ár með Hundavænt',
    nameEn: 'A year with Hundavænt',
    descriptionIs: 'Virk þátttaka í heilt ár.',
    descriptionEn: 'Active for a whole year.',
    earnedAt: null,
    isNew: false
  }
];

const enabledData: MyAchievements = { enabled: true, achievements: catalogue };

describe('Member Achievements view', () => {
  it.each([
    ['is', 'Afrekin þín', 'Fyrsti vistaði staðurinn', 'Nýtt'],
    ['en', 'Your Achievements', 'First Favourite', 'New']
  ] as const)(
    'shows earned recognition without a catalogue of locked items in %s',
    (lang, heading, firstName, newBadge) => {
      render(AchievementsPage, {
        params: { lang },
        data: { lang, copy: catalogues[lang], achievements: enabledData }
      } as never);

      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByText(firstName)).toBeTruthy();

      // Exactly one newly-earned marker: the badge appears on the isNew unlock and nowhere else.
      expect(screen.getAllByText(newBadge)).toHaveLength(1);

      expect(screen.queryByText(lang === 'en' ? 'Explorer' : 'Landkönnuður')).toBeNull();
      expect(
        screen.queryByText(lang === 'en' ? 'A year with Hundavænt' : 'Ár með Hundavænt')
      ).toBeNull();
      expect(document.body.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(document.body.textContent).not.toMatch(/\d+\s*(more|needed|left|eftir)\b/i);

      const groupHeadings = screen
        .getAllByRole('heading', { level: 2 })
        .map((element) => element.textContent);
      expect(groupHeadings).toEqual([catalogues[lang]['achievements.group.participation']]);
    }
  );

  it('shows an earned date for earned entries and none for locked ones', () => {
    render(AchievementsPage, {
      params: { lang: 'en' },
      data: { lang: 'en', copy: catalogues.en, achievements: enabledData }
    } as never);

    const earnedLines = screen.getAllByText(/^Earned /);
    expect(earnedLines).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Not earned yet');
  });

  it('renders no "new" badge once every unlock has been acknowledged', () => {
    render(AchievementsPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        achievements: {
          enabled: true,
          achievements: catalogue.map((achievement) => ({ ...achievement, isNew: false }))
        }
      }
    } as never);

    expect(screen.queryByText('New')).toBeNull();
  });

  it.each([
    ['is', 'Afrek eru ekki í boði enn þá.'],
    ['en', 'Achievements are not available yet.']
  ] as const)(
    'renders only the fail-closed message while the feature is dark in %s',
    (lang, message) => {
      render(AchievementsPage, {
        params: { lang },
        data: {
          lang,
          copy: catalogues[lang],
          achievements: { enabled: false, achievements: [] }
        }
      } as never);

      expect(screen.getByText(message)).toBeTruthy();
      // The catalogue never leaks through the disabled state - not even entry names.
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
      expect(screen.queryByRole('list')).toBeNull();
    }
  );
});
