import { expect, test } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import { waitForHydration } from './support/hydration';
import {
  provisionLocalModerator,
  provisionLocalPlaceFlagFixtures,
  provisionLocalPlaceFlagReviewFixture,
  provisionLocalSuggestionFixture,
  waitForLocalMagicLink
} from './support/local-supabase';

let suggestionId: string;
let flagId: string;
const nextSuggestionId = '65000000-0000-4000-8000-000000000094';

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  provisionLocalPlaceFlagFixtures();
  flagId = await provisionLocalPlaceFlagReviewFixture(evaluationModerator.email);
  suggestionId = await provisionLocalSuggestionFixture(evaluationModerator.email);
});

test('a Moderator signs in and opens a query-backed compact Suggestions workspace', async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation');
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('The link has been sent.')).toBeVisible();

  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(
    `/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`
  );
  await expect(page.getByRole('heading', { name: 'Moderation board', level: 1 })).toBeVisible();

  const queues = page.getByRole('navigation', { name: 'Moderation queues' });
  await expect(queues.getByRole('link', { name: /Suggestions/ })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(queues.getByRole('link', { name: /Corrections and reports/ })).toBeVisible();
  await expect(queues.getByRole('link', { name: /Candidate places/ })).toBeVisible();

  const workList = page.getByRole('region', { name: 'Selected moderation queue' });
  await expect(workList.getByRole('link', { name: /^Visual Suggestion / })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await expect(page.getByRole('region', { name: 'Selected moderation item' })).toContainText(
    'Visual Suggestion'
  );

  await waitForHydration(page);
  await page.keyboard.press('j');
  await expect(page).toHaveURL(
    `/en/moderation?queue=suggestions&item=${nextSuggestionId}&filter=actionable`
  );
  await page.keyboard.press('k');
  await expect(page).toHaveURL(
    `/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`
  );
  await expect(page.getByRole('link', { name: 'Add a Candidate Place' })).toHaveAttribute(
    'href',
    '/en/moderation/places/new'
  );

  await page.reload();
  await expect(page).toHaveURL(
    `/en/moderation?queue=suggestions&item=${suggestionId}&filter=actionable`
  );
  await expect(page.getByRole('region', { name: 'Selected moderation item' })).toContainText(
    'Visual Suggestion'
  );

  const suggestionQueueLink = queues.getByRole('link', { name: /Suggestions/ });
  const countBefore = Number((await suggestionQueueLink.textContent())?.match(/\d+/)?.[0]);
  expect(countBefore).toBeGreaterThanOrEqual(2);

  const decisionDock = page.getByRole('region', { name: 'Decision controls' });
  await decisionDock.getByRole('button', { name: 'Needs information' }).click();
  await expect(page.locator('select[name="outcome"]')).toHaveValue('needs_information');
  await page.getByLabel('Member explanation in Icelandic').fill('Vinsamlegast bættu við heimild.');
  await page.getByLabel('Member explanation in English').fill('Please add a supporting source.');
  await page.getByLabel('Private Moderator note').fill('Reviewed in the compact workspace.');
  await page.getByRole('button', { name: 'Save outcome' }).click();

  await expect(page).toHaveURL(
    `/en/moderation?queue=suggestions&item=${nextSuggestionId}&filter=actionable`
  );
  await expect(page.getByRole('status')).toContainText(
    'Needs information. The outcome has been saved.'
  );
  await expect(page.getByRole('region', { name: 'Selected moderation item' })).toContainText(
    'Next Visual Suggestion'
  );
  expect(
    await page
      .locator(`[data-work-item-id="${nextSuggestionId}"]`)
      .evaluate((element) => element === document.activeElement)
  ).toBe(true);
  const countAfter = Number(
    (await queues.getByRole('link', { name: /Suggestions/ }).textContent())?.match(/\d+/)?.[0]
  );
  expect(countAfter).toBe(countBefore - 1);

  await page.reload();
  await expect(page).toHaveURL(
    `/en/moderation?queue=suggestions&item=${nextSuggestionId}&filter=actionable`
  );
  await expect(page.getByRole('region', { name: 'Selected moderation item' })).toContainText(
    'Next Visual Suggestion'
  );

  const stalePage = await page.context().newPage();
  await stalePage.goto(
    `/en/moderation?queue=suggestions&item=${nextSuggestionId}&filter=actionable`
  );
  for (const moderatorPage of [page, stalePage]) {
    await moderatorPage
      .getByRole('region', { name: 'Decision controls' })
      .getByRole('button', { name: 'Rejected' })
      .click();
    await moderatorPage
      .getByLabel('Member explanation in Icelandic')
      .fill('Tillagan var yfirfarin samhliða.');
    await moderatorPage
      .getByLabel('Member explanation in English')
      .fill('The Suggestion was reviewed concurrently.');
    await moderatorPage
      .getByLabel('Private Moderator note')
      .fill('This entered note must survive a conflict.');
  }
  await page.getByLabel('Private Moderator note').fill('The winning Moderator note.');
  await page.getByRole('button', { name: 'Save outcome' }).click();
  await stalePage.getByRole('button', { name: 'Save outcome' }).click();
  await expect(stalePage.getByRole('alert')).toContainText(
    'This Suggestion outcome was already finalized by another Moderator.'
  );
  await expect(stalePage).toHaveURL(
    `/en/moderation?queue=suggestions&item=${nextSuggestionId}&filter=actionable`
  );
  await expect(stalePage.getByLabel('Member explanation in English')).toHaveValue(
    'The Suggestion was reviewed concurrently.'
  );
  await expect(stalePage.getByLabel('Private Moderator note')).toHaveValue(
    'This entered note must survive a conflict.'
  );
  await expect(stalePage.getByText('The winning Moderator note.')).toBeVisible();
  await expect(stalePage.getByRole('button', { name: 'Save outcome' })).toBeDisabled();
  await stalePage.close();

  const correctionQueue = page
    .getByRole('navigation', { name: 'Moderation queues' })
    .getByRole('link', { name: /Corrections and reports/ });
  const correctionCountBefore = Number((await correctionQueue.textContent())?.match(/\d+/)?.[0]);
  await correctionQueue.click();
  await expect(page).toHaveURL(
    `/en/moderation?queue=corrections-and-reports&item=${flagId}&filter=actionable`
  );
  const correctionReview = page.getByRole('region', { name: 'Selected moderation item' });
  await expect(correctionReview).toContainText('Flag E2E Cafe');
  await expect(correctionReview).toContainText('Safety Concern');
  await expect(correctionReview).toContainText('Current value now');
  await expect(correctionReview).toContainText('Value when submitted');

  await page
    .getByRole('region', { name: 'Decision controls' })
    .getByRole('button', { name: 'Rejected' })
    .click();
  await expect(page.locator('#correction-decision select[name="outcome"]')).toHaveValue('rejected');
  await page.getByLabel('Member explanation in Icelandic').fill('Ábendingin var yfirfarin.');
  await page.getByLabel('Member explanation in English').fill('The report was reviewed.');
  await page.getByLabel('Private Moderator note').fill('Resolved inline in the workspace.');
  await page.getByRole('button', { name: 'Save outcome' }).click();

  await expect(page).toHaveURL(/\/en\/moderation\?queue=corrections-and-reports/);
  await expect(page.getByRole('status')).toContainText('Rejected. The outcome has been saved.');
  const correctionCountAfter = Number(
    (
      await page
        .getByRole('navigation', { name: 'Moderation queues' })
        .getByRole('link', { name: /Corrections and reports/ })
        .textContent()
    )?.match(/\d+/)?.[0]
  );
  expect(correctionCountAfter).toBe(correctionCountBefore - 1);

  const extremeCursor = `${Number.MAX_SAFE_INTEGER.toString(36)}~30000000-0000-4000-8000-000000000003`;
  await page.goto(
    `/en/moderation?queue=candidate-places&filter=actionable&cursor=${extremeCursor}`
  );
  await expect(page).toHaveURL((url) => {
    return url.searchParams.get('queue') === 'candidate-places' && !url.searchParams.has('cursor');
  });
});
