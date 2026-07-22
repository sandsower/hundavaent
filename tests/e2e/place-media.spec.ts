import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  getLocalSupabaseStatus,
  provisionLocalModerator,
  setLocalPlaceLifecycle,
  waitForLocalMagicLink
} from './support/local-supabase';
import { fixturePngFile } from './support/fixture-image';
import { waitForHydration } from './support/hydration';

const moderatorEmail = 'place-media-moderator@example.invalid';
const candidate = {
  operatorName: 'Media e2e operator',
  category: 'cafe',
  nameIs: 'Myndaprófunarkaffihús',
  descriptionIs: 'Kaffihús búið til fyrir myndaprófun.',
  nameEn: 'Media Test Cafe',
  descriptionEn: 'A cafe created for Place media e2e coverage.',
  addressLine: 'Myndagata 31',
  locality: 'Reykjavík',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: '64.1481',
  longitude: '-21.9427',
  evidenceUrl: 'https://example.invalid/media-e2e/dog-access',
  evidenceSourceLabel: 'Official media e2e website',
  evidenceObservedAt: '2026-07-09T10:00'
} as const;

let placeId: string | null = null;
let evidenceObjectPath: string | null = null;

test.beforeAll(async () => {
  await provisionLocalModerator(moderatorEmail);
});

test.afterAll(() => {
  if (placeId) {
    setLocalPlaceLifecycle(placeId, 'inactive');
  }
});

test('a Moderator uploads Evidence and publishes a Photo in one step, and it renders publicly until retired', async ({
  page
}) => {
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fplaces%2Fnew');
  await page.locator('main').getByLabel('Email address').fill(moderatorEmail);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('The link has been sent.')).toBeVisible();

  const magicLink = await waitForLocalMagicLink(moderatorEmail);
  await page.goto(magicLink);
  await expect(page).toHaveURL('/en/moderation/places/new');

  await page.getByLabel('Operator').fill(candidate.operatorName);
  await page.getByLabel('Place type').selectOption(candidate.category);
  await page.getByLabel('Icelandic name').fill(candidate.nameIs);
  await page.getByLabel('Icelandic description').fill(candidate.descriptionIs);
  await page.getByLabel('English name').fill(candidate.nameEn);
  await page.getByLabel('English description').fill(candidate.descriptionEn);
  await page.getByText('Edit location details', { exact: true }).click();
  await expect(page.locator('.hundavaent-marker')).toBeVisible();
  await page.getByLabel('Address or area description').fill(candidate.addressLine);
  await page.getByLabel('Town or neighbourhood').fill(candidate.locality);
  await page.getByLabel('Postal code').fill(candidate.postalCode);
  await page.getByLabel('Municipality', { exact: true }).selectOption(candidate.municipality);
  await page.getByLabel('Latitude').fill(candidate.latitude);
  await page.getByLabel('Longitude').fill(candidate.longitude);
  await page.getByLabel('Geometry precision').selectOption('moderator_confirmed_point');
  await page.getByLabel('Geometry source').fill('End-to-end fixture point confirmed by Moderator.');
  await page.getByLabel('Evidence URL').fill(candidate.evidenceUrl);
  await page.getByLabel('Evidence source title').fill(candidate.evidenceSourceLabel);
  await page.getByLabel('Evidence observed at').fill(candidate.evidenceObservedAt);
  await page.getByLabel('Where dogs are allowed').selectOption('indoors');
  await page.getByLabel('Leash and restraint').selectOption('leash_required');
  await page.getByRole('button', { name: 'Save Candidate' }).click();

  const candidateId = await page.getByLabel('Candidate ID').textContent();
  expect(candidateId).toMatch(/^[0-9a-f-]{36}$/i);
  placeId = candidateId;

  await page.getByRole('link', { name: 'Review Place' }).click();
  await expect(page).toHaveURL(`/en/moderation/places/${candidateId}`);
  const mediaSection = page.locator('#candidate-media');
  await mediaSection.locator(':scope > summary').click();
  await expect(mediaSection).toHaveAttribute('open', '');

  // --- Evidence screenshot, uploaded while the Place is still a Candidate. ---
  const evidenceColumn = page.locator('[data-media-column="evidence"]');
  await evidenceColumn
    .getByLabel('Image (PNG, JPEG, or WebP, 15 MB maximum)')
    .setInputFiles(fixturePngFile('evidence.png', 60, 40));
  await evidenceColumn
    .getByLabel('Source URL')
    .fill('https://example.invalid/media-e2e/screenshot');
  await evidenceColumn.getByLabel('Capture time').fill('2026-07-12T09:00');
  await evidenceColumn.getByRole('button', { name: 'Upload Evidence' }).click();

  await expect(page.getByText('Media uploaded.')).toBeVisible();
  await expect(
    evidenceColumn.getByText('No Evidence screenshots have been registered.')
  ).toHaveCount(0);
  await expect(
    evidenceColumn.getByText('https://example.invalid/media-e2e/screenshot')
  ).toBeVisible();
  evidenceObjectPath = await evidenceColumn
    .locator('li[data-media-item]')
    .first()
    .getAttribute('data-storage-object-path');

  // --- Publish the Place through the existing checklist form. ---
  const publicationSection = page.locator('#publication-evidence');
  await publicationSection.locator('summary').click();
  await expect(publicationSection).toHaveAttribute('open', '');
  const conditionGroup = page.getByRole('group', { name: /Evidence supporting condition/ });
  await conditionGroup.getByLabel(candidate.evidenceSourceLabel).check();
  await page.getByRole('button', { name: 'Verify and publish' }).click();
  const publishDialog = page.getByRole('dialog', { name: 'Publish this Place?' });
  await expect(publishDialog).toBeVisible();
  await publishDialog.getByRole('button', { name: 'Verify and publish' }).click();
  await expect(page.getByText('The Place has been published.')).toBeVisible();

  // --- Photo, uploaded after publication. ---
  const photoColumn = page.locator('[data-media-column="photo"]');
  await photoColumn
    .getByLabel('Image (PNG, JPEG, or WebP, 15 MB maximum)')
    .setInputFiles(fixturePngFile('photo.png', 200, 150, { r: 60, g: 120, b: 200 }));
  await photoColumn.getByLabel('People shown in the photo').selectOption('no_prominent_people');
  await photoColumn.getByRole('button', { name: 'Upload and publish' }).click();
  await expect(page.getByText('Photo approved and published.')).toBeVisible();

  const photoItem = photoColumn.locator('li[data-media-item]').first();
  await expect(photoItem.getByText('Approved')).toBeVisible();

  // --- The approved Photo renders on the public Place Profile. ---
  await page.goto(`/en?place=${candidateId}`);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selectedPlace).toBeVisible();
  const publicPhoto = selectedPlace.getByAltText('Photo of Media Test Cafe');
  await expect(publicPhoto).toBeVisible();
  await expect(selectedPlace.getByText('Photo: Hundavænt')).toBeVisible();
  expect(await publicPhoto.getAttribute('width')).toBe('200');
  expect(await publicPhoto.getAttribute('height')).toBe('150');
  // The image bytes must actually arrive: a Content-Security-Policy or signed-URL regression
  // leaves the <img> element in place (alt text and all) while the fetch is silently blocked.
  await expect
    .poll(async () => publicPhoto.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const seriousAccessibilityViolations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious'
  );
  expect(seriousAccessibilityViolations).toEqual([]);

  // --- Retiring the Photo removes it from the public profile immediately. ---
  await page.goto(`/en/moderation/places/${candidateId}`);
  await waitForHydration(page);
  await mediaSection.locator(':scope > summary').click();
  await expect(mediaSection).toHaveAttribute('open', '');
  const retirePhotoItem = page.locator('[data-media-column="photo"] li[data-media-item]').first();
  await retirePhotoItem.getByRole('button', { name: 'Retire' }).click();
  await expect(page.getByText('Media retired.')).toBeVisible();
  await expect(retirePhotoItem.getByText('Retired')).toBeVisible();
  await expect(retirePhotoItem.getByRole('button', { name: 'Retire' })).toHaveCount(0);

  await page.goto(`/en?place=${candidateId}`);
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
  await expect(page.getByAltText('Photo of Media Test Cafe')).toHaveCount(0);
});

test('an anonymous caller cannot register Place media', async ({ request }) => {
  const status = getLocalSupabaseStatus();
  const response = await request.post(`${status.apiUrl}/rest/v1/rpc/register_place_media`, {
    headers: {
      apikey: status.publishableKey,
      Authorization: `Bearer ${status.publishableKey}`,
      'Content-Type': 'application/json'
    },
    data: {
      command_payload: {
        place_id: placeId ?? '00000000-0000-4000-8000-000000000000',
        kind: 'photo',
        storage_object_path: 'anonymous-attempt.jpg',
        mime_type: 'image/jpeg',
        byte_size: 1024,
        width_px: 100,
        height_px: 100
      },
      command_request_id: '89100000-0000-4000-8000-000000000001'
    }
  });

  expect(response.ok()).toBe(false);
  expect([400, 401, 403, 404]).toContain(response.status());
});

test('an anonymous caller cannot read an Evidence Storage object', async ({ request }) => {
  test.skip(!evidenceObjectPath, 'Evidence object path was not captured by the upload test');
  const status = getLocalSupabaseStatus();
  const response = await request.get(
    `${status.apiUrl}/storage/v1/object/authenticated/place-evidence/${evidenceObjectPath}`,
    {
      headers: {
        apikey: status.publishableKey,
        Authorization: `Bearer ${status.publishableKey}`
      }
    }
  );

  expect(response.ok()).toBe(false);
  expect([400, 401, 403, 404]).toContain(response.status());
});

test('an anonymous caller cannot read an unapproved Photo Storage object', async ({ request }) => {
  const status = getLocalSupabaseStatus();
  const response = await request.get(
    `${status.apiUrl}/storage/v1/object/authenticated/place-photos/${placeId ?? 'unknown'}/never-approved.jpg`,
    {
      headers: {
        apikey: status.publishableKey,
        Authorization: `Bearer ${status.publishableKey}`
      }
    }
  );

  expect(response.ok()).toBe(false);
  expect([400, 401, 403, 404]).toContain(response.status());
});
