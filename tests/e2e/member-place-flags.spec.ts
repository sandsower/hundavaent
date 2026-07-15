import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

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

  await submitCorrection(page, correctable.placeId, 'phone', '+354 555 0199');
  await submitAccessConditionReport(page, correctable.placeId, correctable.accessConditionId, {
    reason: 'unsafe',
    safetyConcern: true
  });
  await submitCorrection(
    page,
    correctable.placeId,
    'website_url',
    'https://example.invalid/new-site'
  );

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);

  await resolveLatestFlag(moderatorPage, correctable.nameEn, 'Phone', 'applied', {
    fieldValueText: '+354 555 0199'
  });
  await resolveLatestFlag(
    moderatorPage,
    correctable.nameEn,
    'An Access Condition',
    'confirmed_useful'
  );
  await confirmUsefulContribution(moderatorPage);
  await resolveLatestFlag(moderatorPage, correctable.nameEn, 'Website', 'rejected');
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

  await submitAccessConditionReport(page, disputable.placeId, disputable.accessConditionId, {
    reason: 'misleading',
    safetyConcern: false
  });
  await submitAccessConditionReport(page, retirable.placeId, retirable.accessConditionId, {
    reason: 'closed',
    safetyConcern: false
  });

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);

  await resolveLatestFlag(
    moderatorPage,
    disputable.nameEn,
    disputable.accessConditionId,
    'dispute_opened'
  );
  await resolveLatestFlag(
    moderatorPage,
    retirable.nameEn,
    retirable.accessConditionId,
    'place_inactivated'
  );
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

  await page.goto(`/en/places/${retirable.placeId}`);
  await expect(page.getByRole('heading', { name: 'This place is no longer active' })).toBeVisible();
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
  // The shared Moderator email is signed in once per test in this file; clearing first keeps
  // waitForLocalMagicLink from matching a still-present message from an earlier sign-in.
  await clearLocalEvaluationMailbox();
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fcorrections-and-reports');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL('/en/moderation/corrections-and-reports');
}

async function submitCorrection(
  page: Page,
  placeId: string,
  field: 'phone' | 'website_url',
  newValue: string
): Promise<void> {
  await page.goto(`/en/places/${placeId}/correct?field=${field}`);
  await page.getByLabel('New value').fill(newValue);
  await fillEvidence(page, `Correction source for ${field}`);
  await page
    .getByLabel('Private explanation to the Moderator')
    .fill(`The ${field.replace('_', ' ')} changed.`);
  await page.getByRole('button', { name: 'Send private Correction' }).click();
  await expect(page.getByText('Your submission has been received for review.')).toBeVisible();
}

async function submitAccessConditionReport(
  page: Page,
  placeId: string,
  accessConditionId: string,
  options: { reason: string; safetyConcern: boolean }
): Promise<void> {
  await page.goto(`/en/places/${placeId}/report?conditionId=${accessConditionId}`);
  await page.getByLabel('What kind of problem is this?').selectOption(options.reason);
  if (options.safetyConcern) {
    await page.getByLabel('This is a Safety Concern').check();
  }
  await fillEvidence(page, 'Report source');
  await page.getByLabel('Private explanation to the Moderator').fill('Witnessed in person.');
  await page.getByRole('button', { name: 'Send private Report' }).click();
  await expect(page.getByText('Your submission has been received for review.')).toBeVisible();
}

async function fillEvidence(page: Page, label: string): Promise<void> {
  await page.getByLabel('How did you find out?').selectOption('direct_observation');
  await page.getByLabel('Short title').fill(label);
  await page.getByLabel('Link, if you have one').fill('https://example.invalid/e2e-source');
  await page.getByLabel('When did you find out?').fill('2026-07-11T09:00');
}

async function resolveLatestFlag(
  page: Page,
  placeName: string,
  targetHint: string,
  outcome: 'applied' | 'confirmed_useful' | 'rejected' | 'dispute_opened' | 'place_inactivated',
  applied?: { fieldValueText: string }
): Promise<void> {
  await page.goto('/en/moderation/corrections-and-reports');
  const rows = page.getByRole('listitem').filter({ hasText: placeName });
  const matchingRow =
    (await rows.count()) > 1 ? rows.filter({ hasText: targetHint }).first() : rows.first();
  await matchingRow.getByRole('link', { name: 'Review' }).click();

  await page.getByLabel('Outcome').selectOption(outcome);
  await page.getByLabel('Member explanation in Icelandic').fill('Yfirfarið af stjórnanda.');
  await page.getByLabel('Member explanation in English').fill('Reviewed by a Moderator.');

  if (outcome === 'rejected') {
    await page.getByLabel('Private Moderator note').fill('The venue confirmed this URL is unused.');
  } else {
    await page.getByLabel('Private Moderator note').fill('Escalated informally; venue contacted.');
  }

  if (outcome === 'applied' && applied) {
    await page.getByLabel('New value').fill(applied.fieldValueText);
  }

  if (outcome === 'dispute_opened') {
    await page
      .getByLabel('Reason for the dispute')
      .fill('A Member Report contradicts the currently posted policy.');
    await fillEvidence(page, 'Dispute source');
  }

  if (outcome === 'place_inactivated') {
    await page.getByLabel("Moderator's decision notes").fill('Business permanently closed.');
  }

  await page.getByRole('button', { name: 'Save outcome' }).click();
  await expect(page.getByText('The outcome has been saved.')).toBeVisible();
}

async function confirmUsefulContribution(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Confirm useful Contribution' }).click();
  await expect(page.getByText('The useful Contribution has been confirmed.')).toBeVisible();
}
