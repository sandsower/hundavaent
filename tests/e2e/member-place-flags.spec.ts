import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

import type { Database } from '$server/db/generated.types';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  configureLocalPlaceFlagAbusePolicy,
  getLocalSupabaseStatus,
  localPlaceFlagFixtures,
  provisionLocalModerator,
  provisionLocalPlaceFlagFixtures,
  retireLocalPlaceFlagFixtures,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalPlaceFlagAbusePolicy();
  provisionLocalPlaceFlagFixtures();
  // The shared Moderator email is reused by other e2e/a11y/visual specs; starting from an empty
  // mailbox keeps waitForLocalMagicLink from ever matching a stale sign-in link left over from an
  // earlier run.
  await clearLocalEvaluationMailbox();
});

test.afterAll(() => {
  // The three fixture Places are published (see local-supabase.ts), so they stay visible in
  // public discovery for the rest of the local database session -- including every e2e spec that
  // runs after this file, and a11y/visual runs against the same persistent local Supabase
  // instance. Retiring them here is the same discipline tests/evaluation/visual.spec.ts already
  // follows around its own use of the identical fixture.
  retireLocalPlaceFlagFixtures();
});

test('private Corrections and Reports reach applied, confirmed-useful, and rejected outcomes without public leakage', async ({
  browser,
  page
}) => {
  const { correctable } = localPlaceFlagFixtures;
  const memberEmail = `place-flag-member-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const phoneFlagId = await submitCorrection(
    page,
    correctable.placeId,
    'phone',
    '+354 555 0199',
    true
  );
  const reportFlagId = await submitAccessConditionReport(
    page,
    correctable.placeId,
    correctable.accessConditionId,
    {
      reason: 'unsafe',
      safetyConcern: true
    }
  );
  const websiteFlagId = await submitCorrection(
    page,
    correctable.placeId,
    'website_url',
    'https://example.invalid/new-site'
  );

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);

  await resolveLatestFlag(moderatorPage, phoneFlagId, 'applied', {
    fieldValueText: '+354 555 0199'
  });
  await resolveLatestFlag(moderatorPage, reportFlagId, 'confirmed_useful');
  await confirmUsefulContribution(moderatorPage, reportFlagId);
  await resolveLatestFlag(moderatorPage, websiteFlagId, 'rejected');
  await moderatorContext.close();

  await page.goto('/en/account/corrections-and-reports');
  await expect(page.getByText('Correction published').first()).toBeVisible();
  await expect(page.getByText('Confirmed as a useful Report').first()).toBeVisible();
  await expect(page.getByText('Rejected').first()).toBeVisible();
  await expect(page.getByText('Reviewed by a Moderator.').first()).toBeVisible();
  // The private Moderator notes recorded during resolution must never reach the Member view.
  const memberViewText = await page.textContent('body');
  expect(memberViewText).not.toContain('The venue confirmed this URL is unused.');
  expect(memberViewText).not.toContain('Escalated informally');

  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: profileRows, error: profileError } = await publicClient.rpc(
    'get_published_place_profile',
    { requested_place_id: correctable.placeId, requested_locale: 'en' }
  );
  expect(profileError).toBeNull();
  expect(profileRows?.[0]?.phone).toBe('+354 555 0199');
  expect(profileRows?.[0]?.website_url).toBe('https://example.invalid/flag-e2e-cafe');
});

test('a Moderator can open an Access Dispute or retire a Place directly from a Report resolution', async ({
  browser,
  page
}) => {
  const { disputable, retirable } = localPlaceFlagFixtures;
  const memberEmail = `place-flag-lifecycle-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const disputeFlagId = await submitAccessConditionReport(
    page,
    disputable.placeId,
    disputable.accessConditionId,
    {
      reason: 'misleading',
      safetyConcern: false
    },
    true
  );
  const inactivationFlagId = await submitAccessConditionReport(
    page,
    retirable.placeId,
    retirable.accessConditionId,
    {
      reason: 'closed',
      safetyConcern: false
    }
  );

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);

  await resolveLatestFlag(moderatorPage, disputeFlagId, 'dispute_opened');
  await resolveLatestFlag(moderatorPage, inactivationFlagId, 'place_inactivated');
  await moderatorContext.close();

  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: published } = await publicClient.rpc('list_published_places', {
    requested_locale: 'en'
  });
  expect(published?.some((place) => place.name === disputable.nameEn)).toBe(false);
  expect(published?.some((place) => place.name === retirable.nameEn)).toBe(false);

  const unavailableResponse = await page.goto(`/en/places/${retirable.placeId}`);
  expect(unavailableResponse?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText(retirable.nameEn)).toHaveCount(0);
  await expect(page.getByText(/inactive|review|verified|reconfirm|source/i)).toHaveCount(0);
});

test('a Member corrects the restraint rule inline on the place card and the Moderator receives a synthesized Member report', async ({
  browser,
  page
}) => {
  const { correctable } = localPlaceFlagFixtures;
  const memberEmail = `inline-correction-member-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  await page.goto(`/en?place=${correctable.placeId}`);
  await waitForHydration(page);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });
  await selectedPlace.getByRole('button', { name: 'Leash required' }).click();

  // The affordance targets access_condition_id, which only the loaded profile carries, so it
  // appears once the profile arrives rather than with the summary chips.
  const start = selectedPlace.getByRole('button', {
    name: `Not right? Correct the restraint rule for ${correctable.nameEn}`
  });
  await expect(start).toBeVisible();
  await start.click();

  const send = selectedPlace.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await selectedPlace.getByRole('radio', { name: 'Off-leash allowed' }).check();
  await expect(send).toBeEnabled();

  const submissionPromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' && response.url().includes('/corrections?lang=en')
    );
  });
  await send.click();
  const submission = await submissionPromise;
  const submissionBody = await submission.text();
  expect(submission.status(), submissionBody).toBe(200);
  const inlineFlagId = (JSON.parse(submissionBody) as { flagId: string }).flagId;
  expect(inlineFlagId).toBeTruthy();

  // The editor closes into the pending line straight away, without waiting for a read of the
  // server: the Condition now has something open, and a second edit raised beside it would build
  // from the stored Condition and propose reverting this one. The outcome is announced out of band.
  await expect(start).toHaveCount(0);
  await expect(selectedPlace.locator('[data-correction-pending]').first()).toBeVisible();
  await expect(selectedPlace.locator('[data-access-announcement]')).toHaveText(
    'Thank you. A Moderator will check this.'
  );

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(
    `/en/moderation?queue=corrections-and-reports&item=${inlineFlagId}&filter=actionable`
  );
  await waitForHydration(moderatorPage);

  // Truthfully labelled as a Member report the server wrote, with a factual explanation naming
  // the before value, the after value and the surface.
  const evidenceSection = moderatorPage.locator('#correction-evidence');
  await expect(evidenceSection).toContainText('Member report from the place page');
  await expandReviewSection(evidenceSection);
  const synthesizedLine =
    'Restraint condition changed from leash required to off-leash allowed, reported from the place card.';
  await expect(evidenceSection.getByText(synthesizedLine).first()).toBeVisible();

  // The proposed value carries the Place's own access facts through, changing only the restraint.
  const changeSection = moderatorPage.locator('#correction-change');
  await expandReviewSection(changeSection);
  await expect(changeSection).toContainText('Off-leash permitted');
  await moderatorContext.close();
});

test('a Member corrects the Place name in one language and a Moderator cannot apply it until the other is written', async ({
  browser,
  page
}) => {
  const { correctable } = localPlaceFlagFixtures;
  // Fixed, not stamped with the clock. The fixture translations are re-seeded on every run, so the
  // corrected name is the same every time and a second run against the same database sees the
  // original name again rather than the previous run's. A unique name would have hidden a fixture
  // that could not be re-provisioned.
  const correctedName = 'Flag E2E Cafe and Bakery';
  const memberEmail = `name-hatch-member-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  await page.goto(`/en?place=${correctable.placeId}`);
  await waitForHydration(page);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });

  // The name has no row on the card until a Member asks for one: readers see the practical details
  // exactly as they always have, and one quiet line at the foot of them.
  await selectedPlace.getByText('Place details').click();
  const revealLine = selectedPlace.getByRole('button', {
    name: `Spot something wrong? Correct the details for ${correctable.nameEn}`
  });
  await expect(revealLine).toBeVisible();
  await expect(
    selectedPlace.getByRole('button', {
      name: `Not right? Correct the name of ${correctable.nameEn}`
    })
  ).toHaveCount(0);
  await revealLine.click();

  await selectedPlace
    .getByRole('button', { name: `Not right? Correct the name of ${correctable.nameEn}` })
    .click();
  const nameInput = selectedPlace.getByLabel('Name of this place');
  await expect(nameInput).toHaveValue(correctable.nameEn);
  await nameInput.fill(correctedName);

  const submissionPromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' && response.url().includes('/corrections?lang=en')
    );
  });
  await selectedPlace.getByRole('button', { name: 'Send', exact: true }).click();
  const submission = await submissionPromise;
  const submissionBody = await submission.text();
  expect(submission.status(), submissionBody).toBe(200);
  const nameFlagId = (JSON.parse(submissionBody) as { flagId: string }).flagId;

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(
    `/en/moderation?queue=corrections-and-reports&item=${nameFlagId}&filter=actionable`
  );
  await waitForHydration(moderatorPage);

  // The database accepts the one-language draft, so this panel is the only thing standing between
  // a half-translated claim and a published Place.
  const apply = moderatorPage
    .getByRole('button', { name: 'Apply correction', exact: true })
    .first();
  await expect(apply).toBeDisabled();
  await expect(moderatorPage.getByText('A translation is still missing').first()).toBeVisible();
  await expect(
    moderatorPage.getByRole('button', { name: 'Reject', exact: true }).first()
  ).toBeEnabled();

  const changeSection = moderatorPage.locator('#correction-change');
  await expandReviewSection(changeSection);
  await changeSection.getByRole('button', { name: 'Edit Change under review' }).click();
  const applicationForm = changeSection.locator('[data-section-form="application"]');
  // The Member was reading in English, so English is the locale their Correction wrote and
  // Icelandic is the one it named for review. The flagged box prefills empty, so nothing invites
  // accepting text nobody wrote.
  await expect(applicationForm.getByLabel('Name in English')).toHaveValue(correctedName);
  await expect(applicationForm.getByLabel('Name in Icelandic')).toHaveValue('');
  await applicationForm.getByLabel('Name in Icelandic').fill(correctedName);
  await applicationForm.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(moderatorPage.getByText('Draft changes saved.')).toBeVisible();

  await expect(apply).toBeEnabled();
  await apply.click();
  const dialog = moderatorPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const decisionPromise = moderatorPage.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().includes('?/decideCorrection');
  });
  await dialog.getByRole('button', { name: 'Apply correction', exact: true }).click();
  const decision = await decisionPromise;
  const decisionBody = await decision.text();
  expect(decision.status(), decisionBody).toBe(200);
  await expect(moderatorPage.locator('.live-status')).toContainText('The outcome has been saved.', {
    timeout: 10_000
  });
  await moderatorContext.close();

  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  for (const locale of ['en', 'is'] as const) {
    const { data: rows } = await publicClient.rpc('get_published_place_profile', {
      requested_place_id: correctable.placeId,
      requested_locale: locale
    });
    expect(rows?.[0]?.name, `locale ${locale}`).toBe(correctedName);
  }
});

test('a signed-in Member cannot open the Moderator Correction/Report queue', async ({ page }) => {
  const memberEmail = `place-flag-unauthorized-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const response = await page.goto('/en/moderation/corrections-and-reports');
  expect(response?.status()).toBe(403);
});

async function signInMember(page: Page, email: string): Promise<void> {
  const { correctable } = localPlaceFlagFixtures;
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(`/en/places/${correctable.placeId}/correct`)}`
  );
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
}

async function signInModerator(page: Page): Promise<void> {
  page.setDefaultTimeout(10_000);
  // The shared Moderator email is signed in once per test in this file; clearing first keeps
  // waitForLocalMagicLink from matching a still-present message from an earlier sign-in.
  await clearLocalEvaluationMailbox();
  await page.goto(
    '/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%3Fqueue%3Dcorrections-and-reports%26filter%3Dactionable'
  );
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === '/en/moderation' &&
      url.searchParams.get('queue') === 'corrections-and-reports' &&
      url.searchParams.get('filter') === 'actionable'
    );
  });
  await waitForHydration(page);
}

async function submitCorrection(
  page: Page,
  placeId: string,
  field: 'phone' | 'website_url',
  newValue: string,
  activatedCurrentWeek = false
): Promise<string> {
  await page.goto(`/en/places/${placeId}/correct?field=${field}`);
  await page.getByLabel('New value').fill(newValue);
  // No Evidence fieldset: the server synthesizes the Member report record from the explanation.
  await page
    .getByLabel('Private explanation to the Moderator')
    .fill(`The ${field.replace('_', ' ')} changed.`);
  await page.getByRole('button', { name: 'Send private Correction' }).click();
  await expect(
    page.locator(
      `[data-weekly-rhythm-acknowledgement][data-recognition-action="correction"][data-activated-week="${activatedCurrentWeek}"]`
    )
  ).toBeVisible();
  return submittedFlagId(page);
}

async function submitAccessConditionReport(
  page: Page,
  placeId: string,
  accessConditionId: string,
  options: { reason: string; safetyConcern: boolean },
  activatedCurrentWeek = false
): Promise<string> {
  await page.goto(`/en/places/${placeId}/report?conditionId=${accessConditionId}`);
  await page.getByLabel('What kind of problem is this?').selectOption(options.reason);
  if (options.safetyConcern) {
    await page.getByLabel('This is a Safety Concern').check();
  }
  await fillEvidence(page, 'Report source');
  await page.getByLabel('Private explanation to the Moderator').fill('Witnessed in person.');
  await page.getByRole('button', { name: 'Send private Report' }).click();
  await expect(
    page.locator(
      `[data-weekly-rhythm-acknowledgement][data-recognition-action="report"][data-activated-week="${activatedCurrentWeek}"]`
    )
  ).toBeVisible();
  return submittedFlagId(page);
}

async function fillEvidence(container: Page | Locator, label: string): Promise<void> {
  await container.getByLabel('How did you find out?').selectOption('direct_observation');
  await container.getByLabel('Short title').fill(label);
  await container.getByLabel('Link, if you have one').fill('https://example.invalid/e2e-source');
  await container.getByLabel('When did you find out?').fill('2026-07-11T09:00');
}

async function resolveLatestFlag(
  page: Page,
  flagId: string,
  outcome: 'applied' | 'confirmed_useful' | 'rejected' | 'dispute_opened' | 'place_inactivated',
  applied?: { fieldValueText: string }
): Promise<void> {
  await page.goto(`/en/moderation?queue=corrections-and-reports&item=${flagId}&filter=actionable`);
  await waitForHydration(page);
  await expect(page).toHaveURL((url) => url.searchParams.get('item') === flagId);

  if (outcome === 'applied' && applied) {
    const changeSection = page.locator('#correction-change');
    await expandReviewSection(changeSection);
    await changeSection.getByRole('button', { name: 'Edit Change under review' }).click();
    const applicationForm = changeSection.locator('[data-section-form="application"]');
    await applicationForm.getByLabel('New value').fill(applied.fieldValueText);
    await applicationForm.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Draft changes saved.')).toBeVisible();
    await expect(applicationForm).toHaveCount(0);
  }

  if (outcome === 'dispute_opened') {
    const alternativesSection = page.locator('#correction-alternatives');
    await expandReviewSection(alternativesSection);
    await alternativesSection.getByRole('button', { name: 'Edit Open an access dispute' }).click();
    const disputeForm = alternativesSection.locator('[data-section-form="dispute"]');
    await disputeForm
      .getByLabel('Reason for the dispute')
      .fill('A Member Report contradicts the currently posted policy.');
    await fillReviewEvidence(disputeForm, 'Dispute source');
    await disputeForm.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Draft changes saved.')).toBeVisible();
    await expect(disputeForm).toHaveCount(0);
  }

  if (outcome === 'place_inactivated') {
    const alternativesSection = page.locator('#correction-alternatives');
    await expandReviewSection(alternativesSection);
    await alternativesSection.getByRole('button', { name: 'Edit Inactivate this Place' }).click();
    const transitionForm = alternativesSection.locator('[data-section-form="transition"]');
    await transitionForm
      .getByLabel("Moderator's decision notes")
      .fill('Business permanently closed.');
    await transitionForm.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Draft changes saved.')).toBeVisible();
    await expect(transitionForm).toHaveCount(0);
  }

  const actionName =
    outcome === 'applied'
      ? 'Apply correction'
      : outcome === 'confirmed_useful'
        ? 'Confirm useful'
        : outcome === 'dispute_opened'
          ? 'Open dispute'
          : outcome === 'place_inactivated'
            ? 'Inactivate Place'
            : 'Reject';
  await page.getByRole('button', { name: actionName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (outcome !== 'applied' && outcome !== 'confirmed_useful') {
    await dialog.getByLabel('Member explanation in Icelandic').fill('Yfirfarið af stjórnanda.');
    await dialog.getByLabel('Member explanation in English').fill('Reviewed by a Moderator.');
    await dialog
      .getByLabel('Private Moderator note')
      .fill(
        outcome === 'rejected'
          ? 'The venue confirmed this URL is unused.'
          : 'Escalated informally; venue contacted.'
      );
  }
  const responsePromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().includes('?/decideCorrection');
  });
  await dialog.getByRole('button', { name: actionName, exact: true }).click();
  const decisionResponse = await responsePromise;
  const decisionBody = await decisionResponse.text();
  expect(decisionResponse.status(), decisionBody).toBe(200);
  await expect(page.locator('.live-status'), `Decision response: ${decisionBody}`).toContainText(
    'The outcome has been saved.',
    { timeout: 10_000 }
  );
}

async function confirmUsefulContribution(page: Page, flagId: string): Promise<void> {
  await page.goto(`/en/moderation?queue=corrections-and-reports&item=${flagId}&filter=resolved`);
  await waitForHydration(page);
  await expect(page).toHaveURL((url) => url.searchParams.get('item') === flagId);
  await page.getByRole('button', { name: 'Confirm useful Contribution' }).click();
  await expect(page.getByText('The useful Contribution has been confirmed.')).toBeVisible();
}

function submittedFlagId(page: Page): string {
  const flagId = new URL(page.url()).searchParams.get('submitted');
  expect(flagId).toMatch(/^[0-9a-f-]{36}$/i);
  return flagId!;
}

async function fillReviewEvidence(form: Locator, label: string): Promise<void> {
  await form.getByLabel('Evidence type').selectOption('direct_observation');
  await form.getByLabel('Source label').fill(label);
  await form.getByLabel('Source URL').fill('https://example.invalid/e2e-source');
  await form.getByLabel('When was this source observed?').fill('2026-07-11T09:00');
}

async function expandReviewSection(section: Locator): Promise<void> {
  if ((await section.getAttribute('open')) === null) {
    await section.locator('summary').click();
  }
}
