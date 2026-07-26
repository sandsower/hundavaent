import { expect, test, type Page } from '@playwright/test';

import {
  configureLocalAchievementPolicy,
  disableLocalAchievementPolicy,
  getLocalSupabaseStatus,
  provisionLocalAchievementProgress,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const unreadIndicator = '[data-achievement-unread-indicator]';

test.beforeAll(async () => {
  await configureLocalAchievementPolicy();
});

test.afterAll(async () => {
  // The policy is a database-wide singleton. Restore the seeded dark state so this suite cannot
  // change later suites that share the isolated local stack.
  await disableLocalAchievementPolicy();
});

test('a real Favourite keeps its unread cue through hover preload and celebrates exactly once', async ({
  page,
  context
}) => {
  test.setTimeout(60_000);
  const email = `achievements-${Date.now()}@example.invalid`;
  await signInMember(page, email);

  await page.goto('/en/account/achievements');
  await expect(page.getByRole('heading', { name: 'Your Achievements' })).toBeVisible();
  // A Member with nothing earned is no longer shown an empty page. The twelve open tiers are the
  // answer to "what is ahead", so there is no empty state left to render.
  await expect(page.locator('[data-achievement-tier]')).toHaveCount(12);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText('First Favourite')).toHaveCount(0);
  await expect(page.locator(unreadIndicator)).toHaveCount(0);

  // Saving through the real product UI creates the durable unlock.
  await page.goto('/en?view=list&q=Published');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Add Published Place to favorites' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Published Place from favorites' })
  ).toBeVisible();

  // Both signed-in tabs receive the subtle account cue before the intended experience is opened.
  await page.goto('/en/account');
  await expect(page.locator(unreadIndicator)).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto('/en/account');
  await expect(otherTab.locator(unreadIndicator)).toBeVisible();

  // Hundavænt globally preloads route data on hover. The pure page read must not consume the cue.
  // The trail panel is the hub's achievements door; its label is the live nearest-tier fact, so
  // the stable attribute is the only dependable locator.
  const achievementsLink = page.locator('[data-achievements-door]');
  const preloadResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/en/account/achievements/__data.json' &&
      response.request().method() === 'GET'
    );
  });
  await achievementsLink.hover();
  await preloadResponse;
  await expect(page.locator(unreadIndicator)).toBeVisible();
  await expect(otherTab.locator(unreadIndicator)).toBeVisible();

  await achievementsLink.click();
  await expect(page).toHaveURL('/en/account/achievements');
  await expect(
    page.getByRole('region', { name: 'New achievement: First Favourite' })
  ).toBeVisible();
  await expect(page.getByText('Nicely done')).toBeVisible();
  await expect(page.getByText('New', { exact: true })).toBeVisible();
  await expect(page.locator(unreadIndicator)).toHaveCount(0);
  await expect(otherTab.locator(unreadIndicator)).toHaveCount(0);

  // A reload preserves the archive entry but the atomic claim cannot celebrate it a second time.
  await page.reload();
  await expect(page.getByRole('region', { name: 'New achievement: First Favourite' })).toHaveCount(
    0
  );
  await expect(page.getByText('First Favourite')).toBeVisible();
  await expect(page.getByText('New', { exact: true })).toHaveCount(0);
  await expect(page.locator(unreadIndicator)).toHaveCount(0);

  await otherTab.close();

  // Retire the shared fixture Favourite. The once-ever unlock belongs only to this fresh Member.
  await page.goto('/en?view=list&q=Published');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Remove Published Place from favorites' }).click();
  await expect(
    page.getByRole('button', { name: 'Add Published Place to favorites' })
  ).toBeVisible();
});

test('started exploration shows every tier of every collection, gaps included', async ({
  page
}) => {
  const email = `achievement-progress-${Date.now()}@example.invalid`;
  await signInMember(page, email);
  await provisionLocalAchievementProgress(email);

  await page.goto('/en/account/achievements');
  await expect(page.getByRole('heading', { name: 'Milestones' })).toBeVisible();

  // Four collections of three tiers each: nothing is hidden, so the Member can see what is ahead.
  await expect(page.locator('[data-achievement-tier]')).toHaveCount(12);
  await expect(page.getByRole('heading', { name: 'Places', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Municipalities', exact: true })).toBeVisible();

  // Three credited Places across two category groups and one municipality.
  await expect(page.getByText('3 of 5 places')).toBeVisible();
  await expect(page.getByText('1 of 2 municipalities')).toBeVisible();

  // Only each collection's nearest unearned tier is an active target, so a screen reader hears one
  // progress figure per collection rather than three restatements of the same number.
  await expect(page.getByRole('progressbar')).toHaveCount(3);
  await expect(page.locator('[data-tier-state="locked"]').first()).toBeVisible();

  // The spacing rule is now explained rather than left to be discovered as an apparent bug.
  await expect(page.getByText('Check-ins close together count once.')).toBeVisible();

  // Every surprise or trust Achievement remains undiscoverable while locked.
  await expect(page.getByText('First Check-in')).toHaveCount(0);
  await expect(page.getByText('Recognized for Quality')).toHaveCount(0);
  await expect(page.getByText('Trusted Contributor')).toHaveCount(0);
  await expect(page.locator('[data-achievement-celebration]')).toHaveCount(0);
});

test('unauthenticated callers cannot reach or discover private Achievement state', async ({
  page,
  request
}) => {
  const achievementsPath = '/en/account/achievements';
  await page.goto(achievementsPath);
  await expect(page).toHaveURL(
    `/en?auth=open&authReturnTo=${encodeURIComponent(achievementsPath)}`
  );
  await expect(page.getByRole('dialog').getByLabel('Email address')).toBeVisible();
  await expect(page.getByText('First Favourite')).toHaveCount(0);

  const status = getLocalSupabaseStatus();
  const anonHeaders = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
    'Content-Type': 'application/json'
  };

  for (const functionName of [
    'get_my_achievements',
    'get_my_achievement_status',
    'claim_my_achievement_celebrations'
  ]) {
    const response = await request.post(`${status.apiUrl}/rest/v1/rpc/${functionName}`, {
      headers: anonHeaders,
      data: {}
    });
    expect(response.ok()).toBe(false);
    expect([401, 403, 404]).toContain(response.status());
  }

  const moderationResponse = await request.post(
    `${status.apiUrl}/rest/v1/rpc/get_moderation_member_achievements`,
    {
      headers: anonHeaders,
      data: { requested_member_id: '00000000-0000-4000-8000-000000000000' }
    }
  );
  expect(moderationResponse.ok()).toBe(false);
  expect([401, 403, 404]).toContain(moderationResponse.status());

  // The public feature-status boolean discloses only whether the experience is enabled.
  const featureResponse = await request.post(
    `${status.apiUrl}/rest/v1/rpc/get_achievement_feature_status`,
    { headers: anonHeaders, data: {} }
  );
  expect(featureResponse.ok()).toBe(true);
  expect(await featureResponse.json()).toEqual([{ enabled: true }]);
});

test('the page and account cue both fail closed while the policy is dark', async ({ page }) => {
  await disableLocalAchievementPolicy();

  try {
    const email = `achievements-dark-${Date.now()}@example.invalid`;
    await signInMember(page, email);
    await page.goto('/en/account/achievements');
    await expect(page.getByRole('heading', { name: 'Your Achievements' })).toBeVisible();
    await expect(page.getByText('Achievements are not available yet.')).toBeVisible();
    await expect(page.getByText('First Favourite')).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.locator(unreadIndicator)).toHaveCount(0);
  } finally {
    await configureLocalAchievementPolicy();
  }
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
  await waitForHydration(page);
}
