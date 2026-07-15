import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import type { Database } from '$server/db/generated.types';

import {
  evaluationPublicationCandidateInput as candidate,
  evaluationPublisher
} from '../evaluation/fixtures';
import {
  getLocalPublicationAudit,
  getLocalSupabaseStatus,
  openEveryLocalAccessDispute,
  proveLocalInactivitySerialization,
  proveLocalReconfirmationSchedulerSerialization,
  provisionLocalModerator,
  resolveEveryLocalAccessDispute,
  waitForLocalMagicLink
} from './support/local-supabase';

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationPublisher.email);
});

test('a Moderator verifies and publishes a Candidate through the full application', async ({
  page
}) => {
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fplaces%2Fnew');
  await page.locator('main').getByLabel('Email address').fill(evaluationPublisher.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('The link has been sent.')).toBeVisible();

  const magicLink = await waitForLocalMagicLink(evaluationPublisher.email);
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
  await page.getByRole('button', { name: 'Add another Evidence source' }).click();
  await page.getByLabel('Evidence type').nth(1).selectOption('public_record');
  await page.getByLabel('Evidence citation').nth(1).fill('Municipal rule 4');
  await page.getByLabel('Evidence source title').nth(1).fill('Supporting public record');
  await page.getByLabel('Evidence observed at').nth(1).fill(candidate.evidenceObservedAt);
  await page.getByRole('button', { name: 'Add another Evidence source' }).click();
  await page.getByLabel('Evidence type').nth(2).selectOption('member_report');
  await page.getByLabel('Evidence URL').nth(2).fill('https://example.invalid/contradiction');
  await page.getByLabel('Evidence source title').nth(2).fill('Contradictory member report');
  await page.getByLabel('Evidence observed at').nth(2).fill(candidate.evidenceObservedAt);
  await page.getByLabel('Where dogs are allowed').nth(0).selectOption('indoors');
  await page.getByLabel('Leash and restraint').nth(0).selectOption('carrier_required');
  await page.getByRole('button', { name: 'Add another condition' }).click();
  await page.getByLabel('Where dogs are allowed').nth(1).selectOption('indoors');
  await page.getByLabel('Leash and restraint').nth(1).selectOption('carrier_required');
  await page.getByLabel('Maximum weight, kg (inclusive)').nth(1).fill('10');
  await page.getByLabel('Ends at').nth(1).fill('17:00');
  await page.getByRole('button', { name: 'Save Candidate' }).click();

  const candidateId = await page.getByLabel('Candidate ID').textContent();
  expect(candidateId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.getByRole('link', { name: 'Review Place' }).click();
  await expect(page).toHaveURL(`/en/moderation/places/${candidateId}`);
  await expect(page.getByRole('heading', { name: 'Publication checklist' })).toBeVisible();
  await expect(page.getByText('Ready')).toHaveCount(8);

  const conditionGroups = page.getByRole('group', { name: /Evidence supporting condition/ });
  const unrestrictedCondition = conditionGroups.filter({
    hasText: 'All dogs are allowed indoors when carried. Access times are unknown.'
  });
  const restrictedCondition = conditionGroups.filter({
    hasText:
      'Dogs weighing up to and including 10 kg are allowed indoors before 17:00 when carried.'
  });
  await expect(conditionGroups).toHaveCount(2);
  await expect(unrestrictedCondition).toHaveCount(1);
  await expect(restrictedCondition).toHaveCount(1);
  const firstCondition = conditionGroups.nth(0);
  const secondCondition = conditionGroups.nth(1);
  await expect(firstCondition).toContainText('Official website');
  await expect(firstCondition).toContainText(candidate.evidenceUrl);
  await expect(firstCondition).toContainText('9 July 2026');
  await expect(secondCondition).toContainText('Public record');
  await expect(secondCondition).toContainText('Municipal rule 4');
  await firstCondition.getByLabel(candidate.evidenceSourceLabel).check();
  await firstCondition.getByLabel('Supporting public record').check();
  await secondCondition.getByLabel('Supporting public record').check();
  await expect(firstCondition.getByLabel('Contradictory member report')).not.toBeChecked();
  await expect(secondCondition.getByLabel('Contradictory member report')).not.toBeChecked();

  await page.getByRole('button', { name: 'Verify and publish' }).click();
  await expect(page.getByText('The Place has been published.')).toBeVisible();

  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await publicClient.rpc('list_published_places', {
    requested_locale: 'en'
  });

  expect(error).toBeNull();
  expect(data?.find((place) => place.place_id === candidateId)?.access_condition_count).toBe(2);

  const verifiedProfileResponse = await page.request.get(`/api/places/${candidateId}?lang=en`);
  expect(verifiedProfileResponse.status()).toBe(200);
  expect(verifiedProfileResponse.headers()['cache-control']).toBe('no-store');

  await expect(proveLocalReconfirmationSchedulerSerialization(candidateId!)).resolves.toEqual({
    displacedVerificationTaskCount: 0,
    activeVerificationCount: 1
  });
  await expect(proveLocalInactivitySerialization(candidateId!)).resolves.toEqual({
    schedulerPlaceLifecycle: 'inactive',
    schedulerTaskCount: 0,
    disputePlaceLifecycle: 'inactive',
    disputeCount: 0,
    disputeEvidenceCount: 1,
    disputeCurrentVerificationCount: 1
  });

  await page.goto(`/en?place=${candidateId}`);
  const englishCard = page.getByRole('complementary', { name: 'Selected place' });
  await expect(englishCard).toBeVisible();
  await englishCard.getByText('Details and sources').click();
  await expect(englishCard.getByText(candidate.evidenceSourceLabel)).toBeVisible();
  await expect(englishCard.getByText('Supporting public record')).toHaveCount(2);
  await expect(englishCard.getByText(candidate.evidenceUrl)).toBeVisible();
  await expect(englishCard.getByText('Municipal rule 4')).toHaveCount(2);
  await expect(englishCard.locator('small').filter({ hasText: /^Official website$/ })).toHaveCount(
    2
  );
  await expect(englishCard.locator('small').filter({ hasText: /^Public record$/ })).toHaveCount(2);
  await expect(englishCard.getByText('Contradictory member report')).toHaveCount(0);
  await expect(
    englishCard.getByText(
      'Dogs weighing up to and including 10 kg are allowed indoors before 17:00 when carried.'
    )
  ).toBeVisible();
  await page.getByRole('link', { name: 'Íslenska' }).click();
  await expect(page).toHaveURL(new RegExp(`/is\\?place=${candidateId}`));
  const icelandicCard = page.getByRole('complementary', { name: 'Valinn staður' });
  const icelandicExplanation = icelandicCard.getByText(
    'Hundar sem eru allt að og með 10 kg mega vera innandyra fyrir kl. 17:00 í burðartösku.'
  );
  if (!(await icelandicExplanation.isVisible())) {
    await icelandicCard.getByText('Nánar og heimildir').click();
  }
  await expect(icelandicExplanation).toBeVisible();
  await expect(icelandicCard.locator('small').filter({ hasText: /^Opinber vefsíða$/ })).toHaveCount(
    2
  );
  await expect(icelandicCard.getByText('Municipal rule 4')).toHaveCount(2);

  const audit = getLocalPublicationAudit(candidateId!);
  expect(audit.map((event) => event.action)).toEqual(['place.published', 'place.verified']);
  expect(new Set(audit.map((event) => event.actorId)).size).toBe(1);
  expect(new Set(audit.map((event) => event.requestId)).size).toBe(1);

  const disputeIds = openEveryLocalAccessDispute(candidateId!);
  expect(disputeIds).toHaveLength(2);

  const { data: duringDispute, error: disputeListError } = await publicClient.rpc(
    'list_published_places',
    { requested_locale: 'en' }
  );
  expect(disputeListError).toBeNull();
  expect(duringDispute?.some((place) => place.place_id === candidateId)).toBe(false);

  await page.goto(`/en/places/${candidateId}`);
  await expect(page.getByRole('heading', { name: candidate.nameEn })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Dog access information is under review' })
  ).toBeVisible();
  await expect(page.getByText('Contradictory member report')).toHaveCount(0);
  const underReviewProfileResponse = await page.request.get(`/api/places/${candidateId}?lang=en`);
  expect(underReviewProfileResponse.status()).toBe(409);
  expect(underReviewProfileResponse.headers()['cache-control']).toBe('no-store');
  const seriousAccessibilityViolations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious'
  );
  expect(seriousAccessibilityViolations).toEqual([]);
  const backToMap = page.getByRole('link', { name: 'Back to the map' });
  await backToMap.focus();
  await expect(backToMap).toBeFocused();

  const restoredVerificationIds = resolveEveryLocalAccessDispute(candidateId!);
  expect(restoredVerificationIds).toHaveLength(2);

  const { data: afterResolution, error: resolutionListError } = await publicClient.rpc(
    'list_published_places',
    { requested_locale: 'en' }
  );
  expect(resolutionListError).toBeNull();
  expect(
    afterResolution?.find((place) => place.place_id === candidateId)?.access_condition_count
  ).toBe(2);

  const restoredProfileResponse = await page.request.get(`/api/places/${candidateId}?lang=en`);
  expect(restoredProfileResponse.status()).toBe(200);
  expect(restoredProfileResponse.headers()['cache-control']).toBe('no-store');

  await page.goto(`/en?place=${candidateId}`);
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();

  await provisionLocalModerator(evaluationPublisher.email);
  const { data: afterCleanup, error: cleanupError } = await publicClient.rpc(
    'list_published_places',
    { requested_locale: 'en' }
  );
  expect(cleanupError).toBeNull();
  expect(afterCleanup?.some((place) => place.place_id === candidateId)).toBe(false);
});
