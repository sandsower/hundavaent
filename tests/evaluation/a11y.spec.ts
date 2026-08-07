import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { evaluationFixtureIds, evaluationModerator } from './fixtures';
import { expect, test, type EvaluationEvidenceRecorder } from './evidence-fixture';
import {
  clearLocalCheckIns,
  clearLocalEvaluationMailbox,
  clearLocalPlaceMedia,
  configureLocalAchievementPolicy,
  configureLocalDogFriendlinessSummaryPolicy,
  configureLocalPlaceFlagAbusePolicy,
  configureLocalPrivateRatingNotePolicy,
  disableLocalAchievementPolicy,
  disableLocalDogFriendlinessSummaryPolicy,
  disableLocalPrivateRatingNotePolicy,
  localDogFriendlinessFixture,
  localPlaceFlagFixtures,
  localPrivateRatingNoteFixture,
  provisionLocalAchievementUnlock,
  provisionLocalAchievementProgress,
  provisionLocalDogFriendlinessFixture,
  provisionLocalModerator,
  provisionLocalPlaceFlagFixtures,
  provisionLocalPlaceFlagReviewFixture,
  provisionLocalPrivateRatingNoteFixture,
  provisionLocalSuggestionFixture,
  provisionLocalWeeklyRoundupFixtures,
  retireLocalDogFriendlinessFixture,
  retireLocalAchievementProgress,
  retireLocalPlaceFlagFixtures,
  retireLocalPrivateRatingNoteFixture,
  setLocalPlaceLifecycle,
  waitForLocalMagicLink
} from '../e2e/support/local-supabase';
import { waitForHydration } from '../e2e/support/hydration';
import { fixturePngFile } from '../e2e/support/fixture-image';

async function expectNoSeriousAxeViolations(
  page: Page,
  evidence: EvaluationEvidenceRecorder
): Promise<void> {
  evidence.require('axe');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  evidence.recordAxe(result.violations.length);
  const serious = result.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious'
  );
  expect(serious).toEqual([]);
}

const moderationWorkspaceCopy = {
  en: {
    heading: 'Moderation board',
    queueNavigation: 'Moderation queues',
    selectedQueue: 'Selected moderation queue',
    selectedItem: 'Selected moderation item',
    suggestions: 'Suggestions',
    candidatePlaces: 'Candidate places',
    candidateChecklist: 'Publication checklist',
    empty: 'Queue complete',
    decisionControls: 'Decision controls',
    needsInformation: 'Needs information',
    memberReasonIs: 'Member explanation in Icelandic',
    memberReasonEn: 'Member explanation in English',
    nextSuggestion: 'Next Visual Suggestion'
  },
  is: {
    heading: 'Umsjónarborð',
    queueNavigation: 'Yfirferðarlistar',
    selectedQueue: 'Valinn yfirferðarlisti',
    selectedItem: 'Valið atriði til yfirferðar',
    suggestions: 'Tillögur',
    candidatePlaces: 'Tillögur að stöðum',
    candidateChecklist: 'Atriði fyrir birtingu',
    empty: 'Yfirferðarlisti afgreiddur',
    decisionControls: 'Ákvörðunarvalkostir',
    needsInformation: 'Vantar upplýsingar',
    memberReasonIs: 'Skýring til meðlims á íslensku',
    memberReasonEn: 'Skýring til meðlims á ensku',
    nextSuggestion: 'Næsta sjónræna tillaga'
  }
} as const;

async function signInModeratorForWorkspace(page: Page): Promise<void> {
  await provisionLocalModerator(evaluationModerator.email);
  await clearLocalEvaluationMailbox();
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('The link has been sent.');
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));
  await expect(page).toHaveURL(/\/en\/moderation/);
}

async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function openTooltip(button: Locator): Promise<Locator> {
  await button.hover();
  await expect(button).toHaveAttribute('aria-describedby', /.+/);
  const tooltipId = await button.getAttribute('aria-describedby');
  expect(tooltipId).not.toBeNull();
  const tooltip = button.page().locator(`[data-access-tooltip][id="${tooltipId}"]`);
  await expect(tooltip).toHaveAttribute('data-open', 'true');
  return tooltip;
}

async function expectTooltipContained(button: Locator): Promise<void> {
  const tooltip = await openTooltip(button);
  const [tooltipBox, viewport] = await Promise.all([
    tooltip.boundingBox(),
    Promise.resolve(button.page().viewportSize())
  ]);

  expect(tooltipBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(tooltipBox!.height).toBeGreaterThan(0);
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(7.5);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport!.width - 7.5);
  expect(tooltipBox!.y).toBeGreaterThanOrEqual(7.5);
  expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(viewport!.height - 7.5);
}

test('About story remains bilingual, responsive, and Axe-clean', async ({ page, evidence }) => {
  const scenarios = [
    {
      path: '/en/about',
      heading: 'Going places is better together.',
      photoAlt: 'Vic holding Miles, a long-haired dachshund',
      visitorHiddenTrustTerms: /verified|verification|moderator|sources?|evidence|last checked/i
    },
    {
      path: '/is/about',
      heading: 'Betra er að fara saman.',
      photoAlt: 'Vic heldur á Miles, síðhærðum dachshundi',
      visitorHiddenTrustTerms: /staðfest|umsjónarfólk|heimildir?|sönnunargögn|síðast yfirfar/i
    }
  ] as const;

  await page.setViewportSize({ width: 390, height: 844 });

  for (const scenario of scenarios) {
    await page.goto(scenario.path);
    await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
    await expect(page.getByAltText(scenario.photoAlt)).toBeVisible();
    await expect(page.locator('.trust-section')).not.toContainText(
      scenario.visitorHiddenTrustTerms
    );
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);
  }
});

test('public discovery and floating access details are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/en?view=map');
  await waitForHydration(page);
  // The permanent way to add a missing Place is chrome over the map: reachable from the keyboard
  // while browsing, and named by exactly the words it shows.
  const suggestPill = page.getByRole('link', { name: 'Suggest a place' });
  await expect(suggestPill).toBeVisible();
  await suggestPill.focus();
  await expect(suggestPill).toBeFocused();
  // Scanned here, on arrival, because this is the only state the pill is mounted in: the pass
  // below runs after a selection has taken it away.
  await expectNoSeriousAxeViolations(page, evidence);
  // Arrival is a quiet map: the "All" chip is the browse-everything toggle
  // that opens the floating list.
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const listSelection = page.getByRole('button', { name: 'Select Published Place' });
  await expect(listSelection).toBeVisible();
  const listAccessSymbols = page
    .getByRole('region', { name: 'Places found' })
    .getByRole('group', { name: 'Dog access at Published Place' });
  const listSymbolButtons = listAccessSymbols.getByRole('button');
  await expectTooltipContained(listSymbolButtons.first());
  await expectTooltipContained(listSymbolButtons.last());
  await listSelection.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close selected place' })).toBeFocused();
  await page.keyboard.press('Enter');

  const selectPlace = page.getByRole('button', { name: 'Published Place', exact: true });
  await expect(selectPlace).toBeVisible();
  await selectPlace.focus();
  await page.keyboard.press('Enter');
  await expect(selectPlace).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
  await expect(page.getByText('Selected place: Published Place')).toBeAttached();
  // The card owns the screen during a selection, and the left-edge tab is the only thing that
  // stands beside it: the pill steps aside rather than competing for the same corner.
  await expect(suggestPill).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, evidence);

  const closeSelectedPlace = page.getByRole('button', { name: 'Close selected place' });
  await closeSelectedPlace.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toHaveCount(0);
  await expect(selectPlace).toBeFocused();
  // The close action updates the URL through the SPA router's history.replaceState/pushState.
  // Waiting for that same-document navigation to be observed keeps the next real page.goto()
  // from racing it (Playwright can otherwise report the goto as "interrupted by another
  // navigation" when it fires immediately after a client-side history update).
  await page.waitForURL((url) => !url.searchParams.has('place'));

  // Retain an independent floating-card pass after exercising portal geometry at 1024px.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en?place=${evaluationFixtureIds.places.published}`);
  // Every assertion below the hover is satisfiable by server-rendered DOM, so without this
  // barrier the hover can dispatch pointerenter before Svelte attaches the tooltip handler -
  // a race that only ever lost on slower CI runners.
  await waitForHydration(page);
  const selectedCard = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selectedCard).toBeVisible();
  await expect(selectedCard).toHaveAttribute('data-overlay', 'place');
  await expect(selectedCard.locator('[data-access-state="verified"]')).toHaveCount(0);
  const accessSymbols = selectedCard.getByRole('group', {
    name: 'Dog access at Published Place'
  });
  const symbolButtons = accessSymbols.getByRole('button');
  await expect(symbolButtons).toHaveCount(5);
  await expectTooltipContained(symbolButtons.first());
  await expectTooltipContained(symbolButtons.last());
  for (let index = 0; index < 5; index += 1) {
    await expectTooltipContained(symbolButtons.nth(index));
  }
  await symbolButtons.first().focus();
  const focusedTooltip = await openTooltip(symbolButtons.first());
  await page.keyboard.press('Escape');
  await expect(focusedTooltip).toHaveAttribute('data-open', 'false');
  await expect(symbolButtons.first()).toBeFocused();
  await expect(selectedCard).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(symbolButtons.first()).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(250);
  const completeDetails = selectedCard.locator('details[data-complete-details]');
  await expect(completeDetails).toHaveAttribute('open', '');
  await expect(selectedCard.getByRole('heading', { name: 'Dog access' })).toBeVisible();
  const disclosure = completeDetails.locator(':scope > summary');
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(completeDetails).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(completeDetails).toHaveAttribute('open', '');
  await expect(selectedCard.getByRole('heading', { name: 'Dog access' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);
});

test('place-mode directory results remain bilingual and reflow without page overflow', async ({
  page,
  evidence
}) => {
  const scenarios = [
    {
      locale: 'en',
      allChip: 'All',
      resultsRegion: 'Places found'
    },
    {
      locale: 'is',
      allChip: 'Allt',
      resultsRegion: 'Staðir sem fundust'
    }
  ] as const;

  for (const scenario of scenarios) {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/${scenario.locale}?view=map`);
      await waitForHydration(page);
      await page.getByRole('button', { name: scenario.allChip, exact: true }).click();
      await expect(page.getByRole('region', { name: scenario.resultsRegion })).toBeVisible();
      await expectNoHorizontalPageScroll(page);
      await expectNoSeriousAxeViolations(page, evidence);
    }
  }
});

test('unpublished Place routes remain neutral, bilingual, reflowing, and Axe-clean', async ({
  page,
  evidence
}) => {
  const placeId = evaluationFixtureIds.places.unverified;
  const scenarios = [
    { locale: 'en', heading: 'Page not found' },
    { locale: 'is', heading: 'Síðan fannst ekki' }
  ] as const;

  setLocalPlaceLifecycle(placeId, 'published');
  try {
    for (const scenario of scenarios) {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 }
      ]) {
        await page.setViewportSize(viewport);
        for (const lifecycle of ['published', 'inactive'] as const) {
          setLocalPlaceLifecycle(placeId, lifecycle);
          evidence.allowHttpStatus(404, `/places/${placeId}`);
          evidence.allowConsoleError(
            'Failed to load resource: the server responded with a status of 404'
          );
          const response = await page.goto(`/${scenario.locale}/places/${placeId}`);
          expect(response?.status()).toBe(404);
          await waitForHydration(page);
          await expect(page.locator('header[data-ui-mode="place"]')).toBeVisible();
          await expect(page.locator('main[data-ui-mode="place"]')).toBeVisible();
          await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
          await expect(page.getByText(/review|verified|reconfirm|source/i)).toHaveCount(0);
          await expectNoHorizontalPageScroll(page);
          await expectNoSeriousAxeViolations(page, evidence);
        }
      }
    }
  } finally {
    setLocalPlaceLifecycle(placeId, 'published');
  }
});

test('Moderator forms have keyboard focus order and Axe-clean semantics', async ({
  page,
  evidence
}) => {
  await provisionLocalModerator(evaluationModerator.email);
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fplaces%2Fnew');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  const signInInvalidation = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      responseUrl.pathname === '/en/moderation/sign-in/__data.json' &&
      responseUrl.searchParams.has('x-sveltekit-invalidated') &&
      response.ok()
    );
  });
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await signInInvalidation;
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);

  const operator = page.getByLabel('Operator');
  await operator.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Place type')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto('/en/moderation');
  await expect(page.getByRole('heading', { name: 'Moderation board', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Moderation queues' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto('/en/suggest');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Suggest a place' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Choose where the place is' })).toBeVisible();
  await page.getByRole('button', { name: 'Use map centre' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Location selected at');
  // Three questions, in the order they are asked: the name, then the pin, then the area radios.
  await page.getByLabel('Name of the place').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Use map centre' })).toBeFocused();
  const welcomeAreas = page.getByRole('group', { name: 'Where can dogs be?' });
  await expect(welcomeAreas.getByRole('radio')).toHaveCount(3);
  await welcomeAreas.getByRole('radio', { name: 'Indoors' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(welcomeAreas.getByRole('radio', { name: 'Outdoors' })).toBeChecked();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto('/is/suggest');
  await waitForHydration(page);
  await expect(page.getByRole('region', { name: 'Veldu hvar staðurinn er' })).toBeVisible();
  await page.getByRole('button', { name: 'Nota miðju kortsins' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Staðsetning valin');
  await expectNoSeriousAxeViolations(page, evidence);

  const suggestionId = await provisionLocalSuggestionFixture(evaluationModerator.email);
  for (const locale of ['en', 'is'] as const) {
    await page.goto(`/${locale}/account/suggestions`);
    for (const outcome of ['submitted', 'needs_information', 'accepted', 'duplicate', 'rejected']) {
      await expect(page.locator(`[data-outcome="${outcome}"]`).first()).toBeVisible();
    }
    await expect(page.getByText('Private visual-only Moderator note.')).toHaveCount(0);
    await expectNoSeriousAxeViolations(page, evidence);
  }

  await page.goto(`/en/moderation/suggestions/${suggestionId}`);
  await expect(page.getByRole('heading', { name: 'Visual Suggestion' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto(`/en/moderation/places/${evaluationFixtureIds.places.candidate}`);
  await expect(page.getByRole('heading', { name: 'Publication checklist' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);
});

test('the compact moderation workspace reflows, preserves keyboard context, and announces outcomes', async ({
  page,
  evidence
}) => {
  await signInModeratorForWorkspace(page);
  const suggestionId = await provisionLocalSuggestionFixture(evaluationModerator.email);
  const viewports = [
    { locale: 'en', name: 'English desktop', width: 1280, height: 900 },
    { locale: 'en', name: 'English mobile', width: 390, height: 844 },
    { locale: 'is', name: 'Icelandic desktop', width: 1280, height: 900 },
    { locale: 'is', name: 'Icelandic mobile', width: 390, height: 844 }
  ] as const;

  for (const scenario of viewports) {
    const localized = moderationWorkspaceCopy[scenario.locale];
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(
      `/${scenario.locale}/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`
    );
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: localized.heading, level: 1 }),
      scenario.name
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: localized.queueNavigation })).toBeVisible();
    await expect(page.getByRole('region', { name: localized.selectedQueue })).toBeVisible();
    await expect(page.getByRole('region', { name: localized.selectedItem })).toBeVisible();
    await expect(page.getByRole('region', { name: localized.decisionControls })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const nextSuggestion = page.getByRole('link', {
      name: new RegExp(localized.nextSuggestion)
    });
    await nextSuggestion.focus();
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('item')?.endsWith('0094') ?? false, {
        waitUntil: 'networkidle'
      }),
      nextSuggestion.press('Enter')
    ]);
    await expect(page).toHaveURL((url) => url.searchParams.get('item')?.endsWith('0094') ?? false);
    await expect(page.getByRole('region', { name: localized.selectedItem })).toContainText(
      localized.nextSuggestion
    );

    const candidateQueue = page.getByRole('link', {
      name: new RegExp(localized.candidatePlaces)
    });
    await candidateQueue.focus();
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('queue') === 'candidate-places', {
        waitUntil: 'networkidle'
      }),
      candidateQueue.press('Enter')
    ]);
    await expect(page).toHaveURL((url) => url.searchParams.get('queue') === 'candidate-places');
    await expect(page.getByRole('heading', { name: localized.candidateChecklist })).toBeVisible();
    const candidatePublicationForm = page.locator('#candidate-publication');
    await expect(candidatePublicationForm).toBeAttached();
    await expect(candidatePublicationForm).toBeHidden();
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);

    const suggestionsQueue = page.getByRole('link', {
      name: new RegExp(`^${localized.suggestions} \\d+$`)
    });
    await suggestionsQueue.focus();
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('queue') === 'suggestions', {
        waitUntil: 'networkidle'
      }),
      suggestionsQueue.press('Enter')
    ]);
    await expect(page).toHaveURL((url) => url.searchParams.get('queue') === 'suggestions');
    const decisionOption = page.getByRole('button', { name: localized.needsInformation });
    await decisionOption.focus();
    await decisionOption.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(localized.memberReasonIs).focus();
    await expect(page.getByLabel(localized.memberReasonIs)).toBeFocused();
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);
  }

  // A 640 CSS-pixel viewport matches the reflow viewport produced by 200% browser zoom on a
  // 1280-pixel desktop. Stress text is injected only for layout evaluation and is never persisted.
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto(`/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`);
  await page
    .locator('.item-top strong')
    .first()
    .evaluate((element) => {
      element.textContent =
        'A deliberately long moderation queue title that must wrap without hiding its status';
    });
  await page
    .locator('.summary')
    .first()
    .evaluate((element) => {
      element.textContent =
        'A long operator, category, address, and locality summary verifies compact reflow without horizontal page scrolling.';
    });
  await page.locator('.review-head h2').evaluate((element) => {
    element.textContent =
      'A very long selected Suggestion title that remains readable in the compact review pane';
  });
  await expectNoHorizontalPageScroll(page);
  await expectNoSeriousAxeViolations(page, evidence);
});

test('reduced motion suppresses marker transforms and selection has non-color state', async ({
  page,
  evidence
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en?view=map');
  const marker = page.getByRole('button', {
    name: 'Published Place',
    exact: true
  });
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  const markerMotion = await marker.evaluate((element) => {
    const toMilliseconds = (duration: string): number =>
      duration.endsWith('ms') ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000;
    const pin = element.querySelector('.pin');
    const body = element.querySelector('.pin-body');
    const label = element.querySelector('.marker-label');
    return {
      pinSettle: pin ? toMilliseconds(getComputedStyle(pin).animationDuration) : Number.NaN,
      labelSlide: label ? toMilliseconds(getComputedStyle(label).transitionDuration) : Number.NaN,
      strokeWidth: body ? getComputedStyle(body).strokeWidth : ''
    };
  });
  // The settle punch and the label slide carry the motion family, so both collapse to zero
  // for Members who prefer reduced motion; the thicker stroke stays as the non-color state.
  expect(markerMotion.pinSettle).toBeLessThanOrEqual(0.01);
  expect(markerMotion.labelSlide).toBeLessThanOrEqual(0.01);
  expect(markerMotion.strokeWidth).toBe('5px');
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
  // The card's entry animation is token-driven, so it must also collapse here. This is the
  // real-browser home of that assertion: the component harness cannot resolve tokens, and a
  // matchMedia mock cannot drive CSS media queries.
  const cardEnter = await page
    .locator('[data-selected-place-overlay]')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration) * 1_000);
  expect(cardEnter).toBeLessThanOrEqual(0.01);
  await expectNoSeriousAxeViolations(page, evidence);
});

test('reduced motion stills movement while keeping the Favourite flourish legible', async ({
  page,
  evidence
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = `motion-a11y-${Date.now()}@example.invalid`;
  await page.goto('/en/account?returnTo=%2Fen');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(email));

  await page.goto('/en?view=map');
  await waitForHydration(page);
  // Arrival is a quiet map under the filter-driven layout: the "All" chip is what opens the
  // list the Favourite control lives in.
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const favouriteAction = page.locator(
    `[data-favourite-place="${evaluationFixtureIds.places.published}"]`
  );
  await expect(favouriteAction).toBeVisible();

  // The arrival cascade is motion-family: both the entry and its stagger interval collapse,
  // so the list lands settled rather than trickling in. The stagger token is asserted rather
  // than a later item's delay because the fixture set makes no promise about list cardinality.
  const staggeredItemMotion = await page
    .locator('.results-overlay li')
    .first()
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      const milliseconds = (value: string): number =>
        value.trim().endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1_000;
      return {
        duration: milliseconds(styles.animationDuration),
        staggerInterval: milliseconds(styles.getPropertyValue('--hv-motion-stagger'))
      };
    });
  expect(staggeredItemMotion.duration).toBeLessThanOrEqual(0.01);
  expect(staggeredItemMotion.staggerInterval).toBe(0);

  // The control carries data-ui-mode, so this also proves the reduced-motion override reaches
  // past [data-ui-mode] specificity. A ":root"-only override would leave these at full duration.
  const durations = await favouriteAction.evaluate((element) => {
    const styles = getComputedStyle(element);
    const milliseconds = (value: string): number =>
      value.trim().endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1_000;
    return {
      motion: milliseconds(styles.getPropertyValue('--hv-motion-quick')),
      fade: milliseconds(styles.getPropertyValue('--hv-fade-quick'))
    };
  });
  expect(durations.motion).toBe(0);
  // Fades do not move. Suppressing them too is what makes a reduced-motion interface read as
  // broken rather than calm, so the Favourite still crossfades and glows.
  expect(durations.fade).toBeGreaterThan(0);

  // Located by container rather than by name: saving relabels the control to "Remove ...",
  // so a name-based locator stops resolving at exactly the moment being asserted.
  const save = favouriteAction.getByRole('button');
  await expect(save).toHaveAccessibleName('Add Published Place to favorites');
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  await expect(favouriteAction).toHaveAttribute('data-state', 'selected');
  await expectNoSeriousAxeViolations(page, evidence);
});

test('reduced motion keeps the selected card legible without wiping the bar open', async ({
  page,
  evidence
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en?view=list');
  await waitForHydration(page);

  // Selecting folds the list away behind the answer card. The edge tab is the only route back
  // to a list that shows its own selection, so it is also the only place this bar is visible.
  await page
    .locator('[data-place-card]')
    .first()
    .getByRole('button', { name: /^Select / })
    .click();
  await page.getByRole('button', { name: /^Show \d+ results?$/ }).click();

  const selected = page.locator('[data-place-card].selected');
  await expect(selected).toBeVisible();

  // The bar is the state, not decoration. Reduced motion takes the wipe away; a Member who
  // asked for less motion still has to see which card is selected, so the bar has to arrive at
  // full height rather than being suppressed alongside the movement.
  // Only the selected card is read here. Whether an unselected card keeps its bar shut is
  // covered by tests/component/everyday-motion.browser.test.ts, which can render both states on
  // demand; asserting it here would tie this test to how many Places the fixture set publishes,
  // and the accessibility fixtures publish exactly one.
  const bar = await selected.evaluate((element) => {
    const styles = getComputedStyle(element, '::before');
    const duration = styles.transitionDuration;
    // matrix(a, b, c, d, e, f): d carries the Y scale, so a fully wiped bar reads as 1.
    return {
      verticalScale: Number.parseFloat(
        styles.transform.replace(/^matrix\(|\)$/g, '').split(',')[3]
      ),
      duration: duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1_000
    };
  });
  expect(bar.duration).toBeLessThanOrEqual(0.01);
  expect(bar.verticalScale).toBe(1);

  await expectNoSeriousAxeViolations(page, evidence);
});

test('Member sign-in is keyboard-operable and Axe-clean in both product languages', async ({
  page,
  evidence
}) => {
  const cases = [
    {
      locale: 'en',
      viewport: { width: 1280, height: 900 },
      heading: 'Continue with Hundavænt',
      email: 'Email address',
      send: 'Send me a sign-in link'
    },
    {
      locale: 'is',
      viewport: { width: 390, height: 844 },
      heading: 'Halda áfram með Hundavænt',
      email: 'Netfang',
      send: 'Senda mér innskráningartengil'
    }
  ] as const;

  for (const scenario of cases) {
    await page.setViewportSize(scenario.viewport);
    await page.goto(`/${scenario.locale}/account?returnTo=%2F${scenario.locale}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: scenario.heading })).toBeVisible();

    const email = dialog.getByLabel(scenario.email);
    await email.focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: scenario.send })).toBeFocused();
    // The sign-in dialog is fully on design-system primitives (Dialog, Field, Input, Button);
    // the retired data-intent vocabulary must not reappear anywhere inside it.
    await expect(dialog.locator('[data-intent]')).toHaveCount(0);
    await expectNoSeriousAxeViolations(page, evidence);
  }
});

test('private Favourite actions and the saved view are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  const email = `favourite-a11y-${Date.now()}@example.invalid`;
  await page.goto('/en/account?returnTo=%2Fen%2Ffavorites');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(email));
  await expect(page.getByRole('heading', { name: 'Favorites', exact: true })).toBeVisible();
  await page.evaluate(async (placeId) => {
    const response = await fetch(`/api/favourites/${placeId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ desiredState: true })
    });
    if (!response.ok) throw new Error('Could not prepare Favourite accessibility state');
    await response.json();
  }, evaluationFixtureIds.places.published);
  await page.goto('/en/account');
  await waitForHydration(page);
  // The hub leads with the featured impact card; the rhythm trail lives on the impact record.
  await expect(page.getByRole('link', { name: 'See my impact' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto('/en/favorites');
  await page.reload();
  // A fresh load must finish hydrating before a keyboard interaction fires -- otherwise the
  // Enter keypress can land before Svelte attaches its click handler and silently no-op,
  // leaving the "No favorites yet" heading focus assertion below to time out.
  await waitForHydration(page);
  const remove = page.getByRole('button', {
    name: 'Remove Published Place from favorites'
  });
  const favouriteAction = page.locator(
    `[data-favourite-place="${evaluationFixtureIds.places.published}"]`
  );
  await expect(favouriteAction).toHaveAttribute('data-state', 'selected');
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await expect(remove).toHaveAttribute('data-state', 'selected');
  // The design-system Button owns the selected look via aria-pressed (asserted above);
  // the retired data-intent vocabulary must not reappear on migrated surfaces.
  await expect(remove).not.toHaveAttribute('data-intent');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'No favorites yet' })).toBeFocused();
  await expect(page.getByRole('status')).toContainText(
    'Published Place was removed from your favorites.'
  );
  await expectNoSeriousAxeViolations(page, evidence);
});

test('the private Check-in action and its result are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  const email = `check-in-a11y-${Date.now()}@example.invalid`;
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(
      `/en?place=${evaluationFixtureIds.places.published}&view=map`
    )}`
  );
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(email));
  await waitForHydration(page);

  // The signed-in intro state: explanation copy plus the primary action.
  const checkIn = page.getByRole('button', { name: 'Check in at Published Place' });
  const checkInRegion = page.locator(
    'section[aria-label="Check in at Published Place"][data-state]'
  );
  await expect(checkInRegion).toHaveAttribute('data-state', 'idle');
  await checkIn.focus();
  await expect(checkIn).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.keyboard.press('Enter');
  await expect(checkInRegion).toHaveAttribute('data-state', 'committed');
  await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  clearLocalCheckIns(evaluationFixtureIds.places.published);
});

test('Correction, Report, and Moderator review forms are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalPlaceFlagAbusePolicy();
  provisionLocalPlaceFlagFixtures();
  const { correctable } = localPlaceFlagFixtures;
  const memberEmail = `place-flag-a11y-${Date.now()}@example.invalid`;

  await page.goto(`/en/account?returnTo=%2Fen%2Fplaces%2F${correctable.placeId}%2Fcorrect`);
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(memberEmail);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(memberEmail));

  await page.goto(`/en/places/${correctable.placeId}/correct?field=phone`);
  // Full navigation, so hydration starts over; focusing before it completes loses the race on a
  // cold vite cache (the SSR heading is visible while the client is still compiling, and the
  // pre-hydration focus never survives into the interactive page).
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Suggest a correction' })).toBeVisible();
  await page.getByLabel('What are you correcting?').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Choose the detail')).toBeFocused();
  // The correction form is fully on design-system form primitives; the retired data-intent
  // vocabulary must not reappear on migrated surfaces.
  await expect(page.locator('main [data-intent]')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, evidence);

  // Deliberately the bare URL, which is what "Something else is wrong" on the card links to and
  // what every other run of this form has never exercised: the deep-linked `?conditionId=` state
  // is still captured by visual.spec.ts, so this pass covers the default one instead.
  await page.goto(`/en/places/${correctable.placeId}/report`);
  // Same hydration guard as the correction page above: this test focuses controls right after a
  // full navigation.
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
  // The whole Place is the default, and it carries neither a field nor a Condition, so neither
  // selector is in the DOM to be tabbed into or read out.
  await expect(page.getByLabel('What are you correcting?')).toHaveValue('place');
  await expect(page.getByLabel('What are you correcting?').locator('option:checked')).toHaveText(
    'The whole place'
  );
  await expect(page.getByLabel('Choose the detail')).toHaveCount(0);
  await expect(page.getByLabel('Choose the Access Condition')).toHaveCount(0);
  await page.getByLabel('What kind of problem is this?').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('This is a Safety Concern')).toBeFocused();
  // Same retirement pin as the correction form above: the report form is fully migrated.
  await expect(page.locator('main [data-intent]')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, evidence);

  const reviewFlagId = await provisionLocalPlaceFlagReviewFixture(evaluationModerator.email);
  await page.goto(
    '/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%3Fqueue%3Dcorrections-and-reports%26filter%3Dactionable'
  );
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));

  await page.goto(
    `/en/moderation?queue=corrections-and-reports&item=${reviewFlagId}&filter=actionable`
  );
  await waitForHydration(page);
  await expect(page.getByText('Safety Concern').first()).toBeVisible();
  await page.getByRole('button', { name: 'Needs information', exact: true }).focus();
  await page.keyboard.press('Enter');
  const decisionDialog = page.getByRole('dialog');
  await expect(decisionDialog).toBeVisible();
  await decisionDialog.getByLabel('Member explanation in Icelandic').focus();
  await expect(decisionDialog.getByLabel('Member explanation in Icelandic')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(decisionDialog.getByLabel('Member explanation in English')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  // The three fixture Places are published so they can be targeted by a Correction/Report;
  // retiring them keeps them out of public discovery for whichever suite shares this local
  // database session next, matching visual.spec.ts's handling of the same fixture.
  retireLocalPlaceFlagFixtures();
});

test('inline Dog-Friendliness Rating, public average, and Moderator exclusion view are keyboard-operable and Axe-clean', async ({
  browser,
  page,
  evidence
}) => {
  await provisionLocalModerator(evaluationModerator.email);
  provisionLocalDogFriendlinessFixture();
  const { placeId } = localDogFriendlinessFixture;
  try {
    await configureLocalDogFriendlinessSummaryPolicy();
    // An empty Rating state stays out of the day-to-day Place card until a public result exists.
    await page.goto(`/en?place=${placeId}&view=map`);
    const selected = page.getByRole('complementary', { name: 'Selected place' });
    await expect(selected.getByText('Not yet rated')).toHaveCount(0);
    await expectNoSeriousAxeViolations(page, evidence);

    const memberEmail = `dog-friendliness-a11y-${Date.now()}@example.invalid`;
    await page.goto('/en/account');
    await waitForHydration(page);
    await page.getByRole('dialog').getByLabel('Email address').fill(memberEmail);
    await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
    await page.goto(await waitForLocalMagicLink(memberEmail));

    await page.goto(`/en?place=${placeId}&view=map`);
    await waitForHydration(page);
    const rating = selected.locator('[data-inline-rating]');
    const overallRating = rating.getByRole('radiogroup', { name: 'Overall rating' });
    const oneStar = overallRating.getByRole('radio', { name: '1 star' });
    await expect(oneStar).toBeEnabled();
    await oneStar.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(overallRating.getByRole('radio', { name: '4 stars' })).toBeFocused();
    await expect(overallRating.getByRole('radio', { name: '4 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await rating
      .getByRole('radiogroup', { name: 'Welcome' })
      .getByRole('radio', { name: '4 stars' })
      .focus();
    await page.keyboard.press('Tab');
    await expect(
      rating.getByRole('radiogroup', { name: 'Clarity' }).getByRole('radio', { name: '4 stars' })
    ).toBeFocused();
    await expect(rating.getByText('Saved')).toBeVisible();
    await expectNoSeriousAxeViolations(page, evidence);

    const secondMember = await browser.newContext();
    try {
      const secondPage = await secondMember.newPage();
      const secondEmail = `dog-friendliness-a11y-second-${Date.now()}@example.invalid`;
      await clearLocalEvaluationMailbox();
      await secondPage.goto('/en/account');
      await waitForHydration(secondPage);
      await secondPage.getByRole('dialog').getByLabel('Email address').fill(secondEmail);
      await secondPage
        .getByRole('dialog')
        .getByRole('button', { name: 'Send me a sign-in link' })
        .click();
      await secondPage.goto(await waitForLocalMagicLink(secondEmail));
      await secondPage.goto(`/en?place=${placeId}&view=map`);
      await waitForHydration(secondPage);
      const secondRating = secondPage.locator('[data-inline-rating]');
      const fiveStars = secondRating
        .getByRole('radiogroup', { name: 'Overall rating' })
        .getByRole('radio', { name: '5 stars' });
      await expect(fiveStars).toBeEnabled();
      await fiveStars.click();
      await expect(secondRating.getByText('Saved')).toBeVisible();
    } finally {
      await secondMember.close();
    }

    await page.goto(`/en?place=${placeId}&view=map`);
    await waitForHydration(page);
    const publicAverage = selected.getByLabel('Dog-Friendliness by Members');
    await expect(publicAverage).toBeVisible();
    await expect(publicAverage).toContainText('★');
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);

    await page.goto(
      `/en/moderation/sign-in?returnTo=${encodeURIComponent(`/en/moderation/dog-friendliness/${placeId}`)}`
    );
    await waitForHydration(page);
    await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
    await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
    await page.goto(await waitForLocalMagicLink(evaluationModerator.email));

    await page.goto(`/en/moderation/dog-friendliness/${placeId}`);
    await expect(page.getByRole('heading', { name: 'Dog-Friendliness Ratings' })).toBeVisible();
    const ratingRow = page.locator('li[data-rating-id]').first();
    await expect(ratingRow).toBeVisible();
    await ratingRow.getByLabel('Exclusion reason').focus();
    await page.keyboard.press('Tab');
    await expect(ratingRow.getByLabel('Reason', { exact: true })).toBeFocused();
    await expectNoSeriousAxeViolations(page, evidence);
  } finally {
    try {
      await disableLocalDogFriendlinessSummaryPolicy();
    } finally {
      // The fixture Place is published so it can be discovered and rated; retiring it keeps it
      // out of public discovery for whichever suite shares this local database session next.
      retireLocalDogFriendlinessFixture();
    }
  }
});

test('the private personal history route is keyboard-operable and Axe-clean in both languages', async ({
  page,
  evidence
}) => {
  const scenarios = [
    {
      locale: 'en',
      emailLabel: 'Email address',
      sendLabel: 'Send me a sign-in link',
      title: 'Visits',
      visits: 'Visits',
      map: 'Map'
    },
    {
      locale: 'is',
      emailLabel: 'Netfang',
      sendLabel: 'Senda mér innskráningartengil',
      title: 'Heimsóknir',
      visits: 'Heimsóknir',
      map: 'Kort'
    }
  ] as const;

  for (const scenario of scenarios) {
    // Each iteration signs in as its own Member; without clearing the session first, the second
    // locale's /account visit would already be signed in from the first and never show the
    // sign-in form this step depends on.
    await page.context().clearCookies();
    const email = `history-a11y-${scenario.locale}-${Date.now()}@example.invalid`;
    await page.goto(
      `/${scenario.locale}/account?returnTo=${encodeURIComponent(`/${scenario.locale}/history`)}`
    );
    await waitForHydration(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(scenario.emailLabel).fill(email);
    await dialog.getByRole('button', { name: scenario.sendLabel }).click();
    await page.goto(await waitForLocalMagicLink(email));
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible();
    const nav = page.getByRole('navigation', { name: scenario.title });
    const visitsTab = nav.getByRole('link', { name: scenario.visits });
    await visitsTab.focus();
    await expect(visitsTab).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: scenario.map })).toBeFocused();
    await expectNoSeriousAxeViolations(page, evidence);

    await page.goto(`/${scenario.locale}/history?view=map`);
    await waitForHydration(page);
    await expectNoSeriousAxeViolations(page, evidence);
  }
});

test('optional low-score Rating note and Moderator note workspace are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  await provisionLocalModerator(evaluationModerator.email);
  provisionLocalPrivateRatingNoteFixture();
  await configureLocalPrivateRatingNotePolicy();
  await configureLocalPlaceFlagAbusePolicy();
  const { placeId } = localPrivateRatingNoteFixture;

  const memberEmail = `rating-note-a11y-${Date.now()}@example.invalid`;
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(memberEmail);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(memberEmail));
  await waitForHydration(page);

  // A qualifying low overall score reveals the optional note without a separate Report flow.
  await page.goto(`/en?place=${placeId}&view=map`);
  await waitForHydration(page);
  const rating = page.locator('[data-inline-rating]');
  const oneStar = rating
    .getByRole('radiogroup', { name: 'Overall rating' })
    .getByRole('radio', { name: '1 star' });
  await expect(oneStar).toBeEnabled();
  await oneStar.focus();
  await page.keyboard.press('Space');
  const note = rating.getByRole('textbox', { name: 'What could be better? (optional)' });
  await expect(note).toBeVisible();
  await rating
    .getByRole('radiogroup', { name: 'Welcome' })
    .getByRole('radio', { name: '1 star' })
    .focus();
  await page.keyboard.press('Tab');
  await expect(
    rating.getByRole('radiogroup', { name: 'Clarity' }).getByRole('radio', { name: '1 star' })
  ).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await note.fill('The posted opening hours do not match what staff told me.');
  await note.blur();
  await expect(rating.getByText('Saved')).toBeVisible();
  await expect(page.getByText('Send a formal Report?')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(`/en/moderation/dog-friendliness/${placeId}`)}`
  );
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));

  await page.goto(`/en/moderation/dog-friendliness/${placeId}`);
  await expect(page.getByRole('heading', { name: 'Dog-Friendliness Ratings' })).toBeVisible();
  await expect(page.getByText('Private Rating Note')).toBeVisible();
  await page.getByLabel('Decision kind').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Moderator notes')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await disableLocalPrivateRatingNotePolicy();
  retireLocalPrivateRatingNoteFixture();
});

test('the Place media Moderator workspace and public Photos gallery are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  await provisionLocalModerator(evaluationModerator.email);
  const { candidate, published } = evaluationFixtureIds.places;

  await page.goto(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(`/en/moderation/places/${candidate}`)}`
  );
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));
  await waitForHydration(page);
  const candidateMedia = page.locator('#candidate-media');
  const candidateMediaSummary = candidateMedia.locator(':scope > summary');
  await candidateMediaSummary.focus();
  await candidateMediaSummary.press('Enter');
  await expect(candidateMedia).toHaveAttribute('open', '');

  const evidenceColumn = page.locator('[data-media-column="evidence"]');
  const evidenceFile = evidenceColumn.getByLabel('Image (PNG, JPEG, or WebP, 15 MB maximum)');
  await evidenceFile.focus();
  await page.keyboard.press('Tab');
  await expect(evidenceColumn.getByLabel('Source URL')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await evidenceFile.setInputFiles(fixturePngFile('a11y-evidence.png', 60, 40));
  await evidenceColumn.getByLabel('Source URL').fill('https://example.invalid/a11y/screenshot');
  await evidenceColumn.getByLabel('Capture time').fill('2026-07-12T09:00');
  await evidenceColumn.getByRole('button', { name: 'Upload Evidence' }).click();
  await expect(page.getByText('Media uploaded.')).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto(`/en/moderation/places/${published}`);
  await waitForHydration(page);
  const publishedMedia = page.locator('#candidate-media');
  const publishedMediaSummary = publishedMedia.locator(':scope > summary');
  await publishedMediaSummary.focus();
  await publishedMediaSummary.press('Enter');
  await expect(publishedMedia).toHaveAttribute('open', '');
  const photoColumn = page.locator('[data-media-column="photo"]');
  const photoFile = photoColumn.getByLabel('Image (PNG, JPEG, or WebP, 15 MB maximum)');
  const photoRights = photoColumn.getByLabel('Photo rights');
  const peopleReview = photoColumn.getByLabel('People shown in the photo');
  await photoFile.focus();
  await page.keyboard.press('Tab');
  await expect(photoRights).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(peopleReview).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await photoFile.setInputFiles(
    fixturePngFile('a11y-photo.png', 200, 150, { r: 70, g: 130, b: 180 })
  );
  await peopleReview.selectOption('no_prominent_people');
  await photoColumn.getByText('Optional photo details', { exact: true }).click();
  const photographerField = photoColumn.getByLabel('Photographer or uploader');
  await photographerField.fill('A11y Photographer');
  await photoColumn.getByLabel('Capture or source date').fill('2026-07-01');
  await photoColumn
    .getByLabel('License or permission reference')
    .fill('Owner-supplied, a11y fixture');
  await photoColumn
    .getByLabel('Rights evidence reference')
    .fill('Owner permission fixture recorded for accessibility evaluation');
  await photoColumn
    .getByLabel('Public attribution text')
    .fill('Photo by A11y Photographer, used with permission');
  await photoColumn.getByLabel('Image description (Icelandic)').fill('Hundur, aðgengispróf');
  await photoColumn.getByLabel('Image description (English)').fill('A dog, accessibility fixture');
  await photoColumn.getByRole('button', { name: 'Upload and publish' }).click();
  await expect(page.getByText('Photo approved and published.')).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto(`/en?place=${published}`);
  const selected = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selected.getByAltText('A dog, accessibility fixture')).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  // Both fixture Places are shared, permanently-seeded evaluation fixtures; removing the media
  // rows and Storage objects this test created returns them to their pristine state for
  // whichever suite shares this local database session next.
  clearLocalPlaceMedia(candidate);
  clearLocalPlaceMedia(published);
});

test('the private achievements route is keyboard-operable and Axe-clean in both languages', async ({
  page,
  evidence
}) => {
  const scenarios = [
    {
      locale: 'en',
      emailLabel: 'Email address',
      sendLabel: 'Send me a sign-in link',
      title: 'Your Achievements',
      backLink: 'My account',
      accountUnread: 'New achievement waiting',
      celebration: 'New achievement: First Check-in'
    },
    {
      locale: 'is',
      emailLabel: 'Netfang',
      sendLabel: 'Senda mér innskráningartengil',
      title: 'Afrekin þín',
      backLink: 'Reikningurinn minn',
      accountUnread: 'Nýtt afrek bíður',
      celebration: 'Nýtt afrek: Fyrsta innritunin'
    }
  ] as const;

  // The Achievement policy is a database-wide fail-closed singleton; enable it only for the span
  // of these assertions and restore the seeded dark state afterwards.
  await configureLocalAchievementPolicy();
  try {
    for (const scenario of scenarios) {
      // Each iteration signs in as its own Member; without clearing the session first, the second
      // locale's /account visit would already be signed in from the first and never show the
      // sign-in form this step depends on.
      await page.context().clearCookies();
      const email = `achievements-a11y-${scenario.locale}-${Date.now()}@example.invalid`;
      await page.goto(
        `/${scenario.locale}/account?returnTo=${encodeURIComponent(
          `/${scenario.locale}/account/achievements`
        )}`
      );
      await waitForHydration(page);
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(scenario.emailLabel).fill(email);
      await dialog.getByRole('button', { name: scenario.sendLabel }).click();
      await page.goto(await waitForLocalMagicLink(email));
      await waitForHydration(page);

      // Exercise the complete selective surface: visible milestone progress, one acknowledged
      // archive entry, one unread surprise, and the account-level cue.
      await provisionLocalAchievementProgress(email);
      await provisionLocalAchievementUnlock(email, 'first_favourite', '2026-07-01T12:00:00Z', true);
      await provisionLocalAchievementUnlock(email, 'first_checkin', '2026-07-02T12:00:00Z', false);
      await page.goto(`/${scenario.locale}/account`);
      await expect(
        page.locator('header').getByRole('link', {
          name: `${scenario.backLink} ${scenario.accountUnread}`
        })
      ).toBeVisible();

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${scenario.locale}/account/achievements`);
      await waitForHydration(page);

      await expect(page.getByRole('heading', { name: scenario.title })).toBeVisible();
      // Sixteen tiers are visible, but only each collection's nearest unearned tier is an active
      // target, so a screen reader hears one progress figure per started collection. The
      // Contributions collection has no progress here, so its bronze tier reports none.
      await expect(page.locator('[data-achievement-tier]')).toHaveCount(16);
      await expect(page.getByRole('progressbar')).toHaveCount(3);
      const celebration = page.getByRole('region', { name: scenario.celebration });
      await expect(celebration).toHaveAttribute('data-reduced-motion', 'true');
      // The token-family reduce contract on the celebration choreography: the card's travelling
      // entry collapses to zero duration, while split elements keep their fade half appearing at
      // full duration (0.26s member fade-considered). Names survive; durations tell the story.
      await expect(celebration).toHaveCSS('animation-duration', '0s');
      await expect(celebration.locator('.halo')).toHaveCSS('animation-duration', '0s, 0.26s');
      await expect(celebration.locator('.paw')).toHaveCSS('animation-duration', '0s, 0.26s');
      // The signed-in header carries an equally-named account link; scope to the page body.
      const backLink = page.locator('main').getByRole('link', { name: scenario.backLink });
      await backLink.focus();
      await expect(backLink).toBeFocused();
      await expectNoSeriousAxeViolations(page, evidence);

      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalPageScroll(page);
      await expectNoSeriousAxeViolations(page, evidence);
      await page.emulateMedia({ reducedMotion: null });
      await retireLocalAchievementProgress(email);
    }
  } finally {
    await disableLocalAchievementPolicy();
  }
});

test('the private weekly roundup is keyboard-operable, responsive, and Axe-clean in both languages', async ({
  page,
  evidence
}) => {
  const scenarios = [
    {
      locale: 'en',
      emailLabel: 'Email address',
      sendLabel: 'Send me a sign-in link',
      unconfiguredTitle: 'Choose where your trail begins',
      language: 'English',
      emailInterest: 'I would be interested in receiving this recap by email later',
      save: 'Save recap settings',
      populatedTitle: 'A few fresh tracks',
      edit: 'Edit recap settings',
      saved: 'Your private recap settings were saved. No email was sent.'
    },
    {
      locale: 'is',
      emailLabel: 'Netfang',
      sendLabel: 'Senda mér innskráningartengil',
      unconfiguredTitle: 'Veldu hvar slóðin þín byrjar',
      language: 'Íslenska',
      emailInterest: 'Ég hefði áhuga á að fá þetta vikuyfirlit í tölvupósti síðar',
      save: 'Vista stillingar vikuyfirlits',
      populatedTitle: 'Nokkur ný spor',
      edit: 'Breyta stillingum vikuyfirlits',
      saved: 'Einkastillingar vikuyfirlitsins voru vistaðar. Enginn tölvupóstur var sendur.'
    }
  ] as const;

  provisionLocalWeeklyRoundupFixtures();

  for (const scenario of scenarios) {
    await page.context().clearCookies();
    const email = `weekly-roundup-a11y-${scenario.locale}-${Date.now()}@example.invalid`;
    const roundupPath = `/${scenario.locale}/account/roundup`;
    await page.goto(`/${scenario.locale}/account?returnTo=${encodeURIComponent(roundupPath)}`);
    await waitForHydration(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(scenario.emailLabel).fill(email);
    await dialog.getByRole('button', { name: scenario.sendLabel }).click();
    await page.goto(await waitForLocalMagicLink(email));
    await waitForHydration(page);
    await expect(page).toHaveURL(roundupPath);
    await expect(page.getByRole('heading', { name: scenario.unconfiguredTitle })).toBeVisible();

    const municipality = page.getByRole('checkbox', { name: 'Reykjavík' });
    await municipality.focus();
    await page.keyboard.press('Space');
    await expect(municipality).toBeChecked();

    const secondMunicipality = page.getByRole('checkbox', { name: 'Kópavogur' });
    await secondMunicipality.focus();
    await page.keyboard.press('Space');
    await expect(secondMunicipality).toBeChecked();

    const language = page.getByRole('radio', { name: scenario.language });
    await language.focus();
    await page.keyboard.press('Space');
    await expect(language).toBeChecked();

    const emailInterest = page.getByRole('checkbox', { name: scenario.emailInterest });
    await emailInterest.focus();
    await page.keyboard.press('Space');
    await expect(emailInterest).toBeChecked();

    const save = page.getByRole('button', { name: scenario.save });
    // The preferences form is on design-system primitives now (Choice, Button); the retired
    // data-intent vocabulary must not reappear on its controls.
    await expect(save).not.toHaveAttribute('data-intent');
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: scenario.populatedTitle })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(scenario.saved);
    await expectNoSeriousAxeViolations(page, evidence);

    const edit = page.getByRole('button', { name: scenario.edit });
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(emailInterest).toBeChecked();
    await emailInterest.focus();
    await page.keyboard.press('Space');
    await expect(emailInterest).not.toBeChecked();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);

    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText(scenario.saved);
    await page.emulateMedia({ reducedMotion: null });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});
