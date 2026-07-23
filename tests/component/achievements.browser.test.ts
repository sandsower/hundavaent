import { render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import type {
  EarnedAchievement,
  MyAchievement,
  MyAchievements
} from '$server/achievements/achievements';
import AchievementsPage from '../../src/routes/[lang=lang]/account/achievements/+page.svelte';

const earned: EarnedAchievement = {
  key: 'first_favourite',
  group: 'participation',
  displayOrder: 1,
  nameIs: 'Fyrsta uppáhaldið',
  nameEn: 'First Favourite',
  descriptionIs: 'Þú vistaðir þinn fyrsta stað sem uppáhald.',
  descriptionEn: 'You saved your first Place as a Favourite.',
  earnedAt: '2026-07-01T12:00:00Z',
  kind: 'earned'
};

const milestones: MyAchievement[] = [
  {
    key: 'category_curious',
    group: 'exploration',
    displayOrder: 5,
    nameIs: 'Forvitinn um flokka',
    nameEn: 'Category Curious',
    descriptionIs: 'Þú kannar ólíka staðaflokka.',
    descriptionEn: 'You are exploring different kinds of Places.',
    earnedAt: null,
    kind: 'milestone',
    progress: { kind: 'credited_categories', current: 2, target: 4 }
  },
  {
    key: 'capital_region_wanderer',
    group: 'exploration',
    displayOrder: 6,
    nameIs: 'Flakkari höfuðborgarsvæðisins',
    nameEn: 'Capital Region Wanderer',
    descriptionIs: 'Þú kannar sveitarfélög á höfuðborgarsvæðinu.',
    descriptionEn: 'You are exploring municipalities across the capital region.',
    earnedAt: null,
    kind: 'milestone',
    progress: { kind: 'credited_municipalities', current: 2, target: 3 }
  }
];

const enabledData: MyAchievements = {
  enabled: true,
  achievements: [earned, ...milestones]
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Member Achievements view', () => {
  it.each([
    ['is', 'Afrekin þín', 'Næst á leiðinni', '2 af 4 flokkum', '2 af 3 sveitarfélögum'],
    ['en', 'Your Achievements', 'Next on your trail', '2 of 4 categories', '2 of 3 municipalities']
  ] as const)(
    'shows the earned archive and no more than two selected milestones in %s',
    (lang, title, nextHeading, categoryProgress, municipalityProgress) => {
      renderPage(lang);

      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(screen.getByRole('heading', { name: nextHeading })).toBeTruthy();
      expect(screen.getByText(categoryProgress)).toBeTruthy();
      expect(screen.getByText(municipalityProgress)).toBeTruthy();
      expect(screen.getAllByRole('progressbar')).toHaveLength(2);
      expect(
        screen.getByText(lang === 'is' ? 'Fyrsta uppáhaldið' : 'First Favourite')
      ).toBeTruthy();
      expect(screen.queryByText('Place Explorer')).toBeNull();
      expect(screen.queryByText('Recognized for Quality')).toBeNull();
      expect(document.querySelectorAll('[data-achievement-milestone]')).toHaveLength(2);
    }
  );

  it('renders a claimed Achievement as a rich non-blocking celebration and persistent earned item', () => {
    renderPage('en', [earned]);

    const celebration = screen.getByRole('region', { name: 'New achievement: First Favourite' });
    expect(within(celebration).getByText('Achievement unlocked')).toBeTruthy();
    expect(within(celebration).getByText('First Favourite')).toBeTruthy();
    expect(celebration.querySelector('[data-achievement-icon]')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText('First Favourite')).toHaveLength(2);
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('keeps the same celebration content while removing staged motion for reduced-motion users', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        }) satisfies MediaQueryList
    );

    renderPage('en', [earned]);

    const celebration = screen.getByRole('region', { name: 'New achievement: First Favourite' });
    expect(celebration.getAttribute('data-reduced-motion')).toBe('true');
    expect(getComputedStyle(celebration).animationName).toBe('none');
    expect(within(celebration).getByText('Achievement unlocked')).toBeTruthy();
    expect(within(celebration).getByText('First Favourite')).toBeTruthy();
  });

  it('keeps icons decorative while adjacent text names every achievement and progress concept', () => {
    renderPage('en');

    for (const icon of document.querySelectorAll('[data-achievement-icon]')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getByText('First Favourite')).toBeTruthy();
    expect(screen.getByText('Category Curious')).toBeTruthy();
    expect(screen.getByText('2 of 4 categories')).toBeTruthy();
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
        },
        form: null
      } as never);

      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(document.querySelector('[data-achievement-celebration]')).toBeNull();
    }
  );
});

function renderPage(lang: 'is' | 'en', claimed: EarnedAchievement[] = []) {
  return render(AchievementsPage, {
    params: { lang },
    data: { lang, copy: catalogues[lang], achievements: enabledData },
    form: {
      action: 'claimAchievements',
      claimed
    }
  } as never);
}
