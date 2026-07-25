import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

import type { Database } from '$server/db/generated.types';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  configureLocalSuggestionAbusePolicy,
  getLocalSuggestionProposal,
  getLocalSuggestionStates,
  getLocalSupabaseStatus,
  localCorrectedSuggestionPredecessor,
  provisionLocalModerator,
  provisionLocalSuggestionIdentityFixtures,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const acceptedName = 'Accepted community cafe';
const acceptedNameIs = 'Samfélagskaffi';
const needsInformationName = 'Community library needs information';
const rejectedName = 'Rejected community park';
const duplicateName = 'Duplicate community cafe';
const minimalName = 'Minimal pin cafe';
const suggestionCitation = 'New place suggestion, reported from the suggestion form.';
const suggestionSourceLabel = 'Member report from the suggestion form';

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalSuggestionAbusePolicy();
  provisionLocalSuggestionIdentityFixtures();
});

test('the map entry point carries its pin to the three questions, and only sending is gated', async ({
  page
}) => {
  const memberEmail = `suggestion-map-${Date.now()}@example.invalid`;
  const discoveryPath = '/en?lat=64.1423&lng=-21.9555&z=13&view=map';

  await page.goto(discoveryPath);
  const entry = page.getByRole('link', { name: 'Suggest a place' });
  await expect(entry).toBeVisible();
  const entryHref = await entry.getAttribute('href');
  expect(entryHref).not.toBeNull();
  const suggestUrl = new URL(entryHref!, 'http://hundavaent.local');
  const suggestPath = suggestUrl.pathname + suggestUrl.search;
  expect(suggestPath).toContain('/en/suggest?');
  expect(suggestPath).toContain('latitude=64.1423');
  expect(suggestPath).toContain('longitude=-21.9555');
  await entry.click();

  // No sign-in wall in front of the questions: a signed-out visitor reads what is being asked.
  await expect(page).toHaveURL(suggestPath);
  await waitForHydration(page);
  await expect(page.getByRole('region', { name: 'Choose where the place is' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter coordinates instead' }).click();
  await expect(page.getByLabel('Latitude')).toHaveValue('64.1423');
  await expect(page.getByLabel('Longitude')).toHaveValue('-21.9555');

  // The gate fires at send, and it hands over to sign-in rather than to a dead end.
  await page.getByLabel('Place name').fill('Signed out pin cafe');
  await page.getByRole('radio', { name: 'Outdoors' }).check();
  await page.getByRole('button', { name: 'Send suggestion' }).click();
  const gate = page.getByRole('alert');
  await expect(gate).toContainText('Sign in to send this suggestion.');
  const signIn = gate.getByRole('link', { name: 'Sign in' });
  await expect(signIn).toHaveAttribute(
    'href',
    `/en/account?returnTo=${encodeURIComponent(suggestPath)}`
  );
  expect(getLocalSuggestionProposal('Signed out pin cafe')).toBeNull();

  await signIn.click();
  await expect(page).toHaveURL(`/en?auth=open&authReturnTo=${encodeURIComponent(suggestPath)}`);
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(memberEmail);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(memberEmail);
  await page.goto(magicLink);

  await expect(page).toHaveURL(suggestPath);
  await waitForHydration(page);
  await expect(page.getByRole('region', { name: 'Choose where the place is' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter coordinates instead' }).click();
  await expect(page.getByLabel('Latitude')).toHaveValue('64.1423');
  await expect(page.getByLabel('Longitude')).toHaveValue('-21.9555');

  await expect(page.locator('.map-surface[data-paint-ready]')).toHaveAttribute(
    'data-paint-ready',
    'true'
  );
  await page.locator('.maplibregl-canvas').click({ position: { x: 120, y: 120 } });
  await expect(page.getByRole('status')).toContainText('Location selected at');
  await expect(page.getByLabel('Latitude')).not.toHaveValue('64.1423');

  await page.getByLabel('Latitude').fill('64.15');
  await page.getByLabel('Longitude').fill('-21.93');
  await expect(page.getByLabel('Latitude')).toHaveValue('64.15');
  await page.getByRole('button', { name: 'Use map centre' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Location selected at');
});

test('private Suggestions reach accepted, rejected, and duplicate outcomes without public leakage', async ({
  browser,
  page
}) => {
  // Four Suggestion submissions, four Moderator resolutions, and a full verify-and-publish pass
  // is the longest sequential journey in this suite; give it the same headroom the comparably
  // long favourites.spec.ts cross-tab journey already gets rather than the suite's 30s default,
  // which this test was already close enough to that a slower-than-local CI runner tipped it over.
  test.setTimeout(60_000);
  const memberEmail = `suggestion-member-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  await submitSuggestion(page, needsInformationName, '64.1508', '-21.9208', 'Indoors', true);
  await submitSuggestion(page, acceptedName, '64.1511', '-21.9201');
  await submitSuggestion(page, duplicateName, '64.1511', '-21.9201');
  await submitSuggestion(page, rejectedName, '64.1515', '-21.9195', 'Designated area only');

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);

  await resolveSuggestion(moderatorPage, acceptedName, 'accepted', true);
  await resolveSuggestion(moderatorPage, needsInformationName, 'needs_information');
  await resolveSuggestion(moderatorPage, rejectedName, 'rejected');
  await resolveSuggestion(moderatorPage, duplicateName, 'duplicate');

  await page.goto('/en/account/suggestions');
  await expect(page.getByText(acceptedName)).toBeVisible();
  await expect(page.getByText(needsInformationName)).toBeVisible();
  await expect(page.getByText(rejectedName)).toBeVisible();
  await expect(page.getByText(duplicateName)).toBeVisible();
  await expect(page.getByText('Accepted as a Candidate', { exact: true })).toBeVisible();
  await expect(page.getByText('Needs information', { exact: true })).toBeVisible();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(page.getByText('Place already recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('Insufficient evidence for publication.')).toBeVisible();

  const states = getLocalSuggestionStates();
  const acceptedState = states.find((item) => item.nameEn === acceptedName);
  expect(acceptedState).toMatchObject({
    status: 'accepted',
    candidateLifecycle: 'candidate',
    candidateOperatorId: localCorrectedSuggestionPredecessor.operatorId,
    candidateLocationId: localCorrectedSuggestionPredecessor.locationId,
    contributionCount: 1
  });
  expect(states.find((item) => item.nameEn === rejectedName)).toMatchObject({
    status: 'rejected',
    candidatePlaceId: null,
    contributionCount: 0
  });
  expect(states.find((item) => item.nameEn === needsInformationName)).toMatchObject({
    status: 'needs_information',
    candidatePlaceId: null,
    contributionCount: 0
  });
  expect(states.find((item) => item.nameEn === duplicateName)).toMatchObject({
    status: 'duplicate',
    candidatePlaceId: null,
    contributionCount: 0
  });

  const status = getLocalSupabaseStatus();
  const publicClient = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await publicClient.rpc('list_published_places', {
    requested_locale: 'en'
  });
  expect(error).toBeNull();
  expect(data?.some((place) => place.name === acceptedName)).toBe(false);

  expect(acceptedState?.candidatePlaceId).toMatch(/^[0-9a-f-]{36}$/i);
  const candidateId = acceptedState!.candidatePlaceId!;
  await moderatorPage.goto(
    `/en/moderation?queue=candidate-places&item=${candidateId}&filter=actionable`
  );
  await expect(moderatorPage).toHaveURL(
    `/en/moderation?queue=candidate-places&item=${candidateId}&filter=actionable`
  );
  await expect(moderatorPage.getByRole('heading', { name: 'Publication checklist' })).toBeVisible();
  await expect(moderatorPage.getByText('Ready', { exact: true })).toBeVisible();
  await moderatorPage.getByRole('button', { name: 'Verify and publish' }).click();
  const publishDialog = moderatorPage.getByRole('dialog', { name: 'Publish this Place?' });
  await publishDialog
    .getByLabel('Reason for publishing')
    .fill('The accepted member suggestion has been reviewed.');
  await publishDialog.getByRole('button', { name: 'Verify and publish' }).click();
  await expect(moderatorPage.getByText('The Place has been published.')).toBeVisible();

  const published = await publicClient.rpc('list_published_places', {
    requested_locale: 'en'
  });
  expect(published.error).toBeNull();
  expect(published.data?.some((place) => place.place_id === candidateId)).toBe(true);

  await page.goto(`/en?place=${candidateId}`);
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toContainText(
    acceptedName
  );
  await page.getByRole('link', { name: 'Íslenska' }).click();
  await expect(page).toHaveURL(new RegExp(`/is\\?place=${candidateId}`));
  await expect(page.getByRole('complementary', { name: 'Valinn staður' })).toContainText(
    acceptedNameIs
  );
  await moderatorContext.close();
});

test('a minimal Suggestion blocks accept until it is translated and publication until its restraint note is written', async ({
  browser,
  page
}) => {
  const memberEmail = `suggestion-minimal-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);
  // The Member's first Suggestion of the week is what activates it.
  await submitSuggestion(page, minimalName, '64.1502', '-21.9188', 'Indoors', true);

  // Three Member answers, and every other field a server position taken once and honestly.
  const proposal = getLocalSuggestionProposal(minimalName);
  expect(proposal).not.toBeNull();
  expect(proposal).toMatchObject({
    category: 'other',
    location: {
      address_line: 'Map pin at 64.1502, -21.9188',
      locality: 'Capital region',
      municipality: 'reykjavik',
      postal_code: '000'
    },
    access_condition: {
      access_area: 'indoors',
      restraint_condition: 'other_sourced',
      restraint_note: 'Not stated by the member',
      permission_requirement: 'ask_on_arrival',
      availability_state: 'not_stated'
    },
    evidence: {
      kind: 'member_report',
      source_citation: suggestionCitation,
      source_label: suggestionSourceLabel,
      explanation: suggestionCitation,
      source_metadata: { submissionProfile: 'minimal-v1', surface: 'suggestion-form' }
    }
  });
  expect(proposal?.translations.is.needs_review).toBe(true);
  expect(proposal?.translations.en.needs_review).toBe(true);
  // The name is the only Member text, and it never reaches the citation a published profile shows.
  expect(proposal?.evidence.source_citation).not.toContain(minimalName);
  expect(proposal?.translations.en.name).toBe(minimalName);

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  // The Moderator signs in once per spec file, and a single-use magic link is only good for the
  // first of them: clear the mailbox so this sign-in reads its own email.
  await clearLocalEvaluationMailbox();
  await signInModerator(moderatorPage);
  await moderatorPage.goto('/en/moderation?queue=suggestions&filter=actionable');
  await waitForHydration(moderatorPage);
  await moderatorPage
    .getByRole('listitem')
    .filter({ hasText: minimalName })
    .getByRole('link')
    .click();

  await expect(
    moderatorPage.getByRole('button', { name: 'Accept as Candidate', exact: true })
  ).toBeDisabled();
  await expect(
    moderatorPage.getByText('Please add a translation before publishing.')
  ).toBeVisible();

  // A Moderator writes the descriptions the Member was never asked for, and the block lifts.
  const translations = moderatorPage.locator('#suggestion-translations');
  await expandReviewSection(translations);
  await translations.getByRole('button', { name: 'Edit Names and descriptions' }).click();
  const translationForm = translations.locator('form[data-section-form="translations"]');
  const names = translationForm.getByLabel('Name');
  const descriptions = translationForm.getByLabel('Description');
  // The Member's one answer comes back in both locales rather than being retyped twice; the
  // description is the only thing nobody wrote.
  await expect(names.nth(0)).toHaveValue(minimalName);
  await expect(names.nth(1)).toHaveValue(minimalName);
  await expect(descriptions.nth(0)).toHaveValue('');
  await expect(descriptions.nth(1)).toHaveValue('');
  await names.nth(0).fill('Lágmarkskaffi');
  await descriptions.nth(0).fill('Stjórnandi skrifaði þessa lýsingu.');
  await descriptions.nth(1).fill('A Moderator wrote this description.');
  await translationForm.getByRole('button', { name: 'Save' }).click();
  await expect(moderatorPage.getByRole('status')).toContainText('Draft changes saved.');

  const accept = moderatorPage.getByRole('button', { name: 'Accept as Candidate', exact: true });
  await expect(accept).toBeEnabled();
  await accept.click();
  const acceptDialog = moderatorPage.getByRole('dialog');
  await acceptDialog.getByRole('button', { name: 'Accept as Candidate', exact: true }).click();
  await expect(moderatorPage.getByText('The outcome has been saved.')).toBeVisible();

  // Accept copies the server's restraint note onto the Candidate, where it is publishable text.
  // The publication checklist is where that stops: the Place cannot be published while it still
  // carries a rule nobody stated, exactly as it cannot be published without a translation.
  const candidateId = getLocalSuggestionStates().find(
    (item) => item.nameEn === minimalName
  )?.candidatePlaceId;
  expect(candidateId).toMatch(/^[0-9a-f-]{36}$/i);
  await moderatorPage.goto(
    `/en/moderation?queue=candidate-places&item=${candidateId}&filter=actionable`
  );
  const readiness = moderatorPage.getByRole('region', { name: 'Publication checklist' });
  await expect(readiness).toContainText('Blocked');
  await expect(
    readiness.getByRole('link', { name: 'Write the restraint rule or clear the note' })
  ).toBeVisible();
  await moderatorContext.close();
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account?returnTo=%2Fen%2Fsuggest');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
  await expect(page).toHaveURL('/en/suggest');
}

async function signInModerator(page: Page): Promise<void> {
  page.setDefaultTimeout(10_000);
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%2Fsuggestions');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(/\/en\/moderation\?queue=suggestions/);
  await waitForHydration(page);
}

async function submitSuggestion(
  page: Page,
  nameEn: string,
  latitude: string,
  longitude: string,
  welcomeArea = 'Outdoors',
  activatedCurrentWeek = false
): Promise<void> {
  await page.goto('/en/suggest');
  await waitForHydration(page);
  await page.getByLabel('Place name').fill(nameEn);
  await page.getByRole('button', { name: 'Enter coordinates instead' }).click();
  await page.getByLabel('Latitude').fill(latitude);
  await page.getByLabel('Longitude').fill(longitude);
  await page.getByRole('radio', { name: welcomeArea, exact: true }).check();
  await page.getByRole('button', { name: 'Send suggestion' }).click();
  await expect(
    page.locator(
      `[data-weekly-rhythm-acknowledgement][data-recognition-action="suggestion"][data-activated-week="${activatedCurrentWeek}"]`
    )
  ).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: nameEn }).getByText('Submitted', { exact: true })
  ).toBeVisible();
}

async function resolveSuggestion(
  page: Page,
  name: string,
  outcome: 'accepted' | 'needs_information' | 'rejected' | 'duplicate',
  confirmUseful = false
): Promise<void> {
  await page.goto('/en/moderation?queue=suggestions&filter=actionable');
  await waitForHydration(page);
  const queueItem = page.getByRole('listitem').filter({ hasText: name });
  await queueItem.getByRole('link').click();
  const evidence = page.locator('#suggestion-evidence');
  await expandReviewSection(evidence);
  // The Member wrote no Evidence: the server's own record is what a Moderator reads, and it
  // carries no source of its own to follow.
  await expect(evidence.getByText(suggestionSourceLabel, { exact: true })).toBeVisible();
  await expect(evidence.getByText(suggestionCitation)).toBeVisible();
  await expect(evidence.getByRole('link')).toHaveCount(0);
  if (outcome === 'accepted') {
    const translations = page.locator('#suggestion-translations');
    await expandReviewSection(translations);
    await translations.getByRole('button', { name: 'Edit Names and descriptions' }).click();
    const translationForm = translations.locator('form[data-section-form="translations"]');
    const names = translationForm.getByLabel('Name');
    const descriptions = translationForm.getByLabel('Description');
    await names.nth(0).fill(acceptedNameIs);
    await names.nth(1).fill(acceptedName);
    await descriptions.nth(0).fill('Tillaga sem stjórnandi hefur þýtt og yfirfarið.');
    await descriptions.nth(1).fill('A Moderator-corrected structured Suggestion.');
    await translationForm.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Draft changes saved.');
    await expect(translationForm).toHaveCount(0);

    const location = page.locator('#suggestion-location');
    await expandReviewSection(location);
    await location.getByRole('button', { name: 'Edit Location' }).click();
    const locationForm = location.locator('form[data-section-form="location"]');
    await locationForm.getByText('Edit location details', { exact: true }).click();
    await locationForm.getByLabel('Address or area').fill('Leiðrétt gata 48');
    await locationForm.getByLabel('Postal code').fill('105');
    await locationForm.getByLabel('Latitude').fill('64.1325');
    await locationForm.getByLabel('Longitude').fill('-21.9024');
    await locationForm.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Draft changes saved.', { exact: true })).toBeVisible();
    await expect(locationForm).toHaveCount(0);

    // Every Suggestion now arrives with the server's own sentence where the Member stated no
    // restraint rule. It is publishable text in one language, so a Moderator replaces it with a
    // real rule before this Place can reach a visitor.
    const access = page.locator('#suggestion-access');
    await expandReviewSection(access);
    await access.getByRole('button', { name: 'Edit Access condition' }).click();
    const accessForm = access.locator('form[data-section-form="access-condition"]');
    await accessForm.getByLabel('Restraint note').fill('Leashed indoors, off leash on the patio.');
    await accessForm.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Draft changes saved.', { exact: true })).toBeVisible();
    await expect(accessForm).toHaveCount(0);

    const matches = page.locator('#suggestion-matches');
    await expandReviewSection(matches);
    await page
      .getByLabel('Operator identity')
      .selectOption(localCorrectedSuggestionPredecessor.placeId);
    await page
      .getByLabel('Location identity')
      .selectOption(localCorrectedSuggestionPredecessor.placeId);
    await expect(page.getByLabel('Operator identity')).not.toContainText(
      'Accepted community cafe operator'
    );
    await expect(page.getByText('Inactive · Leiðrétt gata 48, Reykjavík')).toBeVisible();
  }

  const actionName =
    outcome === 'accepted'
      ? 'Accept as Candidate'
      : outcome === 'needs_information'
        ? 'Needs information'
        : outcome === 'duplicate'
          ? 'Mark as duplicate'
          : 'Reject';
  await page.getByRole('button', { name: actionName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (outcome !== 'accepted') {
    await dialog
      .getByLabel('Member explanation in Icelandic')
      .fill(outcome === 'rejected' ? 'Ekki nægar heimildir.' : 'Tillagan hefur verið yfirfarin.');
    await dialog
      .getByLabel('Member explanation in English')
      .fill(
        outcome === 'rejected'
          ? 'Insufficient evidence for publication.'
          : 'The Suggestion was reviewed.'
      );
    await dialog
      .getByLabel('Private Moderator note')
      .fill('Identity and Evidence reviewed in E2E.');
  }
  if (outcome === 'duplicate') {
    const duplicateSelect = dialog.getByLabel('Choose the Place this Suggestion duplicates');
    await expect(
      duplicateSelect.getByRole('option', { name: /Unrelated E2E operator/ })
    ).toHaveCount(0);
    await duplicateSelect.selectOption({ index: 1 });
  }
  await dialog.getByRole('button', { name: actionName, exact: true }).click();
  await expect(page.getByText('The outcome has been saved.')).toBeVisible();
  await expect(dialog).toBeHidden();

  if (outcome === 'accepted' && confirmUseful) {
    await page
      .getByRole('navigation', { name: 'Queue status' })
      .getByRole('link', { name: 'Resolved' })
      .click();
    const acceptedItem = page.getByRole('listitem').filter({ hasText: name });
    await acceptedItem.getByRole('link').click();
    await page.getByRole('button', { name: 'Confirm useful Contribution' }).click();
    await expect(page.getByText('The useful Contribution has been confirmed.')).toBeVisible();
  }
}

async function expandReviewSection(section: Locator): Promise<void> {
  if ((await section.getAttribute('open')) === null) {
    await section.locator('summary').click();
  }
}
