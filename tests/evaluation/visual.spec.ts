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
  configureLocalPlaceFlagAbusePolicy,
  configureLocalPrivateRatingNotePolicy,
  disableLocalAchievementPolicy,
  disableLocalPrivateRatingNotePolicy,
  expireLocalMagicLink,
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
  retireLocalMemberAchievements,
  retireLocalPlaceFlagFixtures,
  retireLocalPrivateRatingNoteFixture,
  waitForLocalMagicLink
} from '../e2e/support/local-supabase';
import { waitForHydration } from '../e2e/support/hydration';
import { fixturePngFile } from '../e2e/support/fixture-image';

type Locale = 'is' | 'en';

const emptyCandidateCursor = `${Date.UTC(2100, 0, 1).toString(36)}~ffffffff-ffff-4fff-8fff-ffffffffffff`;

const copy = {
  is: {
    directory: 'Hundavænt',
    list: 'Listi',
    map: 'Kort',
    mapFailure: 'Kortið er ekki tiltækt í augnablikinu',
    moderatorEmail: 'Netfang',
    sendLink: 'Senda innskráningartengil',
    linkSent: 'Tengillinn hefur verið sendur.',
    moderationHub: 'Umsjón',
    candidateQueue: 'Tillögur að stöðum',
    moderationWorkspace: 'Umsjónarborð',
    moderationQueues: 'Umsjónarraðir',
    selectedModerationQueue: 'Valin umsjónarröð',
    selectedModerationItem: 'Valið umsjónaratriði',
    suggestionsQueue: 'Tillögur',
    candidatePlacesQueue: 'Tillögur að stöðum',
    emptyQueue: 'Röð lokið',
    decisionControls: 'Ákvörðunarstýringar',
    needsInformation: 'Vantar upplýsingar',
    memberReasonIs: 'Skýring til meðlims á íslensku',
    memberReasonEn: 'Skýring til meðlims á ensku',
    saveOutcome: 'Vista niðurstöðu',
    outcomeConflict: 'Annar stjórnandi hefur þegar lokað þessari tillögu.',
    invalidSuggestion: 'Athugaðu merktu svörin og reyndu aftur.',
    resolutionSaved: 'Niðurstaðan hefur verið vistuð.',
    visualSuggestion: 'Sjónræn tillaga',
    nextVisualSuggestion: 'Næsta sjónræna tillaga',
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
    ratingForm: 'Meta hundvænleika',
    saveRating: 'Vista mat',
    dogFriendlinessReview: 'Hundvænleikamöt',
    historyTitle: 'Heimsóknir',
    noteHeading: 'Einkaskýring við lágt mat',
    noteInaccurate: 'Hugsanlega rangar upplýsingar um aðgang',
    noteText: 'Skýring þín (einkamál)',
    reportPrompt: 'Viltu senda formlega ábendingu?',
    mediaTitle: 'Myndefni',
    mediaFileLabel: 'Mynd (PNG, JPEG eða WebP, að hámarki 15 MB)',
    mediaSourceUrlLabel: 'Vefslóð heimildar',
    mediaCapturedAtLabel: 'Tökutími',
    uploadEvidenceAction: 'Hlaða upp sönnunargagni',
    uploadPhotoAction: 'Hlaða upp ljósmynd',
    mediaUploaded: 'Myndefni hlaðið upp.',
    photographerLabel: 'Ljósmyndari eða sá sem hlóð upp',
    licenseDateLabel: 'Dagsetning myndatöku eða heimildar',
    licenseReferenceLabel: 'Leyfi eða heimild til birtingar',
    rightsBasisLabel: 'Grundvöllur afnotaréttar',
    rightsEvidenceLabel: 'Tilvísun í sönnun fyrir afnotarétti',
    attributionTextLabel: 'Sýnileg höfundartilkynning',
    peopleReviewLabel: 'Fólk sem sést á myndinni',
    altTextIsLabel: 'Myndlýsing (íslenska)',
    altTextEnLabel: 'Myndlýsing (enska)',
    approveAction: 'Samþykkja',
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
    moderationHub: 'Moderation',
    candidateQueue: 'Candidate Places',
    moderationWorkspace: 'Moderation board',
    moderationQueues: 'Moderation queues',
    selectedModerationQueue: 'Selected moderation queue',
    selectedModerationItem: 'Selected moderation item',
    suggestionsQueue: 'Suggestions',
    candidatePlacesQueue: 'Candidate places',
    emptyQueue: 'Queue complete',
    decisionControls: 'Decision controls',
    needsInformation: 'Needs information',
    memberReasonIs: 'Member explanation in Icelandic',
    memberReasonEn: 'Member explanation in English',
    saveOutcome: 'Save outcome',
    outcomeConflict: 'This Suggestion outcome was already finalized by another Moderator.',
    invalidSuggestion: 'Check the highlighted answers and try again.',
    resolutionSaved: 'The outcome has been saved.',
    visualSuggestion: 'Visual Suggestion',
    nextVisualSuggestion: 'Next Visual Suggestion',
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
    ratingForm: 'Rate Dog-Friendliness',
    saveRating: 'Save Rating',
    dogFriendlinessReview: 'Dog-Friendliness Ratings',
    historyTitle: 'Visits',
    noteHeading: 'Private context for a low Rating',
    noteInaccurate: 'Possibly inaccurate access information',
    noteText: 'Your private explanation',
    reportPrompt: 'Send a formal Report?',
    mediaTitle: 'Media',
    mediaFileLabel: 'Image (PNG, JPEG, or WebP, 15 MB maximum)',
    mediaSourceUrlLabel: 'Source URL',
    mediaCapturedAtLabel: 'Capture time',
    uploadEvidenceAction: 'Upload Evidence',
    uploadPhotoAction: 'Upload Photo',
    mediaUploaded: 'Media uploaded.',
    photographerLabel: 'Photographer or uploader',
    licenseDateLabel: 'Capture or source date',
    licenseReferenceLabel: 'License or permission reference',
    rightsBasisLabel: 'Rights basis',
    rightsEvidenceLabel: 'Rights evidence reference',
    attributionTextLabel: 'Public attribution text',
    peopleReviewLabel: 'People shown in the photo',
    altTextIsLabel: 'Image description (Icelandic)',
    altTextEnLabel: 'Image description (English)',
    approveAction: 'Approve',
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
  options?: { maxDiffPixelRatio?: number; prepare?: () => Promise<void> }
): Promise<void> {
  await waitForHydration(page);
  await waitForMapOverlayToSettle(page);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth, `${name} must not overflow horizontally`).toBeLessThanOrEqual(
    viewportWidth
  );
  await page.locator('img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
  });
  await page.locator('.maplibregl-canvas').evaluateAll((canvases) => {
    for (const canvas of canvases) canvas.style.opacity = '0';
  });
  await options?.prepare?.();
  evidence.require('screenshot');
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: options?.maxDiffPixelRatio ?? 0.005,
    scale: 'css'
  });
  evidence.recordScreenshot(name, `tests/evaluation/screenshots/${name}`);
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

async function normalizeFreshnessForVisualEvidence(page: Page, label: string): Promise<void> {
  await page.evaluate(() => {
    if (document.querySelector('style[data-stable-freshness]')) return;

    // The server-derived one-year default changes daily and Svelte can restore it during the
    // consecutive screenshots Playwright uses for stability. Keep the real form value intact,
    // but cover it with a persistent visual-only value that survives client invalidations.
    const style = document.createElement('style');
    style.dataset.stableFreshness = 'true';
    style.textContent = `
      label:has(> input[name='freshnessUntil']) > input[name='freshnessUntil'] {
        grid-column: 1;
        grid-row: 2;
        visibility: hidden !important;
      }
      label:has(> input[name='freshnessUntil'])::after {
        align-self: center;
        background: white;
        border: 2px solid #193b45;
        border-radius: 0.65rem;
        box-sizing: border-box;
        content: '2099-01-01';
        display: grid;
        grid-column: 1;
        grid-row: 2;
        min-height: 3rem;
        padding: 0.55rem 0.7rem;
        pointer-events: none;
      }
    `;
    document.head.append(style);
  });
  await expect
    .poll(() =>
      page
        .getByLabel(label)
        .evaluate((element) =>
          element.parentElement
            ? getComputedStyle(element.parentElement, '::after').content
            : 'missing'
        )
    )
    .toContain('2099-01-01');
}

async function normalizeCandidateReviewForVisualEvidence(
  page: Page,
  freshnessLabel: string
): Promise<void> {
  await normalizeFreshnessForVisualEvidence(page, freshnessLabel);
  // Chromium renders native date controls using the host OS locale, which differs between local
  // development and GitHub's Linux runners. Preserve the values while removing only that native,
  // machine-dependent presentation from visual evidence.
  await normalizeNativeInputsForVisualEvidence(page);
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
  await page.getByLabel(copy[locale].moderatorEmail).fill(evaluationModerator.email);
  const invalidation = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      responseUrl.pathname === `/${locale}/moderation/sign-in/__data.json` &&
      responseUrl.searchParams.has('x-sveltekit-invalidated') &&
      response.ok()
    );
  });
  await page.getByRole('button', { name: copy[locale].sendLink }).click();
  await expect(page.getByText(copy[locale].linkSent)).toBeVisible();
  await invalidation;
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(`/${locale}/moderation/places/new`);
}

async function fillSuggestionResolution(
  page: Page,
  locale: Locale,
  outcome: 'needs_information' | 'rejected' = 'needs_information'
): Promise<void> {
  await waitForHydration(page);
  const localized = copy[locale];
  const decision = page.locator('#suggestion-decision');
  await decision.getByLabel(locale === 'is' ? 'Niðurstaða' : 'Outcome').selectOption(outcome);
  await decision
    .getByLabel(localized.memberReasonIs)
    .fill('Vinsamlegast staðfestu að heimildin sé enn í gildi.');
  await decision
    .getByLabel(localized.memberReasonEn)
    .fill('Please confirm that the source is still current.');
}

async function captureModerationWorkspaceStates(
  context: BrowserContext,
  evidence: EvaluationEvidenceRecorder,
  locale: Locale
): Promise<void> {
  const workspaceSuggestionId = await provisionLocalSuggestionFixture(evaluationModerator.email);
  const moderationPage = await context.newPage();
  await moderationPage.setViewportSize({ width: 1280, height: 900 });
  await moderationPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${workspaceSuggestionId}&filter=actionable`
  );
  await expect(
    moderationPage.getByRole('heading', {
      name: copy[locale].moderationWorkspace,
      level: 1
    })
  ).toBeVisible();
  await expect(
    moderationPage.getByRole('navigation', { name: copy[locale].moderationQueues })
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
  await capture(moderationPage, evidence, `moderation-workspace-${locale}-desktop.png`);

  await moderationPage.setViewportSize({ width: 390, height: 844 });
  await capture(moderationPage, evidence, `moderation-workspace-${locale}-mobile.png`);

  await moderationPage.setViewportSize({ width: 1280, height: 900 });
  await moderationPage
    .locator('.item-top strong')
    .first()
    .evaluate((element) => {
      element.textContent =
        'A deliberately long moderation item title that must wrap without obscuring its status';
    });
  await moderationPage
    .locator('.summary')
    .first()
    .evaluate((element) => {
      element.textContent =
        'A long operator, category, and address summary verifies that queue content wraps cleanly instead of widening the page or hiding the decision workspace.';
    });
  await moderationPage.locator('.review-head h2').evaluate((element) => {
    element.textContent =
      'A very long selected Suggestion title that remains readable in the compact review pane';
  });
  await capture(
    moderationPage,
    evidence,
    `moderation-workspace-long-content-${locale}-desktop.png`
  );

  await moderationPage.setViewportSize({ width: 640, height: 450 });
  await moderationPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${workspaceSuggestionId}&filter=actionable`
  );
  await capture(moderationPage, evidence, `moderation-workspace-${locale}-zoom-200-percent.png`);

  await moderationPage.setViewportSize({ width: 1280, height: 900 });
  await moderationPage
    .getByRole('link', { name: new RegExp(copy[locale].nextVisualSuggestion) })
    .click();
  await expect(moderationPage).toHaveURL(
    (url) => url.searchParams.get('item')?.endsWith('0094') ?? false
  );
  await expect(
    moderationPage.getByRole('region', { name: copy[locale].selectedModerationItem })
  ).toContainText(copy[locale].nextVisualSuggestion);
  await capture(moderationPage, evidence, `moderation-workspace-selection-${locale}-desktop.png`);

  await moderationPage
    .getByRole('link', { name: new RegExp(copy[locale].candidatePlacesQueue) })
    .click();
  await expect(moderationPage).toHaveURL(
    (url) => url.searchParams.get('queue') === 'candidate-places'
  );
  await expect(moderationPage.getByRole('heading', { name: copy[locale].checklist })).toBeVisible();
  await capture(moderationPage, evidence, `moderation-workspace-candidate-${locale}-desktop.png`);

  await moderationPage.goto(
    `/${locale}/moderation?queue=candidate-places&filter=actionable&cursor=${emptyCandidateCursor}`
  );
  await expect(
    moderationPage.getByRole('heading', { name: copy[locale].emptyQueue })
  ).toBeVisible();
  await capture(moderationPage, evidence, `moderation-workspace-empty-${locale}-desktop.png`);

  await moderationPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${workspaceSuggestionId}&filter=actionable`
  );
  await fillSuggestionResolution(moderationPage, locale);
  await moderationPage
    .locator('#suggestion-decision input[name="suggestionId"]')
    .evaluate((input) => {
      if (input instanceof HTMLInputElement) input.value = 'not-a-suggestion-id';
    });
  await moderationPage.getByRole('button', { name: copy[locale].saveOutcome }).click();
  await expect(
    moderationPage.getByRole('alert').filter({ hasText: copy[locale].invalidSuggestion })
  ).toBeVisible();
  await capture(moderationPage, evidence, `moderation-workspace-error-${locale}-desktop.png`);

  await provisionLocalSuggestionFixture(evaluationModerator.email);
  await moderationPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${workspaceSuggestionId}&filter=actionable`
  );
  const winningPage = await context.newPage();
  await winningPage.setViewportSize({ width: 1280, height: 900 });
  await winningPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${workspaceSuggestionId}&filter=actionable`
  );
  await fillSuggestionResolution(moderationPage, locale, 'rejected');
  await fillSuggestionResolution(winningPage, locale, 'rejected');
  await winningPage.getByRole('button', { name: copy[locale].saveOutcome }).click();
  await expect(winningPage.locator('.live-status')).toContainText(copy[locale].resolutionSaved);
  await moderationPage.getByRole('button', { name: copy[locale].saveOutcome }).click();
  await expect(
    moderationPage.getByRole('alert').filter({ hasText: copy[locale].outcomeConflict })
  ).toBeVisible();
  await expect(
    moderationPage.locator('#suggestion-decision').getByLabel(copy[locale].memberReasonEn)
  ).toHaveValue('Please confirm that the source is still current.');
  await capture(moderationPage, evidence, `moderation-workspace-conflict-${locale}-desktop.png`);
  await winningPage.close();

  await provisionLocalSuggestionFixture(evaluationModerator.email);
  await moderationPage.goto(
    `/${locale}/moderation?queue=suggestions&item=${workspaceSuggestionId}&filter=actionable`
  );
  await fillSuggestionResolution(moderationPage, locale);
  await moderationPage.getByRole('button', { name: copy[locale].saveOutcome }).click();
  await expect(moderationPage.locator('.live-status')).toContainText(copy[locale].resolutionSaved);
  await expect(
    moderationPage.getByRole('region', { name: copy[locale].selectedModerationItem })
  ).toContainText(copy[locale].nextVisualSuggestion);
  await capture(moderationPage, evidence, `moderation-workspace-success-${locale}-desktop.png`);
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

  test(`captures the ${locale} product states at named viewports`, async ({ page, evidence }) => {
    await provisionLocalModerator(evaluationModerator.email);
    await provisionLocalModerator(evaluationPublisher.email);
    // Defensive: an aborted earlier attempt (for example a missing new screenshot baseline) can
    // exit this test before its own end-of-pass retirements run, leaving the private-rating-note fixture Place
    // published and leaking an extra marker into the directory captures below.
    retireLocalPrivateRatingNoteFixture();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${locale}?view=map`);
    await expect(page.getByRole('heading', { name: copy[locale].directory })).toBeVisible();
    await expect(page.getByRole('button', { name: copy[locale].place, exact: true })).toBeVisible();
    await capture(page, evidence, `directory-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}?view=map`);
    await expect(page.getByRole('heading', { name: copy[locale].map })).toBeVisible();
    await expect(page.getByRole('button', { name: copy[locale].place, exact: true })).toBeVisible();
    await capture(page, evidence, `directory-${locale}-mobile.png`);

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
    await accessCard.locator('summary').click();
    await expect(
      accessCard.getByRole('heading', { name: locale === 'is' ? 'Aðgangur hunda' : 'Dog access' })
    ).toBeVisible();
    await capture(page, evidence, `access-details-${locale}-desktop.png`);

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
    await capture(page, evidence, `not-found-${locale}-desktop.png`);

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
    await page.goto(`/${locale}/saved`);
    await expect(
      page.getByRole('heading', { name: locale === 'is' ? 'Vistaðir staðir' : 'Saved places' })
    ).toBeVisible();
    await capture(page, evidence, `saved-places-${locale}-desktop.png`);

    // The personal-history route (personal-history): the same Place is also checked in, so its four views
    // show a mixed Favourite-and-visited state rather than an empty one.
    const checkInMutation = await page.evaluate(async (placeId) => {
      const response = await fetch(`/api/check-ins/${placeId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proximityDecision: 'unknown' })
      });
      return { ok: response.ok, status: response.status };
    }, evaluationFixtureIds.places.published);
    expect(checkInMutation).toMatchObject({ ok: true, status: 200 });

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
    // The personal map's single-Place camera sits at a tighter zoom (14, vs. the multi-Place
    // directory map's 11), which makes the marker's exact sub-pixel anti-aliasing more sensitive
    // to per-run MapLibre projection jitter than the rest of this suite's map screenshots; a
    // slightly relaxed tolerance absorbs that without weakening every other capture's precision.
    await capture(page, evidence, `history-map-${locale}-desktop.png`, { maxDiffPixelRatio: 0.02 });

    clearLocalCheckIns(evaluationFixtureIds.places.published);

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

    // The personal-history captures navigated away from /saved; return to it before the existing
    // removal step below, which depends on being on that page.
    await page.goto(`/${locale}/saved`);
    await expect(
      page.getByRole('heading', { name: locale === 'is' ? 'Vistaðir staðir' : 'Saved places' })
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
            ? 'Fjarlægja Birtur staður úr vistuðum stöðum'
            : 'Remove Published Place from saved places'
      })
      .click();
    const completedRemoval = await removalResponse;
    expect(completedRemoval.ok()).toBe(true);
    expect(await completedRemoval.finished()).toBeNull();
    await expect(
      page.getByRole('heading', {
        name: locale === 'is' ? 'Engir vistaðir staðir enn' : 'No saved places yet'
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
    await expect(page.getByText(locale === 'is' ? 'Öryggismál' : 'Safety Concern')).toBeVisible();
    await capture(page, evidence, `corrections-and-reports-review-${locale}-desktop.png`);

    // The three fixture Places are published so they can be targeted by a Correction/Report;
    // retiring them now keeps them out of the public "directory" map/list capture the other
    // locale's pass of this same test still has to take later in this shared local session.
    retireLocalPlaceFlagFixtures();

    // provision_moderator also creates a private.member_accounts row for the already-signed-in
    // Moderator session, so the Rating form can be captured without a separate Member sign-in.
    provisionLocalDogFriendlinessFixture();
    const { placeId: dogFriendlinessPlaceId } = localDogFriendlinessFixture;
    await page.goto(`/${locale}/places/${dogFriendlinessPlaceId}/rate`);
    await expect(page.getByRole('heading', { name: copy[locale].ratingForm })).toBeVisible();
    await capture(page, evidence, `rating-form-${locale}-desktop.png`);

    const welcomeLabel = locale === 'is' ? 'Móttökur' : 'Welcome';
    const comfortLabel = locale === 'is' ? 'Þægindi' : 'Comfort';
    const thoughtfulnessLabel = locale === 'is' ? 'Tillitssemi' : 'Thoughtfulness';
    await page.getByLabel(welcomeLabel).selectOption('4');
    await page.getByLabel(comfortLabel).selectOption('5');
    await page.getByLabel(thoughtfulnessLabel).selectOption('3');
    await page.getByRole('button', { name: copy[locale].saveRating }).click();
    await expect(page).toHaveURL(`/${locale}?place=${dogFriendlinessPlaceId}`);

    await page.goto(`/${locale}/moderation/dog-friendliness/${dogFriendlinessPlaceId}`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: copy[locale].dogFriendlinessReview })
    ).toBeVisible();
    await capture(page, evidence, `dog-friendliness-review-${locale}-desktop.png`);

    // The fixture Place is published so it can be discovered and rated; retiring it now keeps
    // it out of the public "directory" map/list capture the other locale's pass still has to
    // take later in this shared local session.
    retireLocalDogFriendlinessFixture();

    // private-rating-note Private Rating Note: a fresh, dedicated fixture per locale pass (provisioning also
    // clears any Ratings/linked Reports the other locale's pass left on it) plus the fail-closed
    // policy explicitly enabled through the service-role RPC.
    provisionLocalPrivateRatingNoteFixture();
    await configureLocalPrivateRatingNotePolicy();
    const { placeId: notePlaceId } = localPrivateRatingNoteFixture;
    await page.goto(`/${locale}/places/${notePlaceId}/rate`);
    await expect(page.getByRole('heading', { name: copy[locale].ratingForm })).toBeVisible();
    const noteWelcomeLabel = locale === 'is' ? 'Móttökur' : 'Welcome';
    await page.getByLabel(noteWelcomeLabel).selectOption('1');
    await expect(page.getByText(copy[locale].noteHeading)).toBeVisible();
    await page.getByLabel(copy[locale].noteInaccurate).check();
    await page
      .getByLabel(copy[locale].noteText)
      .fill(
        locale === 'is'
          ? 'Skráður opnunartími stemmir ekki við það sem starfsfólk sagði.'
          : 'The posted opening hours do not match what staff told me.'
      );
    await capture(page, evidence, `rating-note-fieldset-${locale}-desktop.png`);

    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, evidence, `rating-note-fieldset-${locale}-mobile.png`);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.getByRole('button', { name: copy[locale].saveRating }).click();
    await expect(page.getByText(copy[locale].reportPrompt)).toBeVisible();
    await capture(page, evidence, `rating-note-report-prompt-${locale}-desktop.png`);

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
    await normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness);
    await capture(page, evidence, `publication-checklist-${locale}-desktop.png`, {
      maxDiffPixelRatio: 0,
      prepare: () => normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness)
    });

    // Place media: empty, evidence-registered, pending-photo, and approved-photo states
    // on the Media section, plus the public Photos gallery. The candidate fixture Place's Media
    // section starts empty at this point in the flow.
    await expect(page.getByRole('heading', { name: copy[locale].mediaTitle })).toBeVisible();
    await capture(page, evidence, `media-section-empty-${locale}-desktop.png`, {
      maxDiffPixelRatio: 0,
      prepare: () => normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness)
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
    await normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness);
    await capture(page, evidence, `media-section-evidence-${locale}-desktop.png`, {
      maxDiffPixelRatio: 0,
      prepare: () => normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness)
    });

    const photoColumn = page.locator('[data-media-column="photo"]');
    await photoColumn
      .getByLabel(copy[locale].mediaFileLabel)
      .setInputFiles(fixturePngFile('visual-photo.png', 200, 150, { r: 70, g: 130, b: 180 }));
    await photoColumn.getByRole('button', { name: copy[locale].uploadPhotoAction }).click();
    await expect(page.getByText(copy[locale].mediaUploaded)).toBeVisible();
    const candidatePhotoItem = photoColumn.locator('li[data-media-item]').first();
    await expect(candidatePhotoItem).toBeVisible();
    await normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness);
    await capture(page, evidence, `media-section-pending-photo-${locale}-desktop.png`, {
      maxDiffPixelRatio: 0,
      prepare: () => normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness)
    });

    await candidatePhotoItem.getByLabel(copy[locale].photographerLabel).fill('Visual Photographer');
    await candidatePhotoItem.getByLabel(copy[locale].licenseDateLabel).fill('2026-07-01');
    await normalizeNativeInputForVisualEvidence(page, copy[locale].licenseDateLabel);
    await candidatePhotoItem
      .getByLabel(copy[locale].licenseReferenceLabel)
      .fill('Owner-supplied, visual fixture');
    await candidatePhotoItem
      .getByLabel(copy[locale].rightsBasisLabel)
      .selectOption('explicit_permission');
    await candidatePhotoItem
      .getByLabel(copy[locale].rightsEvidenceLabel)
      .fill('Owner permission fixture recorded for visual evaluation');
    await candidatePhotoItem
      .getByLabel(copy[locale].attributionTextLabel)
      .fill('Photo by Visual Photographer, used with permission');
    await candidatePhotoItem
      .getByLabel(copy[locale].peopleReviewLabel)
      .selectOption('no_prominent_people');
    await candidatePhotoItem.getByLabel(copy[locale].altTextIsLabel).fill('Hundur, sjónræn prófun');
    await candidatePhotoItem
      .getByLabel(copy[locale].altTextEnLabel)
      .fill('A dog, visual test fixture');
    await candidatePhotoItem.getByRole('button', { name: copy[locale].approveAction }).click();
    await expect(page.getByText(copy[locale].photoApproved)).toBeVisible();
    await normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness);
    await capture(page, evidence, `media-section-approved-photo-${locale}-desktop.png`, {
      maxDiffPixelRatio: 0,
      prepare: () => normalizeCandidateReviewForVisualEvidence(page, copy[locale].freshness)
    });

    clearLocalPlaceMedia(candidatePlaceId);

    // The public Photos gallery, captured on the shared published fixture Place after this
    // locale's earlier selected-place captures - clearing the media at the end keeps the next
    // locale's earlier captures of the same Place unaffected.
    await page.goto(`/${locale}/moderation/places/${publishedPlaceId}`);
    await waitForHydration(page);
    const publishedPhotoColumn = page.locator('[data-media-column="photo"]');
    await publishedPhotoColumn
      .getByLabel(copy[locale].mediaFileLabel)
      .setInputFiles(
        fixturePngFile('visual-gallery-photo.png', 200, 150, { r: 200, g: 150, b: 70 })
      );
    await publishedPhotoColumn
      .getByRole('button', { name: copy[locale].uploadPhotoAction })
      .click();
    await expect(page.getByText(copy[locale].mediaUploaded)).toBeVisible();
    const publishedPhotoItem = publishedPhotoColumn.locator('li[data-media-item]').first();
    await publishedPhotoItem
      .getByLabel(copy[locale].photographerLabel)
      .fill('Gallery Photographer');
    await publishedPhotoItem.getByLabel(copy[locale].licenseDateLabel).fill('2026-07-01');
    await normalizeNativeInputForVisualEvidence(page, copy[locale].licenseDateLabel);
    await publishedPhotoItem
      .getByLabel(copy[locale].licenseReferenceLabel)
      .fill('Owner-supplied, gallery fixture');
    await publishedPhotoItem
      .getByLabel(copy[locale].rightsBasisLabel)
      .selectOption('explicit_permission');
    await publishedPhotoItem
      .getByLabel(copy[locale].rightsEvidenceLabel)
      .fill('Owner permission fixture recorded for visual gallery evaluation');
    await publishedPhotoItem
      .getByLabel(copy[locale].attributionTextLabel)
      .fill('Photo by Gallery Photographer, used with permission');
    await publishedPhotoItem
      .getByLabel(copy[locale].peopleReviewLabel)
      .selectOption('no_prominent_people');
    await publishedPhotoItem.getByLabel(copy[locale].altTextIsLabel).fill('Hundur í myndasafni');
    await publishedPhotoItem
      .getByLabel(copy[locale].altTextEnLabel)
      .fill('A dog in the gallery fixture');
    await publishedPhotoItem.getByRole('button', { name: copy[locale].approveAction }).click();
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
