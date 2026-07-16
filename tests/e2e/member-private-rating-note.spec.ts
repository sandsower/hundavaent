import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import type { Database } from '$server/db/generated.types';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  configureLocalPlaceFlagAbusePolicy,
  configureLocalPrivateRatingNotePolicy,
  disableLocalPrivateRatingNotePolicy,
  getLocalSupabaseStatus,
  localPrivateRatingNoteFixture,
  provisionLocalModerator,
  provisionLocalPrivateRatingNoteFixture,
  retireLocalPrivateRatingNoteFixture,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const { placeId } = localPrivateRatingNoteFixture;

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  provisionLocalPrivateRatingNoteFixture();
  // The fixture threshold below (2) and the abuse policy are only ever reachable through these
  // explicit service-role configuration calls, never a code path production reaches by default.
  await configureLocalPrivateRatingNotePolicy();
  await configureLocalPlaceFlagAbusePolicy();
});

test.afterAll(async () => {
  await disableLocalPrivateRatingNotePolicy();
  // The fixture Place is published (see local-supabase.ts), so it stays visible in public
  // discovery for the rest of the local database session unless explicitly retired.
  retireLocalPrivateRatingNoteFixture();
});

test('a Member autosaves an optional note with a low inline Rating and is never offered a Report path', async ({
  page
}) => {
  const memberEmail = `rating-note-subjective-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const note = 'The welcome felt lukewarm, purely a matter of taste.';
  await saveInlineRatingWithNote(page, 2, note, { comfort: 3, thoughtfulness: 3 });
  await expect(page.getByText('Send a formal Report?')).toHaveCount(0);

  await page.reload();
  await waitForHydration(page);
  const rating = page.locator('[data-inline-rating]');
  await rating
    .getByRole('radiogroup', { name: 'Overall rating' })
    .getByRole('radio', { name: '2 stars' })
    .click();
  await expect(rating.getByRole('textbox')).toHaveValue(note);
  await expect(page.getByText('Send a formal Report?')).toHaveCount(0);
});

test('a low-score inline note stays private and does not implicitly create a linked Report', async ({
  page,
  browser
}) => {
  const memberEmail = `rating-note-inaccurate-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const note = 'The posted opening hours do not match what staff told me on arrival.';
  await saveInlineRatingWithNote(page, 1, note);
  await expect(page.getByText('Send a formal Report?')).toHaveCount(0);

  const status = getLocalSupabaseStatus();
  const admin = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const memberId = users?.users.find((candidate) => candidate.email === memberEmail)?.id;
  if (!memberId) throw new Error('Could not identify the Member for the moderation step');

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(`/en/moderation/dog-friendliness/${placeId}`);
  await waitForHydration(moderatorPage);

  const memberRow = moderatorPage.locator('li[data-rating-id]', { hasText: memberId });
  await expect(memberRow.getByText('Private Rating Note')).toBeVisible();
  // Scoped to the current-note paragraph specifically: the note-history disclosure below also
  // retains the same text in its submitted snapshot, by design.
  await expect(memberRow.locator('.note-text')).toHaveText(note);
  await expect(memberRow.getByRole('link', { name: 'View Report' })).toHaveCount(0);

  // A Moderator can record a feedback-use decision from the same note-augmented queue surface.
  await memberRow.getByLabel('Decision kind').selectOption('feedback_use_permitted');
  await memberRow
    .getByLabel('Moderator notes')
    .fill(
      'Aggregated feedback about opening-hours accuracy may be shared once feedback-sharing ships.'
    );
  await memberRow.getByRole('button', { name: 'Record decision' }).click();
  await expect(moderatorPage.getByText('The decision has been recorded.')).toBeVisible();

  await moderatorContext.close();
});

test('a Moderator excludes a noted Rating for abuse, reusing the existing eligibility RPC unchanged', async ({
  page,
  browser
}) => {
  const memberEmail = `rating-note-abuse-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const note = 'A loose dog nearly reached the street.';
  await saveInlineRatingWithNote(page, 1, note, {
    welcome: 1,
    clarity: 1,
    comfort: 1,
    thoughtfulness: 1
  });
  await expect(page.getByText('Send a formal Report?')).toHaveCount(0);

  const status = getLocalSupabaseStatus();
  const admin = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const memberId = users?.users.find((candidate) => candidate.email === memberEmail)?.id;
  if (!memberId) throw new Error('Could not identify the Member for the moderation step');

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(`/en/moderation/dog-friendliness/${placeId}`);
  await waitForHydration(moderatorPage);

  const memberRow = moderatorPage.locator('li[data-rating-id]', { hasText: memberId });
  await expect(memberRow.locator('.note-text')).toHaveText(note);

  await memberRow.getByLabel('Exclusion reason').selectOption('abuse');
  await memberRow
    .getByLabel('Reason', { exact: true })
    .fill('Coordinated low-quality note activity suspected.');
  await memberRow.getByRole('button', { name: 'Exclude' }).click();
  await expect(memberRow.getByText('Excluded', { exact: true })).toBeVisible();

  // Eligibility exclusion never clears the note itself: low quality alone is not redaction.
  await expect(memberRow.locator('.note-text')).toHaveText(note);

  await moderatorContext.close();
});

test('a Visitor cannot attach a Private Rating Note or read the Moderator note queue', async ({
  page
}) => {
  const status = getLocalSupabaseStatus();
  const anonHeaders = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
    'Content-Type': 'application/json'
  };
  const submitResponse = await page.request.post(
    `${status.apiUrl}/rest/v1/rpc/submit_dog_friendliness_rating`,
    {
      headers: anonHeaders,
      data: {
        requested_place_id: placeId,
        requested_welcome_score: 1,
        requested_clarity_score: null,
        requested_comfort_score: null,
        requested_thoughtfulness_score: null,
        command_request_id: '00000000-0000-4000-8000-000000000001',
        requested_update_private_note: true,
        requested_private_note: 'Attempted visitor note.',
        requested_private_note_classification: 'subjective'
      }
    }
  );
  expect(submitResponse.ok()).toBe(false);

  const moderationPath = `/en/moderation/dog-friendliness/${placeId}`;
  await page.goto(moderationPath);
  await expect(page).toHaveURL(
    `/en/moderation/sign-in?returnTo=${encodeURIComponent(moderationPath)}`
  );
});

async function saveInlineRatingWithNote(
  page: Page,
  overall: number,
  note: string,
  categories: Partial<Record<'welcome' | 'clarity' | 'comfort' | 'thoughtfulness', number>> = {}
): Promise<void> {
  await page.goto(`/en?place=${placeId}`);
  await waitForHydration(page);
  const rating = page.locator('[data-inline-rating]');
  await rating
    .getByRole('radiogroup', { name: 'Overall rating' })
    .getByRole('radio', { name: `${overall} ${overall === 1 ? 'star' : 'stars'}` })
    .click();
  for (const [category, score] of Object.entries(categories)) {
    const label = category[0]?.toUpperCase() + category.slice(1);
    await rating
      .getByRole('radiogroup', { name: label })
      .getByRole('radio', { name: `${score} ${score === 1 ? 'star' : 'stars'}` })
      .click();
  }
  const noteInput = rating.getByRole('textbox', { name: 'What could be better? (optional)' });
  await expect(noteInput).toBeVisible();
  await noteInput.fill(note);
  await noteInput.blur();
  await expect(rating.getByText('Saving Rating…')).toBeVisible();
  await expect(rating.getByText('Saved')).toBeVisible();
}

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
