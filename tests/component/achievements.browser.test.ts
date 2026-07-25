import { render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import type {
  ClaimedAchievement,
  EarnedBespokeAchievement,
  MyAchievement,
  MyAchievements
} from '$server/achievements/achievements';
import AchievementsPage from '../../src/routes/[lang=lang]/account/achievements/+page.svelte';

const earned: EarnedBespokeAchievement = {
  kind: 'earned',
  entry: 'bespoke',
  key: 'first_favourite',
  group: 'participation',
  displayOrder: 1,
  nameIs: 'Fyrsta uppáhaldið',
  nameEn: 'First Favourite',
  descriptionIs: 'Þú vistaðir þinn fyrsta stað sem uppáhald.',
  descriptionEn: 'You saved your first Place as a Favourite.',
  earnedAt: '2026-07-01T12:00:00Z'
};

const categoryCollection = {
  collection: 'place_categories',
  collectionNameIs: 'Flokkar',
  collectionNameEn: 'Categories',
  collectionDescriptionIs: 'Flokkar staða sem þú hefur innritað þig á.',
  collectionDescriptionEn: 'Categories of Place you have checked in at.',
  group: 'exploration'
} as const;

// One full collection: bronze earned, silver started, gold untouched. The untouched cell is the
// visible gap the phase exists to show.
const tiers: MyAchievement[] = [
  {
    ...categoryCollection,
    kind: 'earned',
    entry: 'tier',
    key: 'place_categories_bronze',
    displayOrder: 14,
    tier: 'bronze',
    earnedAt: '2026-07-02T12:00:00Z'
  },
  {
    ...categoryCollection,
    kind: 'locked',
    entry: 'tier',
    key: 'place_categories_silver',
    displayOrder: 15,
    tier: 'silver',
    earnedAt: null,
    progress: { kind: 'credited_categories', current: 2, target: 3 }
  },
  {
    ...categoryCollection,
    kind: 'locked',
    entry: 'tier',
    key: 'place_categories_gold',
    displayOrder: 16,
    tier: 'gold',
    earnedAt: null,
    progress: { kind: 'credited_categories', current: 0, target: 4 }
  }
];

const claimedTier: ClaimedAchievement = {
  kind: 'earned',
  entry: 'tier',
  key: 'place_categories_bronze',
  group: 'exploration',
  displayOrder: 14,
  collection: 'place_categories',
  tier: 'bronze',
  collectionNameIs: 'Flokkar',
  collectionNameEn: 'Categories',
  progressKind: 'credited_categories',
  progressTarget: 2,
  earnedAt: '2026-07-02T12:00:00Z'
};

const enabledData: MyAchievements = {
  enabled: true,
  achievements: [earned, ...tiers]
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Member Achievements view', () => {
  it.each([
    ['is', 'Afrekin þín', 'Söfn', '2 af 3 flokkum', 'Brons', 'Þarf 4'],
    ['en', 'Your Achievements', 'Collections', '2 of 3 categories', 'Bronze', 'Needs 4']
  ] as const)(
    'shows every tier of a collection, including the untouched gap, in %s',
    (lang, title, collectionsHeading, startedProgress, bronzeLabel, goldTarget) => {
      renderPage(lang);

      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(screen.getByRole('heading', { name: collectionsHeading })).toBeTruthy();
      expect(screen.getByText(startedProgress)).toBeTruthy();
      expect(screen.getByText(bronzeLabel)).toBeTruthy();
      // The gold tier has no progress at all and is still shown, advertising its threshold.
      expect(screen.getByText(goldTarget)).toBeTruthy();
      expect(document.querySelectorAll('[data-achievement-tier]')).toHaveLength(3);
    }
  );

  it('marks only started tiers as progressbars, so an untouched gap adds no screen-reader noise', () => {
    renderPage('en');

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(document.querySelector('[data-tier-state="locked"]')).toBeTruthy();
    expect(document.querySelector('[data-tier-state="started"]')).toBeTruthy();
    expect(document.querySelector('[data-tier-state="earned"]')).toBeTruthy();
  });

  it('renders a claimed tier celebration with copy derived from its collection and threshold', () => {
    renderPage('en', [claimedTier]);

    const celebration = screen.getByRole('region', {
      name: 'New achievement: Categories - Bronze'
    });
    expect(within(celebration).getByText('Achievement unlocked')).toBeTruthy();
    expect(within(celebration).getByText('Categories - Bronze')).toBeTruthy();
    expect(
      within(celebration).getByText('Check in at places across 2 categories.')
    ).toBeTruthy();
    expect(celebration.querySelector('[data-achievement-icon]')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
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

    renderPage('en', [claimedTier]);

    const celebration = screen.getByRole('region', {
      name: 'New achievement: Categories - Bronze'
    });
    expect(celebration.getAttribute('data-reduced-motion')).toBe('true');
    expect(getComputedStyle(celebration).animationName).toBe('none');
    expect(within(celebration).getByText('Achievement unlocked')).toBeTruthy();
  });

  it('keeps the bespoke archive separate from the collections grid', () => {
    renderPage('en');

    const archive = screen.getByRole('heading', { name: 'Your trail so far' });
    expect(archive).toBeTruthy();
    expect(screen.getByText('First Favourite')).toBeTruthy();
    // A tier never appears in the archive; it belongs to the grid where its gaps are visible.
    expect(screen.queryByText('Recognized for Quality')).toBeNull();
  });

  it('keeps icons decorative while adjacent text names every collection and progress concept', () => {
    renderPage('en');

    for (const icon of document.querySelectorAll('[data-achievement-icon]')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getByText('First Favourite')).toBeTruthy();
    expect(screen.getByText('Categories')).toBeTruthy();
    expect(screen.getByText('2 of 3 categories')).toBeTruthy();
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
      expect(document.querySelector('[data-achievement-tier]')).toBeNull();
    }
  );
});

function renderPage(lang: 'is' | 'en', claimed: ClaimedAchievement[] = []) {
  return render(AchievementsPage, {
    params: { lang },
    data: { lang, copy: catalogues[lang], achievements: enabledData },
    form: {
      action: 'claimAchievements',
      claimed
    }
  } as never);
}
