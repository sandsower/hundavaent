import { expect, test, type Page } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalCheckIns,
  insertLocalCheckInBacklog,
  localPersonalHistoryFixtures,
  provisionLocalModerator,
  provisionLocalPersonalHistoryFixtures,
  publishLocalPersonalHistorySuccessor,
  retireLocalPersonalHistoryFixtures,
  setLocalPersonalHistoryGeometryQuarantined,
  transitionLocalPersonalHistorySuccessor,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const { favouriteOnly, mixed, predecessor, successor } = localPersonalHistoryFixtures;

async function completeEmailSignIn(page: Page, email: string): Promise<void> {
  await waitForHydration(page);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('Your link is on its way. Check your email.')).toBeVisible();
  await page.goto(await waitForLocalMagicLink(email));
  await waitForHydration(page);
}

test.beforeAll(() => {
  provisionLocalPersonalHistoryFixtures();
});

test.afterAll(() => {
  retireLocalPersonalHistoryFixtures();
  clearLocalCheckIns(favouriteOnly.placeId);
  clearLocalCheckIns(mixed.placeId);
});

test('a signed-out Visitor is invited to sign in and returns to the personal history route', async ({
  page
}) => {
  await page.goto('/en/history');
  await expect(page).toHaveURL(/\/en\/account\?/);
  const accountUrl = new URL(page.url());
  expect(accountUrl.searchParams.get('returnTo')).toBe('/en/history');

  const email = `history-return-${Date.now()}@example.invalid`;
  await completeEmailSignIn(page, email);
  await expect(page).toHaveURL('/en/history');
  await expect(page.getByRole('heading', { name: 'Visits', exact: true })).toBeVisible();
});

test('saved places and private visits stay distinct and synchronized on the map', async ({
  page
}) => {
  test.setTimeout(90_000);
  const email = `history-mixed-${Date.now()}@example.invalid`;
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(`/en?place=${favouriteOnly.placeId}&view=map`)}`
  );
  await completeEmailSignIn(page, email);

  // Favourite favouriteOnly (saved but never visited).
  await page.getByRole('button', { name: `Save ${favouriteOnly.nameEn}` }).click();
  await expect(
    page.getByRole('button', { name: `Remove ${favouriteOnly.nameEn} from saved places` })
  ).toBeVisible();

  // Favourite and check in to mixed (both saved and visited).
  await page.goto(`/en?place=${mixed.placeId}&view=map`);
  await waitForHydration(page);
  await page.getByRole('button', { name: `Save ${mixed.nameEn}` }).click();
  await expect(
    page.getByRole('button', { name: `Remove ${mixed.nameEn} from saved places` })
  ).toBeVisible();
  await page.getByRole('button', { name: `Check in at ${mixed.nameEn}` }).click();
  await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();

  const savedResponse = await page.goto('/en/saved');
  expect(savedResponse?.headers()['cache-control']).toBe('private, no-store');
  await expect(page.getByRole('heading', { name: favouriteOnly.nameEn })).toBeVisible();
  await expect(page.getByRole('heading', { name: mixed.nameEn })).toBeVisible();

  const cachedResponse = await page.goto('/en/history');
  expect(cachedResponse?.headers()['cache-control']).toBe('private, no-store');
  expect(cachedResponse?.headers().vary).toContain('cookie');
  await expect(page.getByRole('heading', { name: mixed.nameEn })).toBeVisible();
  await expect(page.getByRole('heading', { name: favouriteOnly.nameEn })).toHaveCount(0);
  await expect(page.getByText(/^Checked in /)).toBeVisible();

  await page.goto('/en/history?view=map');
  const marker = page.getByRole('button', { name: mixed.nameEn });
  await expect(marker).toBeVisible();
  await marker.click();
  const mapListEntry = page.getByRole('list', { name: 'Map' }).getByRole('button', {
    name: mixed.nameEn
  });
  await expect(mapListEntry).toHaveAttribute('aria-pressed', 'true');
});

test('another Member cannot see the first Member personal history', async ({ page }) => {
  const email = `history-privacy-${Date.now()}@example.invalid`;
  await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en/history`)}`);
  await completeEmailSignIn(page, email);
  await expect(page.getByRole('heading', { name: 'No visits yet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: favouriteOnly.nameEn })).toHaveCount(0);
});

test('an Inactive Place with a resolved successor is shown honestly without a silent substitution', async ({
  page
}) => {
  test.setTimeout(60_000);
  await provisionLocalModerator(evaluationModerator.email);
  const email = `history-successor-${Date.now()}@example.invalid`;
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(`/en?place=${predecessor.placeId}&view=map`)}`
  );
  await completeEmailSignIn(page, email);
  await page.getByRole('button', { name: `Save ${predecessor.nameEn}` }).click();
  await expect(
    page.getByRole('button', { name: `Remove ${predecessor.nameEn} from saved places` })
  ).toBeVisible();

  await transitionLocalPersonalHistorySuccessor(evaluationModerator.email);

  // Right after the transition the successor is still a Candidate (transition_place_identity
  // requires it), so it has no public profile: the private saved view names it without linking.
  await page.goto('/en/saved');
  await expect(page.getByRole('heading', { name: predecessor.nameEn })).toBeVisible();
  await expect(page.getByText('This place is no longer active', { exact: true })).toBeVisible();
  await expect(
    page.getByText(`This place is no longer active. It continued as ${successor.nameEn}.`)
  ).toBeVisible();
  await expect(page.getByRole('link', { name: `View ${successor.nameEn}` })).toHaveCount(0);

  // Once the successor is published (verified Access Condition chain), the same note gains a
  // real discovery deep link.
  publishLocalPersonalHistorySuccessor();
  await page.reload();
  await expect(
    page.getByText(`This place is no longer active. It continued as ${successor.nameEn}.`)
  ).toBeVisible();
  await expect(page.getByRole('link', { name: `View ${successor.nameEn}` })).toBeVisible();
});

test('a long Check-in history paginates by stable server-ordered keyset with no gap or duplicate', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `history-pagination-${Date.now()}@example.invalid`;
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(`/en?place=${favouriteOnly.placeId}&view=map`)}`
  );
  await completeEmailSignIn(page, email);
  await insertLocalCheckInBacklog(email, favouriteOnly.placeId, 30);

  await page.goto('/en/history');
  const firstPageHeadings = await page.getByRole('heading', { name: favouriteOnly.nameEn }).all();
  expect(firstPageHeadings).toHaveLength(24);
  const showMore = page.getByRole('link', { name: 'Show more' });
  await expect(showMore).toBeVisible();
  await showMore.click();
  // The "Show more" link is a normal SvelteKit-intercepted client-side navigation, so the click
  // resolves before the new page's data has finished loading; wait for the keyset cursor to land
  // in the URL before re-reading the DOM.
  await page.waitForURL(/before=/);

  const secondPageHeadings = await page.getByRole('heading', { name: favouriteOnly.nameEn }).all();
  expect(secondPageHeadings).toHaveLength(6);
  await expect(page.getByRole('link', { name: 'Show more' })).toHaveCount(0);
});

test('quarantined geometry preserves private history without exposing map coordinates', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `history-quarantine-${Date.now()}@example.invalid`;
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(`/en?place=${mixed.placeId}&view=map`)}`
  );
  await completeEmailSignIn(page, email);
  await page.getByRole('button', { name: `Save ${mixed.nameEn}` }).click();
  await page.getByRole('button', { name: `Check in at ${mixed.nameEn}` }).click();
  await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();

  setLocalPersonalHistoryGeometryQuarantined(mixed.placeId, true);
  try {
    const checkInResponse = await page.goto('/en/history');
    expect(checkInResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: mixed.nameEn })).toBeVisible();
    await expect(page.getByText('Temporarily unavailable in place discovery')).toBeVisible();

    const mapResponse = await page.goto('/en/history?view=map');
    expect(mapResponse?.ok()).toBe(true);
    await expect(
      page.getByRole('heading', { name: 'Nothing to show on the map yet' })
    ).toBeVisible();
    const mapList = page.getByRole('list', { name: 'Map' });
    await expect(mapList.getByText(mixed.nameEn)).toBeVisible();
    await expect(mapList.getByRole('button', { name: mixed.nameEn })).toHaveCount(0);
  } finally {
    setLocalPersonalHistoryGeometryQuarantined(mixed.placeId, false);
  }
});
