import { expect, test, type Page } from '@playwright/test';

import {
  configureLocalAchievementPolicy,
  disableLocalAchievementPolicy,
  getLocalSupabaseStatus,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

// The Member view deliberately excludes any count, ratio, or "N more needed" figure - only the
// earned and newly-earned states render, so the qualifying assertions below also prove no
// partial-progress hint appears anywhere on the surface.
const numericProgressPattern = /\d+\s*\/\s*\d+/;

test.beforeAll(async () => {
  await configureLocalAchievementPolicy();
});

test.afterAll(async () => {
  // The Achievement policy is a database-wide singleton that ships fail-closed (no policy row in
  // the seed). Restoring the dark state keeps every later suite in this shared local database
  // session rendering the same /account/achievements surface it would on a fresh stack.
  await disableLocalAchievementPolicy();
});

test('a real Favourite moves the private catalogue from locked to newly earned to acknowledged', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `achievements-${Date.now()}@example.invalid`;
  await signInMember(page, email);

  // 1. An account with no earned achievements gets a quiet empty state. The locked catalogue and
  // numeric progress hints stay out of the day-to-day experience.
  await page.goto('/en/account/achievements');
  await expect(page.getByRole('heading', { name: 'Your Achievements' })).toBeVisible();
  await expect(
    page.getByText('Your first achievement will appear here when you earn it.')
  ).toBeVisible();
  await expect(page.getByText('First Favourite')).toHaveCount(0);
  await expect(page.getByText('Not earned yet')).toHaveCount(0);
  await expect(page.getByText('New', { exact: true })).toHaveCount(0);
  const lockedText = await page.locator('main').innerText();
  expect(lockedText).not.toMatch(numericProgressPattern);

  // 2. Saving a Favourite through the real discovery UI unlocks First Favourite.
  await page.goto('/en?view=list&q=Published');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Save Published Place' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Published Place from saved places' })
  ).toBeVisible();

  // 3. The next catalogue view shows the one-time newly-earned marker with an earned date.
  await page.goto('/en/account/achievements');
  await expect(page.getByText('New', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Earned /)).toBeVisible();
  await expect(page.getByText('Not earned yet')).toHaveCount(0);
  const earnedText = await page.locator('main').innerText();
  expect(earnedText).not.toMatch(numericProgressPattern);

  // 4. The acknowledgment is consumed exactly once: a reload keeps the unlock earned but the
  // "new" marker never returns.
  await page.reload();
  await expect(page.getByText(/^Earned /)).toBeVisible();
  await expect(page.getByText('New', { exact: true })).toHaveCount(0);

  // 5. The account page links to the surface.
  await page.goto('/en/account');
  await page.getByRole('link', { name: 'My Achievements' }).click();
  await expect(page).toHaveURL('/en/account/achievements');
  await expect(page.getByRole('heading', { name: 'Your Achievements' })).toBeVisible();

  // Retire this member's Favourite of the shared published fixture Place.
  await page.goto('/en?view=list&q=Published');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Remove Published Place from saved places' }).click();
  await expect(page.getByRole('button', { name: 'Save Published Place' })).toBeVisible();
});

test('unauthenticated requests cannot reach or discover any Achievement state', async ({
  page,
  request
}) => {
  // The private route denies and redirects an unauthenticated request; it never renders.
  const achievementsPath = '/en/account/achievements';
  await page.goto(achievementsPath);
  await expect(page).toHaveURL(`/en/account?returnTo=${encodeURIComponent(achievementsPath)}`);
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByText('First Favourite')).toHaveCount(0);
  await expect(page.getByText('Not earned yet')).toHaveCount(0);

  // Neither Achievement RPC is reachable directly by an unauthenticated caller.
  const status = getLocalSupabaseStatus();
  const anonHeaders = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
    'Content-Type': 'application/json'
  };

  const catalogueResponse = await request.post(`${status.apiUrl}/rest/v1/rpc/get_my_achievements`, {
    headers: anonHeaders,
    data: {}
  });
  expect(catalogueResponse.ok()).toBe(false);
  expect([401, 403, 404]).toContain(catalogueResponse.status());

  const moderationResponse = await request.post(
    `${status.apiUrl}/rest/v1/rpc/get_moderation_member_achievements`,
    {
      headers: anonHeaders,
      data: { requested_member_id: '00000000-0000-4000-8000-000000000000' }
    }
  );
  expect(moderationResponse.ok()).toBe(false);
  expect([401, 403, 404]).toContain(moderationResponse.status());

  // The always-safe public feature-status boolean is readable, but discloses nothing beyond the
  // single enabled flag.
  const featureResponse = await request.post(
    `${status.apiUrl}/rest/v1/rpc/get_achievement_feature_status`,
    { headers: anonHeaders, data: {} }
  );
  expect(featureResponse.ok()).toBe(true);
  expect(await featureResponse.json()).toEqual([{ enabled: true }]);
});

test('the surface fails closed while the policy is dark', async ({ page }) => {
  await disableLocalAchievementPolicy();

  const email = `achievements-dark-${Date.now()}@example.invalid`;
  await signInMember(page, email);
  await page.goto('/en/account/achievements');
  await expect(page.getByRole('heading', { name: 'Your Achievements' })).toBeVisible();
  await expect(page.getByText('Achievements are not available yet.')).toBeVisible();
  // The catalogue never leaks through the disabled state - not even locked entry names.
  await expect(page.getByText('First Favourite')).toHaveCount(0);
  await expect(page.getByText('Not earned yet')).toHaveCount(0);
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
  await waitForHydration(page);
}
