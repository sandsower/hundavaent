import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database } from '$server/db/generated.types';

import { evaluationCandidateInput as candidate, evaluationModerator } from '../evaluation/fixtures';
import {
  getLocalSupabaseStatus,
  provisionLocalModerator,
  waitForLocalMagicLink
} from './support/local-supabase';

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
});

test('a Moderator creates a private Candidate through the full application', async ({ page }) => {
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fplaces%2Fnew');
  await page.getByLabel('Email address').fill(evaluationModerator.email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('The link has been sent.')).toBeVisible();

  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL('/en/moderation/places/new');

  await page.getByLabel('Operator').fill(candidate.operatorName);
  await page.getByLabel('Place type').selectOption(candidate.category);
  await page.getByLabel('Icelandic name').fill(candidate.nameIs);
  await page.getByLabel('Icelandic description').fill(candidate.descriptionIs);
  await page.getByLabel('English name').fill(candidate.nameEn);
  await page.getByLabel('English description').fill(candidate.descriptionEn);
  await page.getByLabel('Address or area description').fill(candidate.addressLine);
  await page.getByLabel('Town or neighbourhood').fill(candidate.locality);
  await page.getByLabel('Postal code').fill(candidate.postalCode);
  await page.getByLabel('Municipality').selectOption(candidate.municipality);
  await page.getByLabel('Latitude').fill(candidate.latitude);
  await page.getByLabel('Longitude').fill(candidate.longitude);
  await page.getByLabel('Geometry precision').selectOption('moderator_confirmed_point');
  await page.getByLabel('Geometry source').fill('End-to-end fixture point confirmed by Moderator.');
  await page.getByLabel('Evidence URL').fill(candidate.evidenceUrl);
  await page.getByLabel('Evidence source title').fill(candidate.evidenceSourceLabel);
  await page.getByLabel('Evidence observed at').fill(candidate.evidenceObservedAt);
  await page.getByRole('button', { name: 'Save Candidate' }).click();

  await expect(page.getByText('The Candidate has been saved.')).toBeVisible();
  const candidateId = await page.getByLabel('Candidate ID').textContent();
  expect(candidateId).toMatch(/^[0-9a-f-]{36}$/i);

  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await publicClient.rpc('list_published_places', {
    requested_locale: 'en'
  });

  expect(error).toBeNull();
  expect(data?.some((place) => place.place_id === candidateId)).toBe(false);

  const response = await page.goto(`/en/places/${candidateId}`);
  expect(response?.status()).toBe(404);
});
