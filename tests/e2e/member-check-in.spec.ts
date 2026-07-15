import { expect, test, type Page } from '@playwright/test';

import { evaluationFixtureIds } from '../evaluation/fixtures';
import {
  clearLocalCheckIns,
  configureLocalCheckInPolicy,
  setLocalPlaceLifecycle,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const placeId = evaluationFixtureIds.places.published;
// Matches the seed.sql location for this fixture (Published Place, category park -> the 300m
// outdoor fallback radius applies since it has no boundary polygon).
const placeCoordinates = { latitude: 64.1423, longitude: -21.9555 };
const farCoordinates = { latitude: 64.1523, longitude: -21.9555 }; // roughly 1.1km north

async function completeEmailSignIn(page: Page, email: string): Promise<void> {
  await waitForHydration(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(dialog.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto(await waitForLocalMagicLink(email));
  await waitForHydration(page);
}

test.afterAll(() => {
  clearLocalCheckIns(placeId);
});

test('a signed-out Visitor can sign in from the header and returns to the same Place Profile', async ({
  page
}) => {
  const originPath = `/en?place=${placeId}&view=map`;
  await page.goto(originPath);
  await waitForHydration(page);

  await expect(
    page.getByRole('link', { name: 'Sign in to check in at Published Place' })
  ).toHaveCount(0);
  const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page).toHaveURL(originPath);
  await expect(page.getByRole('dialog')).toBeVisible();

  const email = `check-in-return-${Date.now()}@example.invalid`;
  await completeEmailSignIn(page, email);
  await expect(page).toHaveURL(originPath);
  await expect(page.getByRole('button', { name: 'Check in at Published Place' })).toBeVisible();
});

test('a Member records a private Check-in with no location permission and sees the result', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `check-in-basic-${Date.now()}@example.invalid`;
  await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
  await completeEmailSignIn(page, email);

  await expect(page.getByText(/This records that you visited right now/)).toBeVisible();
  await expect(page.getByText(/Check-ins are private\./)).toBeVisible();

  await page.getByRole('button', { name: 'Check in at Published Place' }).click();
  await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();
  await expect(page.getByText(/Recorded at/)).toBeVisible();
});

test('a duplicate Check-in within the window, including a rapid resubmission, is idempotent', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `check-in-duplicate-${Date.now()}@example.invalid`;
  await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
  await completeEmailSignIn(page, email);

  const checkInButton = page.getByRole('button', { name: 'Check in at Published Place' });
  await checkInButton.click();
  await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();

  // A rapid repeated submission straight at the API must return the same Check-in rather than a
  // second record: proven by the identical checkInId and the alreadyCheckedIn signal.
  const repeat = await page.evaluate(async (targetPlaceId) => {
    const response = await fetch(`/api/check-ins/${targetPlaceId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proximityDecision: 'unknown' })
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }, placeId);
  expect(repeat.status).toBe(200);
  expect(repeat.body.alreadyCheckedIn).toBe(true);

  // A reopened Place Profile shows the idempotent already-checked-in state directly, without
  // offering a second Check-in action.
  await page.reload();
  await waitForHydration(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'You already checked in here today.' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check in at Published Place' })).toHaveCount(0);
});

test('checking in again shows the already-checked-in copy in Icelandic', async ({ page }) => {
  test.setTimeout(60_000);
  const email = `check-in-is-${Date.now()}@example.invalid`;
  await page.goto(`/is/account?returnTo=${encodeURIComponent(`/is?place=${placeId}&view=map`)}`);
  // The Icelandic account page renders Icelandic form labels, so the shared English sign-in
  // helper does not apply here.
  await waitForHydration(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Netfang').fill(email);
  await dialog.getByRole('button', { name: 'Senda mér innskráningartengil' }).click();
  await expect(dialog.getByRole('heading', { name: 'Athugaðu tölvupóstinn' })).toBeVisible();
  await page.goto(await waitForLocalMagicLink(email));
  await waitForHydration(page);

  // The Icelandic Place Profile renders the fixture's Icelandic name.
  const checkInButton = page.getByRole('button', { name: 'Skrá heimsókn hjá Birtur staður' });
  await checkInButton.click();
  await expect(page.getByRole('status').filter({ hasText: 'Þú ert skráð(ur)' })).toBeVisible();

  await page.reload();
  await waitForHydration(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'Þú ert þegar skráð(ur) hér í dag.' })
  ).toBeVisible();
});

test('a Place that becomes Inactive mid-action rejects the Check-in with a recoverable message', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `check-in-inactive-${Date.now()}@example.invalid`;
  await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
  await completeEmailSignIn(page, email);

  setLocalPlaceLifecycle(placeId, 'inactive');
  try {
    await page.getByRole('button', { name: 'Check in at Published Place' }).click();
    await expect(
      page.getByRole('alert').filter({
        hasText: 'This place is no longer available, so the check-in could not be completed.'
      })
    ).toBeVisible();
  } finally {
    setLocalPlaceLifecycle(placeId, 'published');
  }
});

test.describe('optional one-time proximity assist (enabled only for this suite)', () => {
  test.beforeAll(async () => {
    await configureLocalCheckInPolicy(true);
  });

  test.afterAll(async () => {
    await configureLocalCheckInPolicy(false);
  });

  test('a granted, in-range mocked location confirms proximity and succeeds without a coordinate ever appearing in the request', async ({
    page,
    context
  }) => {
    test.setTimeout(60_000);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...placeCoordinates, accuracy: 15 });

    const email = `check-in-in-range-${Date.now()}@example.invalid`;
    await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
    await completeEmailSignIn(page, email);

    const capturedRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/check-ins/') && request.method() === 'POST') {
        capturedRequests.push(request.postData() ?? '');
      }
    });

    await expect(page.getByRole('button', { name: 'Use my location to confirm' })).toBeVisible();
    await page.getByRole('button', { name: 'Use my location to confirm' }).click();
    await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]).toBe(JSON.stringify({ proximityDecision: 'confirmed' }));
  });

  test('a granted, out-of-range mocked location still succeeds with no error shown', async ({
    page,
    context
  }) => {
    test.setTimeout(60_000);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...farCoordinates, accuracy: 15 });

    const email = `check-in-out-of-range-${Date.now()}@example.invalid`;
    await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
    await completeEmailSignIn(page, email);

    await page.getByRole('button', { name: 'Use my location to confirm' }).click();
    await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a low-accuracy mocked reading falls back to the no-location decision but still succeeds', async ({
    page,
    context
  }) => {
    test.setTimeout(60_000);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...placeCoordinates, accuracy: 500 });

    const email = `check-in-low-accuracy-${Date.now()}@example.invalid`;
    await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
    await completeEmailSignIn(page, email);

    const capturedRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/check-ins/') && request.method() === 'POST') {
        capturedRequests.push(request.postData() ?? '');
      }
    });

    await page.getByRole('button', { name: 'Use my location to confirm' }).click();
    await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();
    expect(capturedRequests[0]).toBe(JSON.stringify({ proximityDecision: 'unknown' }));
  });

  test('permission denial falls back to the no-location path immediately and is not asked again this session', async ({
    page,
    context
  }) => {
    test.setTimeout(60_000);
    // No grantPermissions() call: Playwright denies ungranted permissions by default.
    void context;

    const email = `check-in-denied-${Date.now()}@example.invalid`;
    await page.goto(`/en/account?returnTo=${encodeURIComponent(`/en?place=${placeId}&view=map`)}`);
    await completeEmailSignIn(page, email);

    await page.getByRole('button', { name: 'Use my location to confirm' }).click();
    await expect(page.getByText(/Location was not shared/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use my location to confirm' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Check in at Published Place' }).click();
    await expect(page.getByRole('status').filter({ hasText: "You're checked in" })).toBeVisible();

    // Reselecting the same Place profile in the same session must not offer the assist again.
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('button', { name: 'Use my location to confirm' })).toHaveCount(0);
  });
});
