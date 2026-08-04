import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { page as browserPage } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import type {
  ClaimedAchievement,
  EarnedBespokeAchievement,
  MyAchievement,
  MyAchievements
} from '$server/achievements/achievements';
import AchievementsPage from '../../src/routes/[lang=lang]/account/achievements/+page.svelte';
import AchievementCollectionGrid from '$lib/achievements/AchievementCollectionGrid.svelte';
import '../../src/app.css';

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
  collectionNameIs: 'Fjölbreytt spor',
  collectionNameEn: 'Mixing It Up',
  collectionDescriptionIs: 'Fjölbreytni staða sem þú hefur heimsótt.',
  collectionDescriptionEn: 'Different kinds of places you have visited.',
  group: 'exploration'
} as const;

// One full collection: bronze earned, silver started, gold and Platinum untouched. The untouched
// cells prove every future rung remains visible.
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
  },
  {
    ...categoryCollection,
    kind: 'locked',
    entry: 'tier',
    key: 'place_categories_platinum',
    displayOrder: 17,
    tier: 'platinum',
    earnedAt: null,
    progress: { kind: 'credited_categories', current: 0, target: 5 }
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
  collectionNameIs: 'Fjölbreytt spor',
  collectionNameEn: 'Mixing It Up',
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
    [
      'is',
      'Afrekin þín',
      'Áfangar',
      'Takk fyrir að gera Hundavænt betra.',
      'Skráðar heimsóknir með stuttu millibili teljast ein heimsókn.',
      'Flokkar: 2/3',
      'Brons',
      'Platína',
      '4 flokkar',
      categoryCollection.collectionDescriptionIs
    ],
    [
      'en',
      'Your Achievements',
      'Milestones',
      'Thanks for making Hundavænt better.',
      'Check-ins close together count once.',
      '2 of 3 categories',
      'Bronze',
      'Platinum',
      '4 categories',
      categoryCollection.collectionDescriptionEn
    ]
  ] as const)(
    'keeps the first-time guidance lean while showing every tier in %s',
    (
      lang,
      title,
      collectionsHeading,
      intro,
      spacingNote,
      startedProgress,
      bronzeLabel,
      platinumLabel,
      goldTarget,
      repeatedDescription
    ) => {
      renderPage(lang);

      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(screen.getByRole('heading', { name: collectionsHeading })).toBeTruthy();
      expect(screen.getByText(intro)).toBeTruthy();
      expect(screen.getByText(spacingNote)).toBeTruthy();
      expect(screen.queryByText(repeatedDescription)).toBeNull();
      expect(screen.getByText(startedProgress)).toBeTruthy();
      expect(screen.getByText(bronzeLabel)).toBeTruthy();
      expect(screen.getByText(platinumLabel)).toBeTruthy();
      // The gold tier has no progress at all and is still shown, advertising its threshold.
      expect(screen.getByText(goldTarget)).toBeTruthy();
      expect(document.querySelectorAll('[data-achievement-tier]')).toHaveLength(4);
    }
  );

  it('marks only started tiers as progressbars, so an untouched gap adds no screen-reader noise', () => {
    renderPage('en');

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(document.querySelector('[data-tier-state="locked"]')).toBeTruthy();
    expect(document.querySelector('[data-tier-state="started"]')).toBeTruthy();
    expect(document.querySelector('[data-tier-state="earned"]')).toBeTruthy();
  });

  it('renders every current Achievement as a padded woven rosette with structural tier rings', () => {
    renderPage('en');

    const badges = document.querySelectorAll<HTMLElement>('[data-achievement-badge]');
    expect(badges).toHaveLength(5);

    for (const badge of badges) {
      expect(badge.getAttribute('data-badge-shape')).toBe('woven-rosette');
      const motif = badge.querySelector<HTMLElement>('[data-badge-motif]');
      expect(motif).toBeTruthy();
      if (!motif) continue;

      const badgeBounds = badge.getBoundingClientRect();
      const motifBounds = motif.getBoundingClientRect();
      expect(motifBounds.width / badgeBounds.width).toBeLessThanOrEqual(0.32);
      expect(motifBounds.height / badgeBounds.height).toBeLessThanOrEqual(0.32);
    }

    const bronze = document.querySelector('[data-achievement-tier="bronze"]');
    const silver = document.querySelector('[data-achievement-tier="silver"]');
    const gold = document.querySelector('[data-achievement-tier="gold"]');
    const platinum = document.querySelector('[data-achievement-tier="platinum"]');

    expect(bronze?.querySelectorAll('[data-badge-ring]')).toHaveLength(1);
    expect(silver?.querySelectorAll('[data-badge-ring]')).toHaveLength(2);
    expect(gold?.querySelectorAll('[data-badge-ring]')).toHaveLength(2);
    expect(platinum?.querySelectorAll('[data-badge-ring]')).toHaveLength(3);
    expect(gold?.querySelector('[data-badge-raised-edge]')).toBeTruthy();
    expect(platinum?.querySelector('[data-badge-raised-edge]')).toBeTruthy();

    for (const icon of document.querySelectorAll('[data-achievement-icon]')) {
      expect(icon.closest('[data-achievement-badge]')).toBeTruthy();
    }
  });

  it('gives every collection card the design-system panel inset', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };

    try {
      await browserPage.viewport(390, 844);
      renderPage('en');

      const collection = screen.getByRole('listitem', { name: 'Mixing It Up' });
      const style = getComputedStyle(collection);

      expect(style.paddingBlockStart).toBe('16px');
      expect(style.paddingBlockEnd).toBe('16px');
      expect(style.paddingInlineStart).toBe('16px');
      expect(style.paddingInlineEnd).toBe('16px');
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });

  it('renders a claimed tier celebration with copy derived from its collection and threshold', () => {
    renderPage('en', [claimedTier]);

    const celebration = screen.getByRole('region', {
      name: 'New achievement: Mixing It Up - Bronze'
    });
    expect(within(celebration).getByText('Nicely done')).toBeTruthy();
    expect(within(celebration).getByText('Mixing It Up - Bronze')).toBeTruthy();
    expect(within(celebration).getByText('Check in at places across 2 categories.')).toBeTruthy();
    expect(
      celebration.querySelector(
        '[data-achievement-badge][data-badge-state="earned"][data-badge-tier="bronze"]'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stamps the paw onto the dashed orbit at desktop and mobile widths', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };

    try {
      await browserPage.viewport(1280, 900);
      renderPage('en', [claimedTier]);
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));

      const celebration = screen.getByRole('region', {
        name: 'New achievement: Mixing It Up - Bronze'
      });
      expectPawToSitOnOrbit(celebration);

      await browserPage.viewport(390, 844);
      expectPawToSitOnOrbit(celebration);
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });

  it('keeps the same celebration content for reduced-motion users', () => {
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
      name: 'New achievement: Mixing It Up - Bronze'
    });
    expect(celebration.getAttribute('data-reduced-motion')).toBe('true');
    // The CSS reduce contract (travelling halves at zero duration, fade halves at full) is
    // asserted in tests/evaluation/a11y.spec.ts, where emulateMedia drives the real media
    // query; this harness never loads app.css, so computed animation values are meaningless.
    expect(within(celebration).getByText('Nicely done')).toBeTruthy();
  });

  it('keeps the bespoke archive separate from the collections grid', () => {
    renderPage('en');

    const archive = screen.getByRole('heading', { name: 'Your trail so far' });
    expect(archive).toBeTruthy();
    expect(screen.getByText('First Favourite')).toBeTruthy();
    // A tier never appears in the archive; it belongs to the grid where its gaps are visible.
    expect(screen.queryByText('Recognized for Quality')).toBeNull();
  });

  it('opens a share preview for every earned achievement', async () => {
    renderPage('en');

    const shareButtons = screen.getAllByRole('button', { name: 'Share' });
    expect(shareButtons).toHaveLength(2);
    await fireEvent.click(shareButtons[0]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Share your achievement' })).toBeTruthy();
    expect(within(dialog).getByRole('img').getAttribute('src')).toContain('data:image/svg+xml');
    expect(within(dialog).getByRole('button', { name: 'Share image' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Download image' })).toBeTruthy();
  });

  it('continues Gold exploration as a moving percentage and Platinum contributions as milestones', () => {
    const continuationAchievements: MyAchievement[] = [
      {
        kind: 'earned',
        entry: 'tier',
        key: 'explorer_places_gold',
        group: 'exploration',
        displayOrder: 13,
        collection: 'explorer_places',
        tier: 'gold',
        collectionNameIs: 'Á ferðinni',
        collectionNameEn: 'Going Places',
        collectionDescriptionIs: 'Mismunandi staðir sem þú hefur heimsótt.',
        collectionDescriptionEn: 'Different places you have visited.',
        earnedAt: '2026-07-01T12:00:00Z'
      },
      {
        kind: 'locked',
        entry: 'tier',
        key: 'explorer_places_platinum',
        group: 'exploration',
        displayOrder: 14,
        collection: 'explorer_places',
        tier: 'platinum',
        collectionNameIs: 'Á ferðinni',
        collectionNameEn: 'Going Places',
        collectionDescriptionIs: 'Mismunandi staðir sem þú hefur heimsótt.',
        collectionDescriptionEn: 'Different places you have visited.',
        earnedAt: null,
        progress: { kind: 'credited_place_coverage', current: 93, target: 100 }
      },
      {
        kind: 'earned',
        entry: 'tier',
        key: 'contributions_platinum',
        group: 'contribution_quality',
        displayOrder: 26,
        collection: 'contributions',
        tier: 'platinum',
        collectionNameIs: 'Leggja loppu til',
        collectionNameEn: 'Lending a Paw',
        collectionDescriptionIs: 'Framlög frá þér sem umsjónarmaður hefur staðfest.',
        collectionDescriptionEn: 'Contributions of yours confirmed by a Moderator.',
        earnedAt: '2026-07-01T12:00:00Z'
      }
    ];

    render(AchievementCollectionGrid, {
      achievements: continuationAchievements,
      lang: 'en',
      copy: catalogues.en,
      progress: [
        {
          collection: 'explorer_places',
          progressKind: 'credited_place_coverage',
          current: 15,
          total: 16,
          nextMilestone: null
        },
        {
          collection: 'contributions',
          progressKind: 'confirmed_contributions',
          current: 61,
          total: null,
          nextMilestone: 100
        }
      ]
    });

    expect(screen.getByText('93% explored')).toBeTruthy();
    expect(screen.getByText('61 contributions · next celebration at 100')).toBeTruthy();
  });

  it('keeps icons decorative while adjacent text names every collection and progress concept', () => {
    renderPage('en');

    for (const icon of document.querySelectorAll('[data-achievement-icon]')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getByText('First Favourite')).toBeTruthy();
    expect(screen.getByText('Mixing It Up')).toBeTruthy();
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
      claimed,
      continuations: []
    }
  } as never);
}

function expectPawToSitOnOrbit(celebration: HTMLElement) {
  const orbit = celebration.querySelector<HTMLElement>('.orbit');
  const paw = celebration.querySelector<HTMLElement>('.paw');

  expect(orbit).toBeTruthy();
  expect(paw).toBeTruthy();
  if (!orbit || !paw) return;

  const orbitBounds = orbit.getBoundingClientRect();
  const pawBounds = paw.getBoundingClientRect();
  const orbitCenter = {
    x: orbitBounds.left + orbitBounds.width / 2,
    y: orbitBounds.top + orbitBounds.height / 2
  };
  const pawCenter = {
    x: pawBounds.left + pawBounds.width / 2,
    y: pawBounds.top + pawBounds.height / 2
  };
  const radius = orbitBounds.width / 2;
  const distanceFromCenter = Math.hypot(pawCenter.x - orbitCenter.x, pawCenter.y - orbitCenter.y);

  expect(Math.abs(distanceFromCenter - radius)).toBeLessThan(2);
}
