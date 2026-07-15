import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import type { Database } from '$server/db/generated.types';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  configureLocalDogFriendlinessSummaryPolicy,
  disableLocalDogFriendlinessSummaryPolicy,
  getLocalSupabaseStatus,
  grantLocalVenueRepresentativeRole,
  localDogFriendlinessFixture,
  provisionLocalDogFriendlinessFixture,
  provisionLocalModerator,
  retireLocalDogFriendlinessFixture,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const { placeId } = localDogFriendlinessFixture;

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  provisionLocalDogFriendlinessFixture();
  // The fixture threshold below (2) is only ever reachable through this explicit service-role
  // policy configuration call, never a code path production reaches by default.
  await configureLocalDogFriendlinessSummaryPolicy();
});

test.afterAll(async () => {
  await disableLocalDogFriendlinessSummaryPolicy();
  // The fixture Place is published (see local-supabase.ts), so it stays visible in public
  // discovery for the rest of the local database session, including every e2e spec that runs
  // after this file and a11y/visual runs against the same persistent local Supabase instance.
  retireLocalDogFriendlinessFixture();
});

test('a Member rates a Place, updates the Rating, and the public Summary crosses the eligibility threshold', async ({
  page,
  browser
}) => {
  const memberAEmail = `dog-friendliness-a-${Date.now()}@example.invalid`;
  const memberBEmail = `dog-friendliness-b-${Date.now()}@example.invalid`;
  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Below threshold before any Rating exists: the public Summary leaks no counts or values.
  const initialSummary = await publicClient.rpc('get_dog_friendliness_summary', {
    requested_place_id: placeId
  });
  expect(initialSummary.data?.[0]?.summary_visible).toBe(false);
  expect(initialSummary.data?.[0]?.eligible_count).toBeNull();

  await signInMember(page, memberAEmail);
  await submitRating(page, {
    overall: '4',
    welcome: '3',
    clarity: 'na',
    comfort: '5',
    thoughtfulness: '4'
  });
  await expect(page).toHaveURL(`/en?place=${placeId}`);

  // One eligible Rating still leaves the Place below the configured threshold of two.
  const belowThreshold = await publicClient.rpc('get_dog_friendliness_summary', {
    requested_place_id: placeId
  });
  expect(belowThreshold.data?.[0]?.summary_visible).toBe(false);

  const memberBContext = await browser.newContext();
  const memberBPage = await memberBContext.newPage();
  await signInMember(memberBPage, memberBEmail);
  await submitRating(memberBPage, {
    overall: '3',
    welcome: '4',
    clarity: '5',
    comfort: '3',
    thoughtfulness: '2'
  });
  await memberBContext.close();

  // Two eligible Ratings meet the fixture threshold: the Summary becomes publicly visible with
  // an eligible count, per-Dimension results (Clarity is below its own per-Dimension threshold
  // because only Member B scored it, so it is absent), and an overall result.
  await expect(async () => {
    const summary = await publicClient.rpc('get_dog_friendliness_summary', {
      requested_place_id: placeId
    });
    expect(summary.data?.[0]?.summary_visible).toBe(true);
    expect(summary.data?.[0]?.eligible_count).toBe(2);
    const dimensionNames = (summary.data?.[0]?.dimensions as Array<{ dimension: string }>).map(
      (dimension) => dimension.dimension
    );
    expect(dimensionNames).toContain('welcome');
    expect(dimensionNames).not.toContain('clarity');
  }).toPass();

  // Re-submitting with a new request updates the current Rating in place rather than
  // double-counting: the eligible count stays two.
  await submitRating(page, {
    overall: '2',
    welcome: '2',
    clarity: 'na',
    comfort: '5',
    thoughtfulness: '4'
  });
  await expect(page).toHaveURL(`/en?place=${placeId}`);
  const afterUpdate = await publicClient.rpc('get_dog_friendliness_summary', {
    requested_place_id: placeId
  });
  expect(afterUpdate.data?.[0]?.eligible_count).toBe(2);

  // Member A's inline Rating reflects the latest autosaved values on revisit.
  await page.goto(`/en/places/${placeId}/rate`);
  await waitForHydration(page);
  await expect(page).toHaveURL(`/en?place=${placeId}`);
  const inlineRating = page.locator('[data-inline-rating]');
  await expect(
    inlineRating
      .getByRole('radiogroup', { name: 'Overall rating' })
      .getByRole('radio', { name: '2 stars' })
  ).toHaveAttribute('aria-checked', 'true');

  const admin = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const memberAId = users?.users.find((candidate) => candidate.email === memberAEmail)?.id;
  if (!memberAId) throw new Error('Could not identify Member A for the moderation step');

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(`/en/moderation/dog-friendliness/${placeId}`);
  await waitForHydration(moderatorPage);

  // Both Members' Ratings are listed for this Place; scope every locator to Member A's own row
  // so a status change on Member B's untouched row can never be mistaken for Member A's.
  const memberARow = moderatorPage.locator('li[data-rating-id]', { hasText: memberAId });
  await memberARow.getByLabel('Exclusion reason').selectOption('fraud');
  await memberARow
    .getByLabel('Reason', { exact: true })
    .fill('Duplicate account signal for e2e proof.');
  await memberARow.getByRole('button', { name: 'Exclude' }).click();
  await expect(memberARow.getByText('Excluded', { exact: true })).toBeVisible();

  // Excluding one eligible Rating immediately drops the Place back below threshold: the Summary
  // hides on the very next public read, proving there is nothing cached to invalidate.
  const afterExclusion = await publicClient.rpc('get_dog_friendliness_summary', {
    requested_place_id: placeId
  });
  expect(afterExclusion.data?.[0]?.summary_visible).toBe(false);

  await memberARow.getByLabel('Reason', { exact: true }).fill('Investigation cleared the account.');
  await memberARow.getByRole('button', { name: 'Reinstate' }).click();
  await expect(memberARow.getByText('Eligible', { exact: true })).toBeVisible();

  const afterReinstatement = await publicClient.rpc('get_dog_friendliness_summary', {
    requested_place_id: placeId
  });
  expect(afterReinstatement.data?.[0]?.summary_visible).toBe(true);
  expect(afterReinstatement.data?.[0]?.eligible_count).toBe(2);

  // A Venue Representative status (even layered onto an existing signed-in Member) never grants
  // access to the Moderator-only exclusion/reinstatement workspace: the shared moderation layout
  // guard treats this as an authenticated-but-unauthorized request (403), distinct from the
  // redirect-to-sign-in an unauthenticated Visitor receives.
  await grantLocalVenueRepresentativeRole(memberBEmail);
  await clearLocalEvaluationMailbox();
  const venueRepContext = await browser.newContext();
  const venueRepPage = await venueRepContext.newPage();
  await signInMember(venueRepPage, memberBEmail);
  const moderationResponse = await venueRepPage.goto(`/en/moderation/dog-friendliness/${placeId}`);
  expect(moderationResponse?.status()).toBe(403);
  await expect(venueRepPage.getByText('403', { exact: true })).toBeVisible();
  await expect(venueRepPage.getByRole('button', { name: 'Exclude' })).toHaveCount(0);
  await venueRepContext.close();

  await moderatorContext.close();
});

test('a Visitor cannot reach the Rating form or the Moderator exclusion workspace', async ({
  page
}) => {
  const ratePath = `/en/places/${placeId}/rate`;
  await page.goto(ratePath);
  await expect(page).toHaveURL(`/en?place=${placeId}`);
  await waitForHydration(page);
  await page.locator('[data-inline-rating]').getByRole('radio', { name: '4 stars' }).click();
  await expect(page.getByRole('dialog').getByLabel('Email address')).toBeVisible();

  const moderationPath = `/en/moderation/dog-friendliness/${placeId}`;
  await page.goto(moderationPath);
  await expect(page).toHaveURL(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(moderationPath)}`
  );
  await expect(page.getByRole('heading', { name: 'Moderator sign-in' })).toBeVisible();

  const status = getLocalSupabaseStatus();
  const anonHeaders = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
    'Content-Type': 'application/json'
  };
  const submitResponse = await page.request.post(
    `${status.apiUrl}/rest/v1/rpc/save_inline_dog_friendliness_rating`,
    {
      headers: anonHeaders,
      data: {
        requested_place_id: placeId,
        requested_overall_score: 5,
        requested_welcome_score: 5,
        requested_clarity_score: null,
        requested_comfort_score: null,
        requested_thoughtfulness_score: null,
        command_request_id: '00000000-0000-4000-8000-000000000000'
      }
    }
  );
  expect(submitResponse.ok()).toBe(false);
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
  // The shared Moderator email is reused by other e2e/a11y/visual specs; starting from an empty
  // mailbox keeps waitForLocalMagicLink from matching a stale sign-in link left over from an
  // earlier run.
  await clearLocalEvaluationMailbox();
  await page.goto(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(`/en/moderation/dog-friendliness/${placeId}`)}`
  );
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
}

async function submitRating(
  page: Page,
  scores: {
    overall: string;
    welcome: string;
    clarity: string;
    comfort: string;
    thoughtfulness: string;
  }
): Promise<void> {
  await page.goto(`/en?place=${placeId}`);
  await waitForHydration(page);
  const rating = page.locator('[data-inline-rating]');
  await rating
    .getByRole('radiogroup', { name: 'Overall rating' })
    .getByRole('radio', { name: `${scores.overall} stars` })
    .click();
  for (const [label, value] of [
    ['Welcome', scores.welcome],
    ['Clarity', scores.clarity],
    ['Comfort', scores.comfort],
    ['Thoughtfulness', scores.thoughtfulness]
  ] as const) {
    if (value === 'na') continue;
    await rating
      .getByRole('radiogroup', { name: label })
      .getByRole('radio', { name: `${value} stars` })
      .click();
  }
  await expect(rating.getByText('Saved')).toBeVisible();
}
