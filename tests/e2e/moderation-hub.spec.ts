import { expect, test, type Locator, type Page } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import { waitForHydration } from './support/hydration';
import {
  clearLocalEvaluationMailbox,
  getLocalSuggestionStates,
  localPlaceFlagFixtures,
  provisionLocalModerationWorkbenchFixtures,
  provisionLocalModerator,
  waitForLocalMagicLink,
  type LocalModerationWorkbenchFixtures
} from './support/local-supabase';

let fixtures: LocalModerationWorkbenchFixtures;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
});

test.beforeEach(async () => {
  fixtures = await provisionLocalModerationWorkbenchFixtures(evaluationModerator.email);
});

test('the queue and review columns scroll independently while decisions stay available', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await signInModerator(
    page,
    `/en/moderation?queue=suggestions&item=${fixtures.suggestionId}&filter=actionable`
  );

  const workList = page.locator('[data-work-list-scroll]');
  const review = page.locator('[data-review-scroll]');
  const decisionDock = page.getByRole('region', { name: 'Decision controls' });
  const reviewHeading = page.locator('.review-head');

  await expect(workList).toBeVisible();
  await expect(review).toBeVisible();
  await expect(decisionDock).toBeVisible();
  await expect
    .poll(() => workList.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await expect
    .poll(() => review.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);

  const headingTop = (await reviewHeading.boundingBox())?.y;
  const dockBottom = (await decisionDock.boundingBox())?.y;
  expect(headingTop).toBeDefined();
  expect(dockBottom).toBeDefined();

  await workList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => workList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => review.evaluate((element) => element.scrollTop)).toBe(0);

  const workListScrollTop = await workList.evaluate((element) => element.scrollTop);
  await review.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => review.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => workList.evaluate((element) => element.scrollTop)).toBe(workListScrollTop);
  await expect(reviewHeading).toBeInViewport();
  await expect(decisionDock).toBeInViewport();
  expect((await reviewHeading.boundingBox())?.y).toBeCloseTo(headingTop!, 0);
  expect((await decisionDock.boundingBox())?.y).toBeCloseTo(dockBottom!, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth)
  );
});

test('a Moderator edits a Candidate, reloads it, and publishes it', async ({ page }) => {
  test.setTimeout(90_000);
  await signInModerator(
    page,
    `/en/moderation?queue=candidate-places&item=${fixtures.candidatePlaceId}&filter=actionable`
  );

  const identity = page.locator('#candidate-overview');
  await expandSection(identity);
  await identity.getByRole('button', { name: 'Edit Place identity' }).click();
  const identityForm = identity.locator('form[data-section-form="identity"]');
  await identityForm.getByLabel('Operator').fill('Low-friction Candidate operator');
  await identityForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Draft changes saved.');

  await page.reload();
  await waitForHydration(page);
  await expect(identity).toContainText('Low-friction Candidate operator');

  const access = page.locator('#access-condition');
  await expandSection(access);
  await access.getByRole('button', { name: 'Edit Current Access Condition' }).click();
  const accessForm = access.locator('form[data-section-form="access_conditions"]');
  if ((await accessForm.getByRole('group').count()) === 0) {
    await accessForm.getByRole('button', { name: 'Add another condition' }).click();
  }
  await accessForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Draft changes saved.');

  const evidence = page.locator('#evidence');
  await expandSection(evidence);
  await evidence.getByRole('button', { name: 'Edit Supporting Evidence' }).click();
  const evidenceForm = evidence.locator('form[data-section-form="evidence_records"]');
  if ((await evidenceForm.getByRole('group').count()) === 0) {
    await evidenceForm.getByRole('button', { name: 'Add another Evidence source' }).click();
    await evidenceForm.getByLabel('Evidence source title').fill('Moderator-confirmed source');
    await evidenceForm
      .getByLabel('Evidence URL')
      .fill('https://example.invalid/moderator-confirmed-source');
  }
  await evidenceForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Draft changes saved.');

  await expandSection(page.locator('#publication-evidence'));
  const evidenceGroups = page.getByRole('group', { name: /Evidence supporting condition/ });
  await expect(evidenceGroups).not.toHaveCount(0);
  for (let index = 0; index < (await evidenceGroups.count()); index += 1) {
    await evidenceGroups.nth(index).getByRole('checkbox').first().check();
  }

  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Verify and publish' })
    .click();
  const publishDialog = page.getByRole('dialog', { name: 'Publish this Place?' });
  await expect(publishDialog).toBeVisible();
  await publishDialog.getByRole('button', { name: 'Verify and publish' }).click();
  await expect(page.getByRole('status')).toContainText('The Place has been published.');

  const response = await page.request.get(`/api/places/${fixtures.candidatePlaceId}?lang=en`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    placeId: fixtures.candidatePlaceId,
    name: 'Candidate Place',
    accessConditions: [expect.objectContaining({ accessArea: 'outdoors' })]
  });
});

test('a Moderator edits a Suggestion and accepts the edited draft as a Candidate', async ({
  page
}) => {
  await signInModerator(
    page,
    `/en/moderation?queue=suggestions&item=${fixtures.suggestionId}&filter=actionable`
  );

  const identity = page.locator('#suggestion-identity');
  await expandSection(identity);
  await identity.getByRole('button', { name: 'Edit Place identity' }).click();
  const identityForm = identity.locator('form[data-section-form="identity"]');
  await identityForm.getByLabel('Operator').fill('Low-friction Suggestion operator');
  await identityForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Draft changes saved.');

  await page.reload();
  await waitForHydration(page);
  await expect(identity).toContainText('Low-friction Suggestion operator');

  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Accept as Candidate' })
    .click();
  const acceptDialog = page.getByRole('dialog', { name: 'Accept this Suggestion?' });
  await expect(acceptDialog).toBeVisible();
  await acceptDialog.getByRole('button', { name: 'Accept as Candidate' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Accepted as a Candidate. The outcome has been saved.'
  );

  const accepted = getLocalSuggestionStates().find((item) => item.nameEn === 'Visual Suggestion');
  expect(accepted?.candidatePlaceId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.goto(
    `/en/moderation?queue=candidate-places&item=${accepted!.candidatePlaceId}&filter=actionable`
  );
  await expect(page.locator('#candidate-overview')).toContainText(
    'Low-friction Suggestion operator'
  );
});

test('a Moderator edits and applies a Correction, then confirms a Report as useful', async ({
  page
}) => {
  await signInModerator(
    page,
    `/en/moderation?queue=corrections-and-reports&item=${fixtures.correctionFlagId}&filter=actionable`
  );

  const change = page.locator('#correction-change');
  await expandSection(change);
  await change.getByRole('button', { name: 'Edit Change under review' }).click();
  const applicationForm = change.locator('form[data-section-form="application"]');
  await applicationForm.getByLabel('Name in Icelandic').fill('Lágviðnáms kaffihús');
  await applicationForm.getByLabel('Name in English').fill('Low-friction corrected cafe');
  await applicationForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Draft changes saved.');

  await page.reload();
  await waitForHydration(page);
  await expect(change).toContainText('Low-friction corrected cafe');
  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Apply correction' })
    .click();
  const applyDialog = page.getByRole('dialog', { name: 'Apply this correction?' });
  await expect(applyDialog).toBeVisible();
  await applyDialog.getByRole('button', { name: 'Apply correction' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Correction published. The outcome has been saved.'
  );

  const publicResponse = await page.request.get(
    `/api/places/${localPlaceFlagFixtures.correctable.placeId}?lang=en`
  );
  expect(publicResponse.status()).toBe(200);
  expect(await publicResponse.text()).toContain('Low-friction corrected cafe');

  await page.goto(
    `/en/moderation?queue=corrections-and-reports&item=${fixtures.flagId}&filter=actionable`
  );
  await expect(page.getByRole('region', { name: 'Selected moderation item' })).toContainText(
    'Safety Concern'
  );
  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Confirm useful' })
    .click();
  const usefulDialog = page.getByRole('dialog', { name: 'Confirm this report as useful?' });
  await expect(usefulDialog).toBeVisible();
  await usefulDialog.getByRole('button', { name: 'Confirm useful' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Confirmed as a useful Report. The outcome has been saved.'
  );
});

test('a Moderator can defer, reject, and reopen a Candidate without losing it', async ({ page }) => {
  await signInModerator(
    page,
    `/en/moderation?queue=candidate-places&item=${fixtures.candidatePlaceId}&filter=actionable`
  );

  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Needs information' })
    .click();
  await submitReasonDialog(page, 'Needs information');
  await expect(page.getByRole('status')).toContainText('Information request sent.');

  await chooseQueueStatus(page, 'Deferred');
  await selectWorkItem(page, fixtures.candidatePlaceId);
  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Reject' })
    .click();
  const rejectDialog = page.getByRole('dialog', { name: 'Reject this Candidate?' });
  await rejectDialog.getByLabel('Reason').selectOption('insufficient_evidence');
  await submitReasonDialog(page, 'Reject');
  await expect(page.getByRole('status')).toContainText('Candidate rejected.');

  await chooseQueueStatus(page, 'Resolved');
  await selectWorkItem(page, fixtures.candidatePlaceId);
  const decisionDock = page.getByRole('region', { name: 'Decision controls' });
  await expect(decisionDock.getByRole('button')).toHaveCount(1);
  await decisionDock.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.getByRole('status')).toContainText('Candidate reopened.');

  await chooseQueueStatus(page, 'Actionable');
  await expect(page.locator(`[data-work-item-id="${fixtures.candidatePlaceId}"]`)).toBeVisible();
});

async function signInModerator(page: Page, returnTo: string): Promise<void> {
  page.setDefaultTimeout(10_000);
  await clearLocalEvaluationMailbox();
  await page.goto(`/en/moderation/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('The link has been sent.')).toBeVisible();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(returnTo);
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Moderation board', level: 1 })).toBeVisible();
}

async function submitReasonDialog(page: Page, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Member explanation in Icelandic').fill('Yfirfarið af stjórnanda.');
  await dialog.getByLabel('Member explanation in English').fill('Reviewed by a Moderator.');
  await dialog.getByLabel('Private Moderator note').fill('Reviewed in the moderation workspace.');
  await dialog.getByRole('button', { name: confirmLabel, exact: true }).click();
}

async function selectWorkItem(page: Page, itemId: string): Promise<void> {
  const item = page.locator(`[data-work-item-id="${itemId}"]`);
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL((url) => url.searchParams.get('item') === itemId);
}

async function chooseQueueStatus(
  page: Page,
  status: 'Actionable' | 'Deferred' | 'Resolved'
): Promise<void> {
  const filters = page.getByRole('navigation', { name: 'Queue status' });
  await filters.getByRole('link', { name: status }).click();
  await expect(filters.getByRole('link', { name: status })).toHaveAttribute('aria-current', 'page');
}

async function expandSection(section: Locator): Promise<void> {
  if ((await section.getAttribute('open')) === null) {
    await section.locator('summary').click();
  }
}
