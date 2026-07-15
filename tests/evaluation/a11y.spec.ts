import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

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
  provisionLocalDogFriendlinessFixture,
  provisionLocalModerator,
  provisionLocalPlaceFlagFixtures,
  provisionLocalPlaceFlagReviewFixture,
  provisionLocalPrivateRatingNoteFixture,
  provisionLocalSuggestionFixture,
  retireLocalDogFriendlinessFixture,
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
    saveOutcome: 'Save outcome',
    invalid: 'Check the highlighted answers and try again.',
    conflict: 'This Suggestion outcome was already finalized by another Moderator.',
    saved: 'The outcome has been saved.',
    nextSuggestion: 'Next Visual Suggestion'
  },
  is: {
    heading: 'Umsjónarborð',
    queueNavigation: 'Umsjónarraðir',
    selectedQueue: 'Valin umsjónarröð',
    selectedItem: 'Valið umsjónaratriði',
    suggestions: 'Tillögur',
    candidatePlaces: 'Tillögur að stöðum',
    candidateChecklist: 'Atriði fyrir birtingu',
    empty: 'Röð lokið',
    decisionControls: 'Ákvörðunarstýringar',
    needsInformation: 'Vantar upplýsingar',
    memberReasonIs: 'Skýring til meðlims á íslensku',
    memberReasonEn: 'Skýring til meðlims á ensku',
    saveOutcome: 'Vista niðurstöðu',
    invalid: 'Athugaðu merktu svörin og reyndu aftur.',
    conflict: 'Annar stjórnandi hefur þegar lokað þessari tillögu.',
    saved: 'Niðurstaðan hefur verið vistuð.',
    nextSuggestion: 'Næsta sjónræna tillaga'
  }
} as const;

async function signInModeratorForWorkspace(page: Page): Promise<void> {
  await provisionLocalModerator(evaluationModerator.email);
  await clearLocalEvaluationMailbox();
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation');
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(evaluationModerator.email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('The link has been sent.');
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));
  await expect(page).toHaveURL(/\/en\/moderation/);
}

async function fillWorkspaceSuggestionResolution(
  page: Page,
  locale: 'en' | 'is',
  outcome: 'needs_information' | 'rejected' = 'needs_information'
) {
  const localized = moderationWorkspaceCopy[locale];
  const decision = page.locator('#suggestion-decision');
  await decision.getByLabel(locale === 'is' ? 'Niðurstaða' : 'Outcome').selectOption(outcome);
  await decision
    .getByLabel(localized.memberReasonIs)
    .fill('Vinsamlegast staðfestu að heimildin sé enn í gildi.');
  await decision
    .getByLabel(localized.memberReasonEn)
    .fill('Please confirm that the source is still current.');
}

async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test('About story remains bilingual, responsive, and Axe-clean', async ({ page, evidence }) => {
  const scenarios = [
    {
      path: '/en/about',
      heading: 'We wanted to bring Miles with us.',
      photoAlt: 'Vic holding Miles, a long-haired dachshund'
    },
    {
      path: '/is/about',
      heading: 'Okkur langaði að taka Miles með.',
      photoAlt: 'Vic heldur á Miles, síðhærðum dachshundi'
    }
  ] as const;

  await page.setViewportSize({ width: 390, height: 844 });

  for (const scenario of scenarios) {
    await page.goto(scenario.path);
    await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();
    await expect(page.getByAltText(scenario.photoAlt)).toBeVisible();
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);
  }
});

test('public discovery and floating access details are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  await page.goto('/en?view=map');
  await waitForHydration(page);
  const resultCount = page.getByRole('button', { name: /Show \d+ results?/ });
  await resultCount.focus();
  await page.keyboard.press('Enter');
  const listSelection = page.getByRole('button', { name: 'Select Published Place' });
  await expect(listSelection).toBeVisible();
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

  await page.goto(`/en?place=${evaluationFixtureIds.places.published}`);
  const selectedCard = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selectedCard).toBeVisible();
  await expect(selectedCard).toHaveAttribute('data-overlay', 'place');
  await expect(selectedCard.locator('[data-access-state="verified"]')).toBeVisible();
  const disclosure = selectedCard.locator('summary');
  await disclosure.focus();
  await page.keyboard.press('Enter');
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
      resultsButton: /Show \d+ results?/,
      resultsRegion: 'Places found'
    },
    {
      locale: 'is',
      resultsButton: /Sýna \d+ niðurstöð/,
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
      await page.getByRole('button', { name: scenario.resultsButton }).click();
      await expect(page.getByRole('region', { name: scenario.resultsRegion })).toBeVisible();
      await expectNoHorizontalPageScroll(page);
      await expectNoSeriousAxeViolations(page, evidence);
    }
  }
});

test('public Place status routes remain bilingual, place-mode, reflowing, and Axe-clean', async ({
  page,
  evidence
}) => {
  // Candidate identities are private. The published-but-unverified fixture is the public
  // access-under-review state exercised by this route.
  const placeId = evaluationFixtureIds.places.unverified;
  const scenarios = [
    {
      locale: 'en',
      underReview: 'Dog access information is under review',
      inactive: 'This place is no longer active'
    },
    {
      locale: 'is',
      underReview: 'Upplýsingar um hundaaðgengi eru í yfirferð',
      inactive: 'Þessi staður er ekki lengur virkur'
    }
  ] as const;

  setLocalPlaceLifecycle(placeId, 'published');
  try {
    for (const scenario of scenarios) {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 }
      ]) {
        await page.setViewportSize(viewport);
        for (const state of [
          { lifecycle: 'published', heading: scenario.underReview },
          { lifecycle: 'inactive', heading: scenario.inactive }
        ] as const) {
          setLocalPlaceLifecycle(placeId, state.lifecycle);
          await page.goto(`/${scenario.locale}/places/${placeId}`);
          await waitForHydration(page);
          await expect(page.locator('header[data-ui-mode="place"]')).toBeVisible();
          await expect(page.locator('main[data-ui-mode="place"]')).toBeVisible();
          const statusPanel = page.locator('article.hv-panel.status-panel');
          await expect(statusPanel).toBeVisible();
          await expect(statusPanel.locator('.hv-notice[data-tone="info"]')).toBeVisible();
          await expect(statusPanel.getByRole('heading', { name: state.heading })).toBeVisible();
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
  await page.getByLabel('Email address').fill(evaluationModerator.email);
  const signInInvalidation = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      responseUrl.pathname === '/en/moderation/sign-in/__data.json' &&
      responseUrl.searchParams.has('x-sveltekit-invalidated') &&
      response.ok()
    );
  });
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
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
  await page.getByLabel('Place name').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Place type')).toBeFocused();
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
  context,
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
    await expect(page.locator('#candidate-publication')).toBeVisible();
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
    await expect(decisionOption).toHaveAttribute('aria-pressed', 'true');
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`);
  await waitForHydration(page);
  await fillWorkspaceSuggestionResolution(page, 'en');
  await page.locator('#suggestion-decision input[name="suggestionId"]').evaluate((input) => {
    if (input instanceof HTMLInputElement) input.value = 'not-a-suggestion-id';
  });
  evidence.allowHttpStatus(400, '/en/moderation?/resolve');
  await page.getByRole('button', { name: moderationWorkspaceCopy.en.saveOutcome }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: moderationWorkspaceCopy.en.invalid })
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page, evidence);

  // A second signed-in tab wins the race so the original tab exercises a genuine stale-write
  // conflict. The conflict must be announced and retain everything the Moderator typed.
  await provisionLocalSuggestionFixture(evaluationModerator.email);
  await page.goto(`/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`);
  const winningPage = await context.newPage();
  await winningPage.goto(`/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`);
  await fillWorkspaceSuggestionResolution(page, 'en', 'rejected');
  await fillWorkspaceSuggestionResolution(winningPage, 'en', 'rejected');
  const winningResolution = winningPage.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      responseUrl.pathname === '/en/moderation' &&
      responseUrl.searchParams.has('/resolve')
    );
  });
  await Promise.all([
    winningResolution,
    winningPage.waitForURL((url) => url.searchParams.get('item')?.endsWith('0094') ?? false, {
      waitUntil: 'networkidle'
    }),
    winningPage.getByRole('button', { name: moderationWorkspaceCopy.en.saveOutcome }).click()
  ]);
  await expect(winningPage.locator('.live-status')).toContainText(moderationWorkspaceCopy.en.saved);
  evidence.allowHttpStatus(409, '/en/moderation?/resolve');
  await page.getByRole('button', { name: moderationWorkspaceCopy.en.saveOutcome }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: moderationWorkspaceCopy.en.conflict })
  ).toBeVisible();
  await expect(page.getByLabel(moderationWorkspaceCopy.en.memberReasonEn)).toHaveValue(
    'Please confirm that the source is still current.'
  );
  await expectNoSeriousAxeViolations(page, evidence);
  await winningPage.close();

  await provisionLocalSuggestionFixture(evaluationModerator.email);
  await page.goto(`/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`);
  await fillWorkspaceSuggestionResolution(page, 'en');
  await page.getByRole('button', { name: moderationWorkspaceCopy.en.saveOutcome }).click();
  await expect(page.locator('.live-status')).toContainText(moderationWorkspaceCopy.en.saved);
  await expect(
    page.getByRole('region', { name: moderationWorkspaceCopy.en.selectedItem })
  ).toContainText(moderationWorkspaceCopy.en.nextSuggestion);
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
  const motionDurations = await marker.evaluate((element) => {
    const styles = getComputedStyle(element);
    const toMilliseconds = (duration: string): number =>
      duration.endsWith('ms') ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000;
    return {
      animation: toMilliseconds(styles.animationDuration),
      transition: toMilliseconds(styles.transitionDuration)
    };
  });
  expect(motionDurations.animation).toBeLessThanOrEqual(0.01);
  expect(motionDurations.transition).toBeLessThanOrEqual(0.01);
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
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
      heading: 'Welcome to Hundavænt',
      email: 'Email address',
      send: 'Send sign-in link'
    },
    {
      locale: 'is',
      viewport: { width: 390, height: 844 },
      heading: 'Velkomin á Hundavænt',
      email: 'Netfang',
      send: 'Senda innskráningartengil'
    }
  ] as const;

  for (const scenario of cases) {
    await page.setViewportSize(scenario.viewport);
    await page.goto(`/${scenario.locale}/account?returnTo=%2F${scenario.locale}`);
    await expect(page.getByRole('heading', { name: scenario.heading })).toBeVisible();

    const email = page.getByLabel(scenario.email);
    await email.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: scenario.send })).toBeFocused();
    await expectNoSeriousAxeViolations(page, evidence);
  }
});

test('private Favourite actions and the saved view are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  const email = `favourite-a11y-${Date.now()}@example.invalid`;
  await page.goto('/en/account?returnTo=%2Fen%2Fsaved');
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(email));
  await expect(page.getByRole('heading', { name: 'Saved places', exact: true })).toBeVisible();
  await page.evaluate(async (placeId) => {
    const response = await fetch(`/api/favourites/${placeId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ desiredState: true })
    });
    if (!response.ok) throw new Error('Could not prepare Favourite accessibility state');
    await response.json();
  }, evaluationFixtureIds.places.published);
  await page.reload();
  // A fresh load must finish hydrating before a keyboard interaction fires -- otherwise the
  // Enter keypress can land before Svelte attaches its click handler and silently no-op,
  // leaving the "No saved places yet" heading focus assertion below to time out.
  await waitForHydration(page);
  const remove = page.getByRole('button', {
    name: 'Remove Published Place from saved places'
  });
  const favouriteAction = page.locator(
    `[data-favourite-place="${evaluationFixtureIds.places.published}"]`
  );
  await expect(favouriteAction).toHaveAttribute('data-state', 'selected');
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await expect(remove).toHaveAttribute('data-state', 'selected');
  await expect(remove).toHaveAttribute('data-intent', 'selected');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'No saved places yet' })).toBeFocused();
  await expect(page.getByRole('status')).toContainText(
    'Published Place was removed from your saved places.'
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
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
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
  await page.getByLabel('Email address').fill(memberEmail);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(memberEmail));

  await page.goto(`/en/places/${correctable.placeId}/correct?field=phone`);
  await expect(page.getByRole('heading', { name: 'Suggest a correction' })).toBeVisible();
  await page.getByLabel('What are you correcting?').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Choose the detail')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto(
    `/en/places/${correctable.placeId}/report?conditionId=${correctable.accessConditionId}`
  );
  await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
  await page.getByLabel('What kind of problem is this?').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('This is a Safety Concern')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  const reviewFlagId = await provisionLocalPlaceFlagReviewFixture(evaluationModerator.email);
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fcorrections-and-reports');
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(evaluationModerator.email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));

  await page.goto(`/en/moderation/corrections-and-reports/${reviewFlagId}`);
  await expect(page.getByText('Safety Concern')).toBeVisible();
  await page.getByLabel('Outcome').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Member explanation in Icelandic')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  // The three fixture Places are published so they can be targeted by a Correction/Report;
  // retiring them keeps them out of public discovery for whichever suite shares this local
  // database session next, matching visual.spec.ts's handling of the same fixture.
  retireLocalPlaceFlagFixtures();
});

test('Dog-Friendliness Rating form, public Summary, and Moderator exclusion view are keyboard-operable and Axe-clean', async ({
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
    await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en/places/${placeId}/rate`)}`);
    await waitForHydration(page);
    await page.getByLabel('Email address').fill(memberEmail);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await page.goto(await waitForLocalMagicLink(memberEmail));

    await expect(page.getByRole('heading', { name: 'Rate Dog-Friendliness' })).toBeVisible();
    await page.getByLabel('Welcome').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Clarity')).toBeFocused();
    await expectNoSeriousAxeViolations(page, evidence);

    await page.getByLabel('Welcome').selectOption('4');
    await page.getByLabel('Clarity').selectOption('na');
    await page.getByLabel('Comfort').selectOption('5');
    await page.getByLabel('Thoughtfulness').selectOption('3');
    await page.getByRole('button', { name: 'Save Rating' }).click();
    await expect(page).toHaveURL(`/en?place=${placeId}`);

    const secondMember = await browser.newContext();
    try {
      const secondPage = await secondMember.newPage();
      const secondEmail = `dog-friendliness-a11y-second-${Date.now()}@example.invalid`;
      const ratingPath = `/en/places/${placeId}/rate`;
      await clearLocalEvaluationMailbox();
      await secondPage.goto(`/en/account?returnTo=${encodeURIComponent(ratingPath)}`);
      await waitForHydration(secondPage);
      await secondPage.getByLabel('Email address').fill(secondEmail);
      await secondPage.getByRole('button', { name: 'Send sign-in link' }).click();
      await secondPage.goto(await waitForLocalMagicLink(secondEmail));
      await secondPage.getByLabel('Welcome').selectOption('5');
      await secondPage.getByLabel('Clarity').selectOption('4');
      await secondPage.getByLabel('Comfort').selectOption('4');
      await secondPage.getByLabel('Thoughtfulness').selectOption('4');
      await secondPage.getByRole('button', { name: 'Save Rating' }).click();
    } finally {
      await secondMember.close();
    }

    await page.goto(`/en?place=${placeId}&view=map`);
    await selected.locator('summary').click();
    const ratingEvidence = page.locator('[data-rating-summary][data-rating-visible="true"]');
    await expect(ratingEvidence).toBeVisible();
    await expect(ratingEvidence.locator('[data-status="info"]')).toHaveCount(2);
    await expect(ratingEvidence.locator('dl')).toBeVisible();
    await expectNoHorizontalPageScroll(page);
    await expectNoSeriousAxeViolations(page, evidence);

    await page.goto(
      `/en/moderation/sign-in?returnTo=${encodeURIComponent(`/en/moderation/dog-friendliness/${placeId}`)}`
    );
    await waitForHydration(page);
    await page.getByLabel('Email address').fill(evaluationModerator.email);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
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
      sendLabel: 'Send sign-in link',
      title: 'Visits',
      visits: 'Visits',
      map: 'Map'
    },
    {
      locale: 'is',
      emailLabel: 'Netfang',
      sendLabel: 'Senda innskráningartengil',
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
    await page.getByLabel(scenario.emailLabel).fill(email);
    await page.getByRole('button', { name: scenario.sendLabel }).click();
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

test('Private Rating Note fieldset, Report prompt, and Moderator note workspace are keyboard-operable and Axe-clean', async ({
  page,
  evidence
}) => {
  await provisionLocalModerator(evaluationModerator.email);
  provisionLocalPrivateRatingNoteFixture();
  await configureLocalPrivateRatingNotePolicy();
  await configureLocalPlaceFlagAbusePolicy();
  const { placeId } = localPrivateRatingNoteFixture;

  const memberEmail = `rating-note-a11y-${Date.now()}@example.invalid`;
  await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en/places/${placeId}/rate`)}`);
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(memberEmail);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(memberEmail));
  await waitForHydration(page);

  // A qualifying low score reveals the note fieldset with an explicit classification group.
  await expect(page.getByRole('heading', { name: 'Rate Dog-Friendliness' })).toBeVisible();
  await page.getByLabel('Welcome').selectOption('1');
  await page.getByLabel('Clarity').selectOption('na');
  await page.getByLabel('Comfort').selectOption('na');
  await page.getByLabel('Thoughtfulness').selectOption('na');
  await expect(page.getByText('Private context for a low Rating')).toBeVisible();
  await page.getByLabel('A subjective experience').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Possibly inaccurate access information')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await page
    .getByLabel('Your private explanation')
    .fill('The posted opening hours do not match what staff told me.');
  await page.getByRole('button', { name: 'Save Rating' }).click();

  // The explicit Report prompt is itself a labelled, keyboard-reachable region.
  await expect(page.getByText('Send a formal Report?')).toBeVisible();
  await page.getByRole('button', { name: 'Create a Report from this note' }).focus();
  await expect(page.getByRole('button', { name: 'Create a Report from this note' })).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await page.goto(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(`/en/moderation/dog-friendliness/${placeId}`)}`
  );
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(evaluationModerator.email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
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
  await page.getByLabel('Email address').fill(evaluationModerator.email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(evaluationModerator.email));
  await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();

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
  const photoColumn = page.locator('[data-media-column="photo"]');
  await photoColumn
    .getByLabel('Image (PNG, JPEG, or WebP, 15 MB maximum)')
    .setInputFiles(fixturePngFile('a11y-photo.png', 200, 150, { r: 70, g: 130, b: 180 }));
  await photoColumn.getByRole('button', { name: 'Upload Photo' }).click();
  await expect(page.getByText('Media uploaded.')).toBeVisible();

  const photoItem = photoColumn.locator('li[data-media-item]').first();
  const photographerField = photoItem.getByLabel('Photographer or uploader');
  await photographerField.focus();
  await page.keyboard.press('Tab');
  await expect(photoItem.getByLabel('Capture or source date')).toBeFocused();
  await expectNoSeriousAxeViolations(page, evidence);

  await photographerField.fill('A11y Photographer');
  await photoItem.getByLabel('Capture or source date').fill('2026-07-01');
  await photoItem
    .getByLabel('License or permission reference')
    .fill('Owner-supplied, a11y fixture');
  await photoItem.getByLabel('Rights basis').selectOption('explicit_permission');
  await photoItem
    .getByLabel('Rights evidence reference')
    .fill('Owner permission fixture recorded for accessibility evaluation');
  await photoItem
    .getByLabel('Public attribution text')
    .fill('Photo by A11y Photographer, used with permission');
  await photoItem.getByLabel('People shown in the photo').selectOption('no_prominent_people');
  await photoItem.getByLabel('Image description (Icelandic)').fill('Hundur, aðgengispróf');
  await photoItem.getByLabel('Image description (English)').fill('A dog, accessibility fixture');
  await photoItem.getByRole('button', { name: 'Approve' }).click();
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
      sendLabel: 'Send sign-in link',
      title: 'Your Achievements',
      backLink: 'My account'
    },
    {
      locale: 'is',
      emailLabel: 'Netfang',
      sendLabel: 'Senda innskráningartengil',
      title: 'Afrekin þín',
      backLink: 'Reikningurinn minn'
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
      await page.getByLabel(scenario.emailLabel).fill(email);
      await page.getByRole('button', { name: scenario.sendLabel }).click();
      await page.goto(await waitForLocalMagicLink(email));
      await waitForHydration(page);

      // A mixed catalogue: one acknowledged unlock plus one newly-earned unlock, so the Axe pass
      // covers the earned, newly-earned, and locked treatments at once.
      await provisionLocalAchievementUnlock(email, 'first_favourite', '2026-07-01T12:00:00Z', true);
      await provisionLocalAchievementUnlock(email, 'first_checkin', '2026-07-02T12:00:00Z', false);
      await page.goto(`/${scenario.locale}/account/achievements`);
      await waitForHydration(page);

      await expect(page.getByRole('heading', { name: scenario.title })).toBeVisible();
      // The signed-in header carries an equally-named account link; scope to the page body.
      const backLink = page.locator('main').getByRole('link', { name: scenario.backLink });
      await backLink.focus();
      await expect(backLink).toBeFocused();
      await expectNoSeriousAxeViolations(page, evidence);
    }
  } finally {
    await disableLocalAchievementPolicy();
  }
});
