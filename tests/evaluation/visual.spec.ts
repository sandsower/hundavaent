import type { BrowserContext, Page } from '@playwright/test';

import { expect, test, type EvaluationEvidenceRecorder } from './evidence-fixture';
import {
  evaluationFixtureIds,
  evaluationFixtureTimes,
  evaluationModerator,
  evaluationPublisher
} from './fixtures';
import {
  clearLocalEvaluationMailbox,
  clearLocalCheckIns,
  clearLocalPlaceMedia,
  configureLocalAchievementPolicy,
  configureLocalDogFriendlinessSummaryPolicy,
  configureLocalPlaceFlagAbusePolicy,
  configureLocalPrivateRatingNotePolicy,
  disableLocalAchievementPolicy,
  disableLocalDogFriendlinessSummaryPolicy,
  disableLocalPrivateRatingNotePolicy,
  expireLocalMagicLink,
  localDogFriendlinessFixture,
  localPlaceFlagFixtures,
  localPrivateRatingNoteFixture,
  provisionLocalAchievementUnlock,
  provisionLocalDogFriendlinessFixture,
  provisionLocalModerator,
  provisionLocalModerationWorkbenchFixtures,
  provisionLocalPlaceFlagFixtures,
  provisionLocalPlaceFlagReviewFixture,
  provisionLocalPrivateRatingNoteFixture,
  provisionLocalSuggestionFixture,
  retireLocalDogFriendlinessFixture,
  retireLocalMemberAchievements,
  retireLocalPlaceFlagFixtures,
  retireLocalPrivateRatingNoteFixture,
  setLocalPlaceLifecycle,
  waitForLocalMagicLink
} from '../e2e/support/local-supabase';
import { waitForHydration } from '../e2e/support/hydration';
import { fixturePngFile } from '../e2e/support/fixture-image';

type Locale = 'is' | 'en';

const copy = {
  is: {
    directory: 'Hundavænt',
    list: 'Listi',
    map: 'Kort',
    mapFailure: 'Kortið er ekki tiltækt í augnablikinu',
    moderatorEmail: 'Netfang',
    sendLink: 'Senda innskráningartengil',
    linkSent: 'Tengillinn hefur verið sendur.',
    memberSendLink: 'Senda mér innskráningartengil',
    checkEmail: 'Athugaðu tölvupóstinn',
    moderationHub: 'Umsjón',
    candidateQueue: 'Tillögur að stöðum',
    moderationWorkspace: 'Umsjónarborð',
    moderationQueues: 'Umsjónarraðir',
    selectedModerationQueue: 'Valin umsjónarröð',
    selectedModerationItem: 'Valið umsjónaratriði',
    suggestionsQueue: 'Tillögur',
    correctionsAndReportsQueue: 'Leiðréttingar og ábendingar',
    candidatePlacesQueue: 'Tillögur að stöðum',
    decisionControls: 'Ákvörðunarstýringar',
    visualSuggestion: 'Sjónræn tillaga',
    candidateForm: 'Bæta við tillögu að stað',
    suggestionForm: 'Leggðu til stað',
    submitted: 'Móttekin',
    evidenceObservedAt: 'Heimild skoðuð',
    checklist: 'Atriði fyrir birtingu',
    freshness: 'Staðfesting gildir til',
    notFound: 'Síðan fannst ekki',
    place: 'Birtur staður',
    selectPlace: 'Velja Birtur staður',
    selectedPlace: 'Valinn staður',
    correctionForm: 'Leggja til leiðréttingu',
    reportForm: 'Tilkynna vandamál',
    overallRating: 'Heildareinkunn',
    ratingSaved: 'Vistað',
    ratingSummary: 'Hundvænleiki að mati meðlima',
    dogFriendlinessReview: 'Hundvænleikamöt',
    historyTitle: 'Heimsóknir',
    noteText: 'Hvað mætti bæta? (valfrjálst)',
    mediaTitle: 'Myndefni',
    mediaFileLabel: 'Mynd (PNG, JPEG eða WebP, að hámarki 15 MB)',
    mediaSourceUrlLabel: 'Vefslóð heimildar',
    mediaCapturedAtLabel: 'Tökutími',
    uploadEvidenceAction: 'Hlaða upp sönnunargagni',
    uploadAndPublishAction: 'Hlaða upp og birta',
    mediaUploaded: 'Myndefni hlaðið upp.',
    optionalPhotoDetails: 'Valfrjálsar ljósmyndaupplýsingar',
    photographerLabel: 'Ljósmyndari eða sá sem hlóð upp',
    licenseDateLabel: 'Dagsetning myndatöku eða heimildar',
    licenseReferenceLabel: 'Leyfi eða heimild til birtingar',
    rightsEvidenceLabel: 'Tilvísun í sönnun fyrir afnotarétti',
    attributionTextLabel: 'Sýnileg höfundartilkynning',
    peopleReviewLabel: 'Fólk sem sést á myndinni',
    altTextIsLabel: 'Myndlýsing (íslenska)',
    altTextEnLabel: 'Myndlýsing (enska)',
    photoApproved: 'Ljósmynd samþykkt og birt.'
  },
  en: {
    directory: 'Hundavænt',
    list: 'List',
    map: 'Map',
    mapFailure: 'The map is unavailable right now',
    moderatorEmail: 'Email address',
    sendLink: 'Send sign-in link',
    linkSent: 'The link has been sent.',
    memberSendLink: 'Send me a sign-in link',
    checkEmail: 'Check your email',
    moderationHub: 'Moderation',
    candidateQueue: 'Candidate Places',
    moderationWorkspace: 'Moderation board',
    moderationQueues: 'Moderation queues',
    selectedModerationQueue: 'Selected moderation queue',
    selectedModerationItem: 'Selected moderation item',
    suggestionsQueue: 'Suggestions',
    correctionsAndReportsQueue: 'Corrections and reports',
    candidatePlacesQueue: 'Candidate places',
    decisionControls: 'Decision controls',
    visualSuggestion: 'Visual Suggestion',
    candidateForm: 'Add a Candidate Place',
    suggestionForm: 'Suggest a place',
    submitted: 'Submitted',
    evidenceObservedAt: 'Evidence observed at',
    checklist: 'Publication checklist',
    freshness: 'Verification valid until',
    notFound: 'Page not found',
    place: 'Published Place',
    selectPlace: 'Select Published Place',
    selectedPlace: 'Selected place',
    correctionForm: 'Suggest a correction',
    reportForm: 'Report a problem',
    overallRating: 'Overall rating',
    ratingSaved: 'Saved',
    ratingSummary: 'Dog-Friendliness by Members',
    dogFriendlinessReview: 'Dog-Friendliness Ratings',
    historyTitle: 'Visits',
    noteText: 'What could be better? (optional)',
    mediaTitle: 'Media',
    mediaFileLabel: 'Image (PNG, JPEG, or WebP, 15 MB maximum)',
    mediaSourceUrlLabel: 'Source URL',
    mediaCapturedAtLabel: 'Capture time',
    uploadEvidenceAction: 'Upload Evidence',
    uploadAndPublishAction: 'Upload and publish',
    mediaUploaded: 'Media uploaded.',
    optionalPhotoDetails: 'Optional photo details',
    photographerLabel: 'Photographer or uploader',
    licenseDateLabel: 'Capture or source date',
    licenseReferenceLabel: 'License or permission reference',
    rightsEvidenceLabel: 'Rights evidence reference',
    attributionTextLabel: 'Public attribution text',
    peopleReviewLabel: 'People shown in the photo',
    altTextIsLabel: 'Image description (Icelandic)',
    altTextEnLabel: 'Image description (English)',
    photoApproved: 'Photo approved and published.'
  }
} as const;

async function waitForMapOverlayToSettle(page: Page): Promise<void> {
  const markers = page.locator('.maplibregl-marker');
  if ((await markers.count()) === 0) return;

  let previousBounds = '';
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const bounds = JSON.stringify(
          await markers.evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect();
              return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10));
            })
          )
        );
        stableSamples = bounds === previousBounds ? stableSamples + 1 : 0;
        previousBounds = bounds;
        return stableSamples;
      },
      { intervals: [100], timeout: 5_000 }
    )
    .toBeGreaterThanOrEqual(3);
}

async function capture(
  page: Page,
  evidence: EvaluationEvidenceRecorder,
  name: string,
  options?: { prepare?: () => Promise<void> }
): Promise<void> {
  await waitForHydration(page);
  await waitForMapOverlayToSettle(page);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const horizontalOverflow =
    documentWidth > viewportWidth
      ? await page.locator('body *').evaluateAll(
          (elements, width) =>
            elements
              .map((element) => {
                const bounds = element.getBoundingClientRect();
                return {
                  element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
                    element.classList.length ? `.${[...element.classList].join('.')}` : ''
                  }`,
                  left: bounds.left,
                  right: bounds.right,
                  width: bounds.width
                };
              })
              .filter(({ left, right }) => left < 0 || right > width)
              .sort((a, b) => b.right - a.right)
              .slice(0, 10),
          viewportWidth
        )
      : [];
  expect(
    documentWidth,
    `${name} must not overflow horizontally: ${JSON.stringify(horizontalOverflow)}`
  ).toBeLessThanOrEqual(viewportWidth);
  await page.locator('img').evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (image) => {
        const decode = (image as HTMLImageElement).decode().catch(() => undefined);
        await Promise.race([
          decode,
          new Promise<void>((resolve) => window.setTimeout(resolve, 5_000))
        ]);
      })
    );
  });
  await page.locator('.maplibregl-canvas').evaluateAll((canvases) => {
    // CSS hiding can still leave the WebGL compositor layer in Playwright's full-page capture and
    // produce large black rectangles. The next state always navigates or recreates the map, so the
    // evidence pass can remove only the canvas while preserving layout and DOM marker evidence.
    for (const canvas of canvases) canvas.remove();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolvePaint) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()))
      )
  );
  await options?.prepare?.();
  evidence.require('screenshot');
  const screenshotPath = `test-results/visual/screenshots/${name}`;
  await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    path: screenshotPath,
    scale: 'css'
  });
  evidence.recordScreenshot(name, screenshotPath);
}

async function captureModerationWorkspaceScreenshot(
  page: Page,
  evidence: EvaluationEvidenceRecorder,
  name: string
): Promise<void> {
  await capture(page, evidence, name);
}

async function removeDynamicRequestReferenceForVisualEvidence(page: Page): Promise<void> {
  await page.locator('.reference').evaluateAll((elements) => {
    for (const element of elements) element.remove();
  });
}

async function normalizeNativeInputForVisualEvidence(page: Page, label: string): Promise<void> {
  await page.getByLabel(label).evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) return;

    const stableValue = element.value.replace('T', ' ');
    element.type = 'text';
    element.value = stableValue;
    element.setAttribute('value', stableValue);
  });
}

async function normalizeNativeInputsForVisualEvidence(page: Page): Promise<void> {
  await page.locator("input[type='date'], input[type='datetime-local']").evaluateAll((elements) => {
    for (const element of elements) {
      if (!(element instanceof HTMLInputElement)) continue;

      const stableValue = element.value.replace('T', ' ');
      element.type = 'text';
      element.value = stableValue;
      element.setAttribute('value', stableValue);
    }
  });
}

async function normalizeCandidateReviewForVisualEvidence(page: Page): Promise<void> {
  // Chromium renders native date controls using the host OS locale, which differs between local
  // development and GitHub's Linux runners. Preserve the values while removing only that native,
  // machine-dependent presentation from visual evidence.
  await normalizeNativeInputsForVisualEvidence(page);
}

async function openModerationReviewSection(page: Page, selector: string): Promise<void> {
  const section = page.locator(selector);
  if ((await section.getAttribute('open')) === null) {
    const summary = section.locator(':scope > summary');
    await summary.focus();
    await summary.press('Enter');
  }
  await expect(section).toHaveAttribute('open', '');
}

async function signIn(
  page: Page,
  evidence: EvaluationEvidenceRecorder,
  locale: Locale
): Promise<void> {
  await provisionLocalModerator(evaluationModerator.email);
  await expireLocalMagicLink(evaluationModerator.email);
  await clearLocalEvaluationMailbox();
  await page.goto(
    `/${locale}/moderation/sign-in?returnTo=%2F${locale}%2Fmoderation%2Fplaces%2Fnew`
  );
  await waitForHydration(page);
  await page
    .locator('main')
    .getByLabel(copy[locale].moderatorEmail)
    .fill(evaluationModerator.email);
  const invalidation = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      responseUrl.pathname === `/${locale}/moderation/sign-in/__data.json` &&
      responseUrl.searchParams.has('x-sveltekit-invalidated') &&
      response.ok()
    );
  });
  await page.locator('main').getByRole('button', { name: copy[locale].sendLink }).click();
  await expect(page.getByText(copy[locale].linkSent)).toBeVisible();
  await invalidation;
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(`/${locale}/moderation/places/new`);
}

async function captureModerationWorkspaceStates(
  context: BrowserContext,
  evidence: EvaluationEvidenceRecorder,
  locale: Locale
): Promise<void> {
  const fixtures = await provisionLocalModerationWorkbenchFixtures(evaluationModerator.email);
  const moderationPage = await context.newPage();
  await moderationPage.setViewportSize({ width: 1280, height: 900 });
  await moderationPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${fixtures.suggestionId}&filter=actionable`
  );
  await waitForHydration(moderationPage);
  await expect(
    moderationPage.getByRole('heading', {
      name: copy[locale].moderationWorkspace,
      level: 1
    })
  ).toBeVisible();
  const moderationQueues = moderationPage.getByRole('navigation', {
    name: copy[locale].moderationQueues
  });
  await expect(moderationQueues).toBeVisible();
  await expect(moderationQueues.getByRole('link')).toHaveCount(3);
  await expect(
    moderationQueues.getByRole('link', {
      name: new RegExp(`^${copy[locale].suggestionsQueue} \\d+$`)
    })
  ).toBeVisible();
  await expect(
    moderationQueues.getByRole('link', {
      name: new RegExp(`^${copy[locale].correctionsAndReportsQueue} \\d+$`)
    })
  ).toBeVisible();
  await expect(
    moderationQueues.getByRole('link', {
      name: new RegExp(`^${copy[locale].candidatePlacesQueue} \\d+$`)
    })
  ).toBeVisible();
  await expect(
    moderationPage.getByRole('region', { name: copy[locale].selectedModerationQueue })
  ).toBeVisible();
  await expect(
    moderationPage.getByRole('region', { name: copy[locale].selectedModerationItem })
  ).toContainText(copy[locale].visualSuggestion);
  await expect(
    moderationPage.getByRole('region', { name: copy[locale].decisionControls })
  ).toBeVisible();
  await captureModerationWorkspaceScreenshot(
    moderationPage,
    evidence,
    `moderation-workspace-${locale}-desktop.png`
  );

  await moderationPage.goto(
    `/${locale}/moderation?queue=candidate-places&item=${fixtures.candidatePlaceId}&filter=actionable`
  );
  await waitForHydration(moderationPage);
  await expect(moderationPage.getByRole('heading', { name: copy[locale].checklist })).toBeVisible();
  await captureModerationWorkspaceScreenshot(
    moderationPage,
    evidence,
    `moderation-workspace-candidate-${locale}-desktop.png`
  );

  await moderationPage.goto(
    `/${locale}/moderation?queue=corrections-and-reports&item=${fixtures.correctionFlagId}&filter=actionable`
  );
  await waitForHydration(moderationPage);
  await expect(moderationPage.locator('#correction-change')).toBeVisible();
  await captureModerationWorkspaceScreenshot(
    moderationPage,
    evidence,
    `moderation-workspace-correction-${locale}-desktop.png`
  );

  await moderationPage.setViewportSize({ width: 390, height: 844 });
  await captureModerationWorkspaceScreenshot(
    moderationPage,
    evidence,
    `moderation-workspace-correction-${locale}-mobile.png`
  );
  await moderationPage.close();
}

for (const locale of ['is', 'en'] as const) {
  test(`captures the ${locale} compact moderation workspace states`, async ({
    context,
    page,
    evidence
  }) => {
    await provisionLocalModerator(evaluationModerator.email);
    await signIn(page, evidence, locale);
    await captureModerationWorkspaceStates(context, evidence, locale);
  });

  test(`captures the ${locale} product states at named viewports`, async ({
    browser,
    page,
    evidence
  }) => {
    await provisionLocalModerator(evaluationModerator.email);
    await provisionLocalModerator(evaluationPublisher.email);
    // Defensive: an aborted earlier attempt (for example a missing new screenshot baseline) can
    // exit this test before its own end-of-pass retirements run, leaving the private-rating-note fixture Place
    // published and leaking an extra marker into the directory captures below.
    retireLocalPrivateRatingNoteFixture();
    retireLocalDogFriendlinessFixture();
    provisionLocalDogFriendlinessFixture();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${locale}?view=map`);
    await expect(page.getByRole('heading', { name: copy[locale].directory })).toBeVisible();
    await expect(page.getByRole('button', { name: copy[locale].place, exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: locale === 'is' ? 'Staðir sem fundust' : 'Places found' })
    ).toBeVisible();
    await capture(page, evidence, `directory-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}?view=map`);
    await expect(page.getByRole('heading', { name: copy[locale].map })).toBeVisible();
    await expect(page.getByRole('button', { name: copy[locale].place, exact: true })).toBeVisible();
    await page
      .getByRole('button', {
        name: locale === 'is' ? /Sýna \d+ niðurstöð/ : /Show \d+ results?/
      })
      .click();
    await expect(
      page.getByRole('region', { name: locale === 'is' ? 'Staðir sem fundust' : 'Places found' })
    ).toBeVisible();
    await capture(page, evidence, `directory-${locale}-mobile.png`);
    retireLocalDogFriendlinessFixture();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${locale}?place=${evaluationFixtureIds.places.published}&view=map`);
    await expect(page.locator('.map-surface[data-paint-ready]')).toHaveAttribute(
      'data-paint-ready',
      'true'
    );
    await expect(
      page.getByRole('button', { name: copy[locale].place, exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('complementary', { name: copy[locale].selectedPlace })
    ).toBeVisible();
    await capture(page, evidence, `selected-place-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}?place=${evaluationFixtureIds.places.published}&view=map`);
    await expect(page.locator('.map-surface[data-paint-ready]')).toHaveAttribute(
      'data-paint-ready',
      'true'
    );
    await expect(
      page.getByRole('complementary', { name: copy[locale].selectedPlace })
    ).toBeVisible();
    await capture(page, evidence, `selected-place-${locale}-mobile.png`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${locale}?place=${evaluationFixtureIds.places.published}&view=map`);
    await expect(page.locator('.map-surface[data-paint-ready]')).toHaveAttribute(
      'data-paint-ready',
      'true'
    );
    const accessCard = page.getByRole('complementary', { name: copy[locale].selectedPlace });
    await expect(accessCard).toBeVisible();
    await accessCard.locator('details.hv-disclosure').locator(':scope > summary').click();
    await expect(
      accessCard.getByRole('heading', { name: locale === 'is' ? 'Aðgangur hunda' : 'Dog access' })
    ).toBeVisible();
    await capture(page, evidence, `access-details-${locale}-desktop.png`);

    const statusPlaceId = evaluationFixtureIds.places.unverified;
    setLocalPlaceLifecycle(statusPlaceId, 'published');
    try {
      evidence.allowHttpStatus(404, `/places/${statusPlaceId}`);
      evidence.allowConsoleError(
        'Failed to load resource: the server responded with a status of 404'
      );
      const unavailableResponse = await page.goto(`/${locale}/places/${statusPlaceId}`);
      expect(unavailableResponse?.status()).toBe(404);
      await expect(page.locator('header[data-ui-mode="place"]')).toBeVisible();
      await expect(page.locator('main[data-ui-mode="place"]')).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: locale === 'is' ? 'Síðan fannst ekki' : 'Page not found'
        })
      ).toBeVisible();
      await capture(page, evidence, `place-unavailable-published-${locale}-desktop.png`, {
        prepare: () => removeDynamicRequestReferenceForVisualEvidence(page)
      });

      setLocalPlaceLifecycle(statusPlaceId, 'inactive');
      const inactiveResponse = await page.goto(`/${locale}/places/${statusPlaceId}`);
      expect(inactiveResponse?.status()).toBe(404);
      await expect(
        page.getByRole('heading', {
          name: locale === 'is' ? 'Síðan fannst ekki' : 'Page not found'
        })
      ).toBeVisible();
      await capture(page, evidence, `place-unavailable-inactive-${locale}-desktop.png`, {
        prepare: () => removeDynamicRequestReferenceForVisualEvidence(page)
      });
    } finally {
      setLocalPlaceLifecycle(statusPlaceId, 'published');
    }

    await page.goto(`/${locale}?__mapFailure=1&view=map`);
    await expect(page.getByRole('heading', { name: copy[locale].mapFailure })).toBeVisible();
    await capture(page, evidence, `map-failure-${locale}-desktop.png`);

    evidence.allowHttpStatus(404, '/places/00000000-0000-4000-8000-000000000000');
    evidence.allowConsoleError(
      'Failed to load resource: the server responded with a status of 404'
    );
    const missingResponse = await page.goto(
      `/${locale}/places/00000000-0000-4000-8000-000000000000`
    );
    expect(missingResponse?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: copy[locale].notFound })).toBeVisible();
    await capture(page, evidence, `not-found-${locale}-desktop.png`, {
      prepare: () => removeDynamicRequestReferenceForVisualEvidence(page)
    });

    await signIn(page, evidence, locale);

    await page.goto(`/${locale}/moderation/places/new`);
    await expect(page.getByRole('heading', { name: copy[locale].candidateForm })).toBeVisible();
    await page
      .getByLabel(copy[locale].evidenceObservedAt)
      .fill(evaluationFixtureTimes.observedAt.slice(0, 16));
    await normalizeNativeInputForVisualEvidence(page, copy[locale].evidenceObservedAt);
    await capture(page, evidence, `candidate-form-${locale}-desktop.png`);

    const favouriteMutation = await page.evaluate(async (placeId) => {
      const response = await fetch(`/api/favourites/${placeId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ desiredState: true })
      });
      const payload = (await response.json()) as {
        placeId?: unknown;
        isFavourite?: unknown;
        changedAt?: unknown;
      };
      return { ok: response.ok, status: response.status, payload };
    }, evaluationFixtureIds.places.published);
    expect(favouriteMutation).toMatchObject({
      ok: true,
      status: 200,
      payload: { placeId: evaluationFixtureIds.places.published, isFavourite: true }
    });
    expect(
      typeof favouriteMutation.payload.changedAt === 'string' &&
        Number.isFinite(Date.parse(favouriteMutation.payload.changedAt))
    ).toBe(true);
    await page.goto(`/${locale}/favorites`);
    await expect(
      page.getByRole('heading', { name: locale === 'is' ? 'Uppáhaldsstaðir' : 'Favorites' })
    ).toBeVisible();
    await capture(page, evidence, `saved-places-${locale}-desktop.png`);

    await page.goto(`/${locale}/account`);
    const weeklyRhythmHistory = page.locator('[data-weekly-rhythm-history]');
    await expect(weeklyRhythmHistory).toHaveAttribute('data-state', 'available');
    await expect(weeklyRhythmHistory.locator('[data-week-start]')).toHaveCount(8);
    await expect(page.locator('[data-weekly-rhythm-indicator][data-state="active"]')).toBeVisible();
    await capture(page, evidence, `weekly-rhythm-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-weekly-rhythm-indicator][data-state="active"]')).toBeVisible();
    await capture(page, evidence, `weekly-rhythm-${locale}-mobile.png`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await capture(page, evidence, `weekly-rhythm-${locale}-reduced-motion-desktop.png`);
    await page.emulateMedia({ reducedMotion: null });

    // The personal-history route (personal-history): the same Place is also checked in, so its four views
    // show a mixed Favourite-and-visited state rather than an empty one.
    await page.goto(`/${locale}?place=${evaluationFixtureIds.places.published}&view=map`);
    await waitForHydration(page);
    const selectedCheckInProfile = page.getByRole('complementary', {
      name: copy[locale].selectedPlace
    });
    await selectedCheckInProfile
      .getByRole('button', {
        name:
          locale === 'is'
            ? `Skrá heimsókn hjá ${copy[locale].place}`
            : `Check in at ${copy[locale].place}`
      })
      .click();
    await expect(
      selectedCheckInProfile.locator(
        '[data-weekly-rhythm-acknowledgement][data-recognition-action="check_in"][data-activated-week="false"]'
      )
    ).toBeVisible();
    await capture(page, evidence, `weekly-rhythm-acknowledgement-${locale}-desktop.png`);

    try {
      await page.goto(`/${locale}?place=${evaluationFixtureIds.places.published}&view=map`);
      const selectedMemberProfile = page.getByRole('complementary', {
        name: copy[locale].selectedPlace
      });
      await expect(selectedMemberProfile).toHaveAttribute('data-overlay', 'place');
      const selectedFavourite = selectedMemberProfile.locator(
        `[data-favourite-place="${evaluationFixtureIds.places.published}"]`
      );
      await expect(selectedFavourite).toHaveAttribute('data-state', 'selected');
      await expect(selectedFavourite.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
      await expect(selectedFavourite.getByRole('button')).toHaveAttribute('data-state', 'selected');
      await expect(selectedFavourite.getByRole('button')).toHaveAttribute(
        'data-intent',
        'selected'
      );
      const committedCheckIn = selectedMemberProfile.locator('section[data-state="committed"]');
      await expect(committedCheckIn).toBeVisible();
      await expect(committedCheckIn.getByRole('status')).toHaveAttribute('data-status', 'success');
      await capture(page, evidence, `selected-member-actions-${locale}-desktop.png`);

      await page.goto(`/${locale}/history`);
      await expect(page.getByRole('heading', { name: copy[locale].historyTitle })).toBeVisible();
      await expect(page.getByRole('heading', { name: copy[locale].place })).toBeVisible();
      await capture(page, evidence, `history-favourites-${locale}-desktop.png`);

      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, evidence, `history-favourites-${locale}-mobile.png`);
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto(`/${locale}/history?view=checkins`);
      await expect(page.getByRole('heading', { name: copy[locale].place })).toBeVisible();
      await capture(page, evidence, `history-checkins-${locale}-desktop.png`);

      await page.goto(`/${locale}/history?view=map`);
      await expect(page.locator('.map-surface[data-paint-ready]')).toHaveAttribute(
        'data-paint-ready',
        'true'
      );
      // Both the map marker and the synchronized side-list button share the accessible name, so
      // this scopes to the marker specifically (mirroring the directory map assertions above).
      await expect(
        page.locator('.map-surface').getByRole('button', { name: copy[locale].place, exact: true })
      ).toBeVisible();
      await capture(page, evidence, `history-map-${locale}-desktop.png`);
    } finally {
      clearLocalCheckIns(evaluationFixtureIds.places.published);
    }

    // The achievements surface (achievement). The policy is a database-wide fail-closed singleton and
    // unlock acknowledgment is consumed on every catalogue read, so each state is provisioned
    // deterministically (fixed earned dates - baselines must never depend on the capture day)
    // and the seeded dark state is restored afterwards.
    await configureLocalAchievementPolicy();
    await retireLocalMemberAchievements(evaluationModerator.email);

    const achievementsTitle = locale === 'is' ? 'Afrekin þín' : 'Your Achievements';
    const provisionAchievementEvidence = async (): Promise<void> => {
      await retireLocalMemberAchievements(evaluationModerator.email);
      await provisionLocalAchievementUnlock(
        evaluationModerator.email,
        'first_favourite',
        '2026-07-01T12:00:00Z',
        true
      );
      await provisionLocalAchievementUnlock(
        evaluationModerator.email,
        'first_checkin',
        '2026-07-02T12:00:00Z',
        false
      );
    };

    await page.goto(`/${locale}/account/achievements`);
    await expect(page.getByRole('heading', { name: achievementsTitle })).toBeVisible();
    await capture(page, evidence, `achievements-locked-${locale}-desktop.png`);

    // First unlock: a mixed catalogue with one acknowledged unlock, one newly-earned unlock, and
    // eight locked entries. The first view consumes the newly-earned indicator, so the badge-free
    // earned catalogue is simply the next view of the same state.
    await provisionAchievementEvidence();
    await page.goto(`/${locale}/account/achievements`);
    await expect(page.getByRole('heading', { name: achievementsTitle })).toBeVisible();
    await capture(page, evidence, `achievements-new-${locale}-desktop.png`);

    await page.goto(`/${locale}/account/achievements`);
    await expect(page.getByRole('heading', { name: achievementsTitle })).toBeVisible();
    await capture(page, evidence, `achievements-earned-${locale}-desktop.png`);

    await provisionAchievementEvidence();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/account/achievements`);
    await expect(page.getByRole('heading', { name: achievementsTitle })).toBeVisible();
    await capture(page, evidence, `achievements-new-${locale}-mobile.png`);
    await page.setViewportSize({ width: 1280, height: 900 });

    await provisionAchievementEvidence();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${locale}/account/achievements`);
    await expect(page.getByRole('heading', { name: achievementsTitle })).toBeVisible();
    await capture(page, evidence, `achievements-new-reduced-motion-${locale}-desktop.png`);
    await page.emulateMedia({ reducedMotion: null });

    await retireLocalMemberAchievements(evaluationModerator.email);
    await disableLocalAchievementPolicy();

    // The personal-history captures navigated away from /favorites; return to it before the existing
    // removal step below, which depends on being on that page.
    await page.goto(`/${locale}/favorites`);
    await expect(
      page.getByRole('heading', { name: locale === 'is' ? 'Uppáhaldsstaðir' : 'Favorites' })
    ).toBeVisible();

    const removalResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith(`/api/favourites/${evaluationFixtureIds.places.published}`)
    );
    await page
      .getByRole('button', {
        name:
          locale === 'is'
            ? 'Fjarlægja Birtur staður úr uppáhaldi'
            : 'Remove Published Place from favorites'
      })
      .click();
    const completedRemoval = await removalResponse;
    expect(completedRemoval.ok()).toBe(true);
    expect(await completedRemoval.finished()).toBeNull();
    await expect(
      page.getByRole('heading', {
        name: locale === 'is' ? 'Engir uppáhaldsstaðir enn' : 'No favorites yet'
      })
    ).toBeVisible();

    await page.goto(`/${locale}/suggest`);
    await expect(page.getByRole('heading', { name: copy[locale].suggestionForm })).toBeVisible();
    await expect(
      page.getByRole('region', {
        name: locale === 'is' ? 'Veldu hvar staðurinn er' : 'Choose where the place is'
      })
    ).toBeVisible();
    await capture(page, evidence, `suggestion-form-${locale}-desktop.png`);

    const suggestionId = await provisionLocalSuggestionFixture(evaluationModerator.email);
    await page.goto(`/${locale}/account/suggestions`);
    for (const outcome of ['submitted', 'needs_information', 'accepted', 'duplicate', 'rejected']) {
      await expect(page.locator(`[data-outcome="${outcome}"]`).first()).toBeVisible();
    }
    await expect(page.getByText('Private visual-only Moderator note.')).toHaveCount(0);
    await capture(page, evidence, `suggestion-outcomes-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, evidence, `suggestion-outcomes-${locale}-mobile.png`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${locale}/moderation/suggestions/${suggestionId}`);
    await expect(
      page.getByRole('heading', {
        name: locale === 'is' ? 'Sjónræn tillaga' : 'Visual Suggestion'
      })
    ).toBeVisible();
    await capture(page, evidence, `suggestion-review-${locale}-desktop.png`);

    await configureLocalPlaceFlagAbusePolicy();
    provisionLocalPlaceFlagFixtures();
    const { correctable } = localPlaceFlagFixtures;

    await page.goto(`/${locale}/places/${correctable.placeId}/correct?field=phone`);
    await expect(page.getByRole('heading', { name: copy[locale].correctionForm })).toBeVisible();
    await capture(page, evidence, `correction-form-${locale}-desktop.png`);

    await page.goto(
      `/${locale}/places/${correctable.placeId}/report?conditionId=${correctable.accessConditionId}`
    );
    await expect(page.getByRole('heading', { name: copy[locale].reportForm })).toBeVisible();
    await capture(page, evidence, `report-form-${locale}-desktop.png`);

    const reviewFlagId = await provisionLocalPlaceFlagReviewFixture(evaluationModerator.email);
    await page.goto(`/${locale}/moderation/corrections-and-reports/${reviewFlagId}`);
    await expect(
      page.getByRole('link', {
        name: locale === 'is' ? 'Öryggismál' : 'Safety Concern',
        exact: true
      })
    ).toBeVisible();
    await capture(page, evidence, `corrections-and-reports-review-${locale}-desktop.png`);

    // The three fixture Places are published so they can be targeted by a Correction/Report;
    // retiring them now keeps them out of the public "directory" map/list capture the other
    // locale's pass of this same test still has to take later in this shared local session.
    retireLocalPlaceFlagFixtures();

    // provision_moderator also creates a private.member_accounts row for the already-signed-in
    // Moderator session, so the inline Rating can be captured without a separate Member sign-in.
    provisionLocalDogFriendlinessFixture();
    const { placeId: dogFriendlinessPlaceId } = localDogFriendlinessFixture;
    try {
      await configureLocalDogFriendlinessSummaryPolicy();
      await page.goto(`/${locale}?place=${dogFriendlinessPlaceId}&view=map`);
      await waitForHydration(page);
      const selectedRatingProfile = page.getByRole('complementary', {
        name: copy[locale].selectedPlace
      });
      const inlineRating = selectedRatingProfile.locator('[data-inline-rating]');
      const fourStars = inlineRating
        .getByRole('radiogroup', { name: copy[locale].overallRating })
        .getByRole('radio', { name: locale === 'is' ? '4 stjörnur' : '4 stars' });
      await expect(fourStars).toBeEnabled();
      await capture(page, evidence, `rating-inline-idle-${locale}-desktop.png`);
      await fourStars.click();
      await expect(inlineRating.getByText(copy[locale].ratingSaved)).toBeVisible();
      await capture(page, evidence, `rating-inline-details-${locale}-desktop.png`);

      const ratingMemberContext = await browser.newContext();
      try {
        const ratingMemberPage = await ratingMemberContext.newPage();
        await clearLocalEvaluationMailbox();
        await ratingMemberPage.goto(`/${locale}/account`);
        await waitForHydration(ratingMemberPage);
        const authDialog = ratingMemberPage.getByRole('dialog');
        await authDialog
          .getByLabel(copy[locale].moderatorEmail)
          .fill(`rating-visual-${locale}@example.invalid`);
        await authDialog.getByRole('button', { name: copy[locale].memberSendLink }).click();
        await expect(
          authDialog.getByRole('heading', { name: copy[locale].checkEmail })
        ).toBeVisible();
        await ratingMemberPage.goto(
          await waitForLocalMagicLink(`rating-visual-${locale}@example.invalid`)
        );
        await ratingMemberPage.goto(`/${locale}?place=${dogFriendlinessPlaceId}&view=map`);
        await waitForHydration(ratingMemberPage);
        const secondInlineRating = ratingMemberPage.locator('[data-inline-rating]');
        const fiveStars = secondInlineRating
          .getByRole('radiogroup', { name: copy[locale].overallRating })
          .getByRole('radio', { name: locale === 'is' ? '5 stjörnur' : '5 stars' });
        await expect(fiveStars).toBeEnabled();
        await fiveStars.click();
        await expect(secondInlineRating.getByText(copy[locale].ratingSaved)).toBeVisible();
      } finally {
        await ratingMemberContext.close();
      }

      await page.goto(`/${locale}?place=${dogFriendlinessPlaceId}&view=map`);
      await waitForHydration(page);
      await expect(selectedRatingProfile).toHaveAttribute('data-overlay', 'place');
      const publicAverage = selectedRatingProfile.getByLabel(copy[locale].ratingSummary);
      await expect(publicAverage).toBeVisible();
      await expect(publicAverage).toContainText('★');
      await capture(page, evidence, `selected-rating-average-${locale}-desktop.png`);

      await page.goto(`/${locale}/moderation/dog-friendliness/${dogFriendlinessPlaceId}`);
      await waitForHydration(page);
      await expect(
        page.getByRole('heading', { name: copy[locale].dogFriendlinessReview })
      ).toBeVisible();
      await capture(page, evidence, `dog-friendliness-review-${locale}-desktop.png`);
    } finally {
      try {
        await disableLocalDogFriendlinessSummaryPolicy();
      } finally {
        // The fixture Place is published so it can be discovered and rated; retiring it keeps it
        // out of the public directory map/list capture the other locale's pass still has to take.
        retireLocalDogFriendlinessFixture();
      }
    }

    // private-rating-note Private Rating Note: a fresh, dedicated fixture per locale pass
    // (provisioning also clears any Ratings the other locale's pass left on it) plus the
    // fail-closed policy explicitly enabled through the service-role RPC.
    provisionLocalPrivateRatingNoteFixture();
    await configureLocalPrivateRatingNotePolicy();
    const { placeId: notePlaceId } = localPrivateRatingNoteFixture;
    await page.goto(`/${locale}?place=${notePlaceId}&view=map`);
    await waitForHydration(page);
    const noteRating = page.locator('[data-inline-rating]');
    const oneStar = noteRating
      .getByRole('radiogroup', { name: copy[locale].overallRating })
      .getByRole('radio', { name: locale === 'is' ? '1 stjarna' : '1 star' });
    await expect(oneStar).toBeEnabled();
    await oneStar.click();
    const noteInput = noteRating.getByRole('textbox', { name: copy[locale].noteText });
    await expect(noteInput).toBeVisible();
    await noteInput.fill(
      locale === 'is'
        ? 'Skráður opnunartími stemmir ekki við það sem starfsfólk sagði.'
        : 'The posted opening hours do not match what staff told me.'
    );
    await noteInput.blur();
    await expect(noteRating.getByText(copy[locale].ratingSaved)).toBeVisible();
    await capture(page, evidence, `rating-note-inline-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, evidence, `rating-note-inline-${locale}-mobile.png`);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/${locale}/moderation/dog-friendliness/${notePlaceId}`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: copy[locale].dogFriendlinessReview })
    ).toBeVisible();
    await expect(page.locator('.note-text')).toBeVisible();
    await capture(page, evidence, `rating-note-moderation-${locale}-desktop.png`);

    await disableLocalPrivateRatingNotePolicy();
    retireLocalPrivateRatingNoteFixture();

    // Place media: the shared fixture Places must start media-free so the empty-state
    // and gallery captures are deterministic even if an earlier failed pass left rows behind.
    const { candidate: candidatePlaceId, published: publishedPlaceId } =
      evaluationFixtureIds.places;
    clearLocalPlaceMedia(candidatePlaceId);
    clearLocalPlaceMedia(publishedPlaceId);

    await page.goto(`/${locale}/moderation/places/${evaluationFixtureIds.places.candidate}`);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: copy[locale].checklist })).toBeVisible();
    await normalizeCandidateReviewForVisualEvidence(page);
    await capture(page, evidence, `publication-checklist-${locale}-desktop.png`, {
      prepare: () => normalizeCandidateReviewForVisualEvidence(page)
    });

    // Place media: empty, evidence-registered, pending-photo, and approved-photo states
    // on the Media section, plus the public Photos gallery. The candidate fixture Place's Media
    // section starts empty at this point in the flow.
    await openModerationReviewSection(page, '#candidate-media');
    await capture(page, evidence, `media-section-empty-${locale}-desktop.png`, {
      prepare: () => normalizeCandidateReviewForVisualEvidence(page)
    });

    const evidenceColumn = page.locator('[data-media-column="evidence"]');
    await evidenceColumn
      .getByLabel(copy[locale].mediaFileLabel)
      .setInputFiles(fixturePngFile('visual-evidence.png', 60, 40));
    await evidenceColumn
      .getByLabel(copy[locale].mediaSourceUrlLabel)
      .fill('https://example.invalid/visual/screenshot');
    await evidenceColumn.getByLabel(copy[locale].mediaCapturedAtLabel).fill('2026-07-12T09:00');
    await normalizeNativeInputForVisualEvidence(page, copy[locale].mediaCapturedAtLabel);
    await evidenceColumn.getByRole('button', { name: copy[locale].uploadEvidenceAction }).click();
    await expect(page.getByText(copy[locale].mediaUploaded)).toBeVisible();
    await normalizeCandidateReviewForVisualEvidence(page);
    await capture(page, evidence, `media-section-evidence-${locale}-desktop.png`, {
      prepare: () => normalizeCandidateReviewForVisualEvidence(page)
    });

    const photoColumn = page.locator('[data-media-column="photo"]');
    await photoColumn
      .getByLabel(copy[locale].mediaFileLabel)
      .setInputFiles(fixturePngFile('visual-photo.png', 200, 150, { r: 70, g: 130, b: 180 }));
    await photoColumn
      .getByLabel(copy[locale].peopleReviewLabel)
      .selectOption('no_prominent_people');
    await photoColumn.getByText(copy[locale].optionalPhotoDetails, { exact: true }).click();
    await photoColumn.getByLabel(copy[locale].photographerLabel).fill('Visual Photographer');
    await photoColumn.getByLabel(copy[locale].licenseDateLabel).fill('2026-07-01');
    await normalizeNativeInputForVisualEvidence(page, copy[locale].licenseDateLabel);
    await photoColumn
      .getByLabel(copy[locale].licenseReferenceLabel)
      .fill('Owner-supplied, visual fixture');
    await photoColumn
      .getByLabel(copy[locale].rightsEvidenceLabel)
      .fill('Owner permission fixture recorded for visual evaluation');
    await photoColumn
      .getByLabel(copy[locale].attributionTextLabel)
      .fill('Photo by Visual Photographer, used with permission');
    await photoColumn.getByLabel(copy[locale].altTextIsLabel).fill('Hundur, sjónræn prófun');
    await photoColumn.getByLabel(copy[locale].altTextEnLabel).fill('A dog, visual test fixture');
    await normalizeCandidateReviewForVisualEvidence(page);
    await capture(page, evidence, `media-section-pending-photo-${locale}-desktop.png`, {
      prepare: () => normalizeCandidateReviewForVisualEvidence(page)
    });

    await photoColumn.getByRole('button', { name: copy[locale].uploadAndPublishAction }).click();
    await expect(page.getByText(copy[locale].photoApproved)).toBeVisible();
    await normalizeCandidateReviewForVisualEvidence(page);
    await capture(page, evidence, `media-section-approved-photo-${locale}-desktop.png`, {
      prepare: () => normalizeCandidateReviewForVisualEvidence(page)
    });

    clearLocalPlaceMedia(candidatePlaceId);

    // The public Photos gallery, captured on the shared published fixture Place after this
    // locale's earlier selected-place captures - clearing the media at the end keeps the next
    // locale's earlier captures of the same Place unaffected.
    await page.goto(`/${locale}/moderation/places/${publishedPlaceId}`);
    await waitForHydration(page);
    await openModerationReviewSection(page, '#candidate-media');
    const publishedPhotoColumn = page.locator('[data-media-column="photo"]');
    await publishedPhotoColumn
      .getByLabel(copy[locale].mediaFileLabel)
      .setInputFiles(
        fixturePngFile('visual-gallery-photo.png', 200, 150, { r: 200, g: 150, b: 70 })
      );
    await publishedPhotoColumn
      .getByLabel(copy[locale].peopleReviewLabel)
      .selectOption('no_prominent_people');
    await publishedPhotoColumn
      .getByText(copy[locale].optionalPhotoDetails, { exact: true })
      .click();
    await publishedPhotoColumn
      .getByLabel(copy[locale].photographerLabel)
      .fill('Gallery Photographer');
    await publishedPhotoColumn.getByLabel(copy[locale].licenseDateLabel).fill('2026-07-01');
    await normalizeNativeInputForVisualEvidence(page, copy[locale].licenseDateLabel);
    await publishedPhotoColumn
      .getByLabel(copy[locale].licenseReferenceLabel)
      .fill('Owner-supplied, gallery fixture');
    await publishedPhotoColumn
      .getByLabel(copy[locale].rightsEvidenceLabel)
      .fill('Owner permission fixture recorded for visual gallery evaluation');
    await publishedPhotoColumn
      .getByLabel(copy[locale].attributionTextLabel)
      .fill('Photo by Gallery Photographer, used with permission');
    await publishedPhotoColumn.getByLabel(copy[locale].altTextIsLabel).fill('Hundur í myndasafni');
    await publishedPhotoColumn
      .getByLabel(copy[locale].altTextEnLabel)
      .fill('A dog in the gallery fixture');
    await publishedPhotoColumn
      .getByRole('button', { name: copy[locale].uploadAndPublishAction })
      .click();
    await expect(page.getByText(copy[locale].photoApproved)).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${locale}?place=${publishedPlaceId}&view=map`);
    await expect(page.locator('.map-surface[data-paint-ready]')).toHaveAttribute(
      'data-paint-ready',
      'true'
    );
    const galleryCard = page.getByRole('complementary', { name: copy[locale].selectedPlace });
    // The gallery localizes alt text: the Icelandic page renders the Icelandic description.
    await expect(
      galleryCard.getByAltText(
        locale === 'is' ? 'Hundur í myndasafni' : 'A dog in the gallery fixture'
      )
    ).toBeVisible();
    // The gallery sits below the card body's internal scroll fold; a capture named after the
    // gallery must actually show it, so scroll it into view inside the card first.
    await galleryCard.locator('[data-photos-section]').scrollIntoViewIfNeeded();
    await capture(page, evidence, `place-photos-gallery-${locale}-desktop.png`);

    clearLocalPlaceMedia(publishedPlaceId);
  });
}
