import { expect, test, type Page } from '@playwright/test';

import { evaluationFixtureIds } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  setLocalPlaceLifecycle,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const placeId = evaluationFixtureIds.places.published;

async function completeEmailSignIn(page: Page, email: string): Promise<void> {
  await waitForHydration(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(dialog.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto(await waitForLocalMagicLink(email));
  // The magic-link redirect lands on a freshly server-rendered page. Waiting for it to finish
  // hydrating keeps callers from interacting (or navigating away) before Svelte has attached
  // event handlers -- otherwise a click can silently no-op, and SvelteKit's own hydration-time
  // history.replaceState() can race a caller's very next page.goto(), which Playwright then
  // reports as that goto being "interrupted by another navigation".
  await waitForHydration(page);
}

test('Favorites stay private and synchronize across authentication, views, tabs, and sessions', async ({
  browser,
  context,
  page
}) => {
  test.setTimeout(60_000);
  const email = `favourite-${Date.now()}@example.invalid`;
  const originPath =
    '/en?lat=64.12&lng=-21.91&z=11&view=list&q=Published&category=outdoors&area=Reykjav%C3%ADk#favourite-origin';

  await page.goto(originPath);
  await waitForHydration(page);
  const resultSignIn = page.getByRole('link', {
    name: 'Sign in to add Published Place to favorites'
  });
  await expect(resultSignIn).toBeVisible();
  await resultSignIn.click();
  await expect(page).toHaveURL(originPath);
  await expect(
    page.getByRole('dialog', { name: 'Add Published Place to your favorites' })
  ).toBeVisible();
  const expectedReturn = new URL(originPath, 'http://localhost');

  await completeEmailSignIn(page, email);
  await expect
    .poll(() => {
      const current = new URL(page.url());
      return `${current.pathname}${current.search}${current.hash}`;
    })
    .toBe(`${expectedReturn.pathname}${expectedReturn.search}${expectedReturn.hash}`);
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByLabel('Selected place')).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const response = await fetch('/api/favourites');
      return response.json() as Promise<{ placeIds: string[] }>;
    })
  ).toEqual({ placeIds: [placeId] });

  await expect(
    page.getByRole('button', { name: 'Remove Published Place from favorites' })
  ).toBeVisible();
  await expect(page).not.toHaveURL(/favourite=/);
  await expect(page).toHaveURL(/view=list/);
  await expect(page).toHaveURL(/q=Published/);
  await expect(page).toHaveURL(/category=outdoors/);
  await expect(page).toHaveURL(/#favourite-origin$/);

  const otherTab = await context.newPage();
  await otherTab.goto(`/en?place=${placeId}&view=map`);
  await expect(
    otherTab.getByRole('button', { name: 'Remove Published Place from favorites' })
  ).toBeVisible();
  // The assertion above is satisfied by the server-rendered HTML alone, but the cross-tab
  // favourite invalidation below travels over a BroadcastChannel this tab only subscribes to
  // during onMount. On a runner slower than a local machine (CI run 29171565386 failed the very
  // next assertion on all three attempts) the acting tab's click, PUT, and broadcast all complete
  // before this tab finishes hydrating, and the one-shot message is gone for good. Waiting for
  // hydration first guarantees the listener exists before anything is published.
  await waitForHydration(otherTab);
  const otherTabSelectedPlace = otherTab.getByRole('complementary', { name: 'Selected place' });

  await page.getByRole('button', { name: 'Remove Published Place from favorites' }).click();
  // Cross-tab convergence is a multi-hop round trip (the acting tab's PUT, a broadcast, this
  // tab's own GET and re-render), so it gets headroom beyond the suite's 5s assertion default.
  await expect(
    otherTabSelectedPlace.getByRole('button', { name: 'Add Published Place to favorites' })
  ).toBeVisible({
    timeout: 15_000
  });

  await page.getByRole('button', { name: 'Add Published Place to favorites' }).click();
  await expect(
    otherTabSelectedPlace.getByRole('button', {
      name: 'Remove Published Place from favorites'
    })
  ).toBeVisible({ timeout: 15_000 });

  const savedResponse = await otherTab.goto('/en/favorites');
  expect(savedResponse?.headers()['cache-control']).toBe('private, no-store');
  expect(savedResponse?.headers().vary).toContain('cookie');
  await expect(otherTab.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(otherTab.getByRole('heading', { name: 'Published Place' })).toBeVisible();
  // Same reasoning as above: the saved-places page also subscribes during onMount, and its
  // remove button below must not be clicked until hydration has attached the event handler.
  await waitForHydration(otherTab);

  await page.getByRole('button', { name: 'Remove Published Place from favorites' }).click();
  await expect(otherTab.getByRole('heading', { name: 'No favorites yet' })).toBeVisible({
    timeout: 15_000
  });

  await page.getByRole('button', { name: 'Add Published Place to favorites' }).click();
  await expect(otherTab.getByRole('heading', { name: 'Published Place' })).toBeVisible({
    timeout: 15_000
  });

  await otherTab.getByRole('button', { name: 'Remove Published Place from favorites' }).click();
  await expect(page.getByRole('button', { name: 'Add Published Place to favorites' })).toBeVisible({
    timeout: 15_000
  });

  await page.getByRole('button', { name: 'Add Published Place to favorites' }).click();
  await expect(otherTab.getByRole('heading', { name: 'Published Place' })).toBeVisible({
    timeout: 15_000
  });

  const visitor = await browser.newContext();
  // Relative so the request follows the configured baseURL instead of a hardcoded port.
  const visitorResponse = await visitor.request.get('/api/favourites');
  expect(visitorResponse.status()).toBe(401);
  const visitorPage = await visitor.newPage();
  await visitorPage.goto('/en/favorites');
  await expect(visitorPage).toHaveURL(
    `/en?auth=open&authReturnTo=${encodeURIComponent('/en/favorites')}`
  );
  await expect(visitorPage.getByRole('dialog')).toBeVisible();
  await visitor.close();

  await page.goto('/en/account?returnTo=%2Fen%2Ffavorites');
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('dialog', { name: 'Continue with Hundavænt' })).toBeVisible();
  await clearLocalEvaluationMailbox();
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  await completeEmailSignIn(page, email);
  await expect(page).toHaveURL('/en/favorites');
  await expect(page.getByRole('heading', { name: 'Published Place' })).toBeVisible();
});

test('an Inactive saved Place stays recognizable and removable without exposing moderation detail', async ({
  page
}) => {
  const email = `inactive-favourite-${Date.now()}@example.invalid`;
  await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
  await completeEmailSignIn(page, email);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });
  await selectedPlace.getByRole('button', { name: 'Add Published Place to favorites' }).click();
  await expect(
    selectedPlace.getByRole('button', { name: 'Remove Published Place from favorites' })
  ).toBeVisible();

  setLocalPlaceLifecycle(placeId, 'inactive');
  try {
    await page.goto('/en/favorites');
    await expect(page.getByRole('heading', { name: 'Published Place' })).toBeVisible();
    await expect(page.getByText('This place is no longer active')).toBeVisible();
    await expect(page.getByText('Private moderation details are not shown.')).toBeVisible();
    // The remove button's click handler only exists after hydration; clicking the
    // server-rendered button early would silently do nothing.
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Remove Published Place from favorites' }).click();
    await expect(page.getByRole('heading', { name: 'No favorites yet' })).toBeVisible();
  } finally {
    setLocalPlaceLifecycle(placeId, 'published');
  }
});
