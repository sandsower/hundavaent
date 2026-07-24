import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  configureLocalContributorStatusPolicy,
  configureLocalPlaceFlagAbusePolicy,
  disableLocalContributorStatusPolicy,
  ensureLocalMemberFixtureActivation,
  getLocalTrustedVerificationFlagId,
  provisionLocalConfirmedContribution,
  provisionLocalModerator,
  provisionLocalTrustedVerificationPlace,
  retireLocalTrustedVerificationPlace,
  waitForLocalMagicLink,
  type LocalTrustedVerificationPlace
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

let fixture: LocalTrustedVerificationPlace;

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalContributorStatusPolicy();
  await configureLocalPlaceFlagAbusePolicy();
  fixture = provisionLocalTrustedVerificationPlace();
  await clearLocalEvaluationMailbox();
});

test.afterAll(async () => {
  retireLocalTrustedVerificationPlace(fixture.placeId);
  await disableLocalContributorStatusPolicy();
});

test('earned verification reaches review, permanent impact, feedback, and a safe downgrade', async ({
  browser,
  page
}) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  const memberEmail = `trusted-verification-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);
  await ensureLocalMemberFixtureActivation(memberEmail);
  await provisionLocalConfirmedContribution(memberEmail, evaluationModerator.email);

  await page.goto('/en/account');
  await expect(page.getByRole('heading', { name: 'Help keep places current' })).toBeVisible();
  await page.getByRole('link', { name: 'See verification tasks' }).click();
  await expect(page).toHaveURL('/en/account/keep-current');

  const taskCard = page.locator('[data-task-kind="dog_amenities"]').filter({
    has: page.getByRole('heading', { name: fixture.nameEn })
  });
  await expect(taskCard).toBeVisible();
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await taskCard.getByText('Verify this place', { exact: true }).click();
  await taskCard.getByLabel('Dog amenities present').fill('water bowl, waste bags');
  await taskCard.getByLabel('How did you find out?').selectOption('direct_observation');
  await taskCard.getByLabel('Short title').fill('Observed at the fixture');
  await taskCard.getByLabel('A short reference, if there is no link').fill('Checked in person');
  await taskCard.getByLabel('When did you find out?').fill(new Date().toISOString().slice(0, 16));
  await taskCard.getByLabel('What did you check?').fill('Both amenities were present today.');
  await taskCard.getByRole('button', { name: 'Send for review' }).click();

  await expect(page.getByTestId('trusted-submission-success')).toBeVisible();
  await expect(page.getByText('This useful step marked your current week active.')).toBeVisible();
  expect(
    await page
      .locator('.celebration-icon')
      .evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const flagId = await getLocalTrustedVerificationFlagId(memberEmail, fixture.placeId);
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(`/en/moderation/corrections-and-reports/${flagId}`);
  await waitForHydration(moderatorPage);
  await expect(moderatorPage.getByRole('heading', { name: fixture.nameEn })).toBeVisible();
  await expect(moderatorPage.getByText('Trusted Verification', { exact: true })).toBeVisible();
  await expect(
    moderatorPage.getByText('Focused task submitted through the earned-responsibility flow', {
      exact: false
    })
  ).toBeVisible();

  await moderatorPage.getByRole('button', { name: 'Apply correction', exact: true }).click();
  const applyDialog = moderatorPage.getByRole('dialog');
  await expect(applyDialog).toBeVisible();
  await applyDialog.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await expect(moderatorPage.getByText('The outcome has been saved.')).toBeVisible();
  await moderatorPage.getByRole('button', { name: 'Confirm useful Contribution' }).click();
  await expect(
    moderatorPage.getByText('The useful Contribution has been confirmed.')
  ).toBeVisible();
  await moderatorContext.close();

  await page.goto('/en/account');
  await expect(
    page.getByRole('link', {
      name: 'See my impact A fact you verified was confirmed'
    })
  ).toBeVisible();
  await page.getByRole('link', { name: 'See my impact' }).click();
  const celebration = page.getByTestId('trusted-verification-celebration');
  await expect(celebration).toBeVisible();
  await expect(
    celebration.getByRole('heading', { name: 'A fact you verified was confirmed' })
  ).toBeVisible();
  await expect(page.locator('[data-impact-pillar]').last()).toHaveCSS('opacity', '1');
  await expectNoAxeViolations(page);
  await celebration.getByRole('button', { name: 'Got it' }).click();
  await expect(celebration).toHaveCount(0);

  await page.goto('/en/account/keep-current');
  await expect(page.getByText('Confirmed contribution', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View place' })).toBeVisible();

  await disableLocalContributorStatusPolicy();
  await page.goto('/en/account');
  await expect(page.getByRole('heading', { name: 'Help keep places current' })).toHaveCount(0);
  await page.goto('/en/account/keep-current');
  await expect(
    page.getByText('This area is available only to active Trusted Contributors.')
  ).toBeVisible();
  await expect(page.locator('[data-task-kind]')).toHaveCount(0);
  await expect(page.getByText('Confirmed contribution', { exact: true })).toBeVisible();
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
}

async function signInModerator(page: Page): Promise<void> {
  await clearLocalEvaluationMailbox();
  const returnTo = '/en/moderation?queue=corrections-and-reports&filter=actionable';
  await page.goto(`/en/moderation/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL((url) => url.pathname === '/en/moderation');
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    )
  ).toEqual([]);
}
