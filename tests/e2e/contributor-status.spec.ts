import { expect, test, type Page } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  configureLocalContributorStatusPolicy,
  disableLocalContributorStatusPolicy,
  getLocalSupabaseStatus,
  provisionLocalConfirmedContribution,
  provisionLocalModerator,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

// The Member view deliberately excludes any count, ratio, or "N more needed" figure (per the human
// interrupt against volume-incentive displays baked into public.get_my_contributor_status), so every
// assertion below that inspects the qualifying view also proves no such figure ever renders.
const numericProgressPattern = /\d+\s*\/\s*\d+/;

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalContributorStatusPolicy();
});

test.afterAll(async () => {
  // The qualification policy is a database-wide singleton; leaving the e2e policy enabled would
  // remove the "no policy configured yet" note from the Moderator suggestion review page for
  // every later suite in this shared local database session, breaking the visual baselines that
  // captured the seeded unconfigured state.
  await disableLocalContributorStatusPolicy();
});

test('a Member sees a private Contributor status that recalculates as history changes', async ({
  page,
  browser
}) => {
  test.setTimeout(60_000);
  const memberEmail = `contributor-status-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  // 1. Zero Contributions: the base "no status yet" private view, with no numeric figure.
  await page.goto('/en/account/contributor-status');
  await expect(page.getByRole('heading', { name: 'Your Contributor status' })).toBeVisible();
  await expect(page.getByText('Not yet a Contributor', { exact: true })).toBeVisible();
  const baseStatusText = await page.locator('main').innerText();
  expect(baseStatusText).not.toMatch(numericProgressPattern);

  // 2. A confirmed Contribution plus a qualifying policy promotes the tier, still with no figure.
  const fixture = await provisionLocalConfirmedContribution(memberEmail, evaluationModerator.email);
  await page.reload();
  await expect(page.getByText('Trusted Contributor', { exact: true })).toBeVisible();
  const qualifiedStatusText = await page.locator('main').innerText();
  expect(qualifiedStatusText).not.toMatch(numericProgressPattern);

  // 4. Revoking the Contribution through the real Moderator command downgrades the tier on reload,
  // proving the status is recomputed live rather than cached.
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(`/en/moderation/suggestions/${fixture.suggestionId}`);
  await moderatorPage
    .getByLabel('Revocation reason')
    .fill('End-to-end contributor downgrade proof.');
  await moderatorPage.getByRole('button', { name: 'Revoke this Contribution' }).click();
  await expect(moderatorPage.getByText('The Contribution has been revoked.')).toBeVisible();
  await moderatorContext.close();

  await page.reload();
  await expect(page.getByText('Not yet a Contributor', { exact: true })).toBeVisible();
});

test('unauthenticated requests cannot reach or discover any Contributor status', async ({
  page,
  request
}) => {
  // 3a. The private Member view denies and redirects an unauthenticated request; it never renders.
  const contributorStatusPath = '/en/account/contributor-status';
  await page.goto(contributorStatusPath);
  await expect(page).toHaveURL(
    `/en?auth=open&authReturnTo=${encodeURIComponent(contributorStatusPath)}`
  );
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByText('Not yet a Contributor')).toHaveCount(0);
  await expect(page.getByText('Trusted Contributor')).toHaveCount(0);

  // 3b. There is no public route exposing status: the one moderation surface that renders a
  // Contributor signal also denies and redirects an unauthenticated request, never rendering it.
  const moderationSuggestionPath =
    '/en/moderation/suggestions/00000000-0000-4000-8000-000000000000';
  await page.goto(moderationSuggestionPath);
  await expect(page).toHaveURL(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(moderationSuggestionPath)}`
  );
  await expect(page.getByRole('heading', { name: 'Moderator sign-in' })).toBeVisible();
  await expect(page.getByText('Contributor signal')).toHaveCount(0);

  // 3c. Neither status RPC is reachable directly by an unauthenticated caller.
  const status = getLocalSupabaseStatus();
  const anonHeaders = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
    'Content-Type': 'application/json'
  };

  const myStatusResponse = await request.post(
    `${status.apiUrl}/rest/v1/rpc/get_my_contributor_status`,
    { headers: anonHeaders, data: {} }
  );
  expect(myStatusResponse.ok()).toBe(false);
  expect([401, 403, 404]).toContain(myStatusResponse.status());

  const moderationStatusResponse = await request.post(
    `${status.apiUrl}/rest/v1/rpc/get_moderation_contributor_status`,
    {
      headers: anonHeaders,
      data: { requested_member_id: '00000000-0000-4000-8000-000000000000' }
    }
  );
  expect(moderationStatusResponse.ok()).toBe(false);
  expect([401, 403, 404]).toContain(moderationStatusResponse.status());
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: /Send (me a )?sign-in link/ }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
}

async function signInModerator(page: Page): Promise<void> {
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fsuggestions');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL('/en/moderation/suggestions');
}
