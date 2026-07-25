import { expect, test, type Locator, type Page } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  configureLocalPlaceFlagAbusePolicy,
  localPlaceFlagFixtures,
  provisionLocalModerator,
  provisionLocalPlaceFlagFixtures,
  retireLocalPlaceFlagFixtures,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

/**
 * The place-level Report claims the card offers. Everything asserted here is fixed text on
 * deterministic fixture Places, so the whole file can be run twice against one database: the
 * provisioning helper deletes every flag raised against these three Places before it re-publishes
 * them, which is what makes a second run see the same starting state as the first.
 */

const { correctable } = localPlaceFlagFixtures;
const closedAction = `This place is closed - report a closure at ${correctable.nameEn}`;
const movedAction = `This place has moved - report a move at ${correctable.nameEn}`;
const unsafeAction = `This place is unsafe for dogs - report unsafe conditions for dogs at ${correctable.nameEn}`;

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalPlaceFlagAbusePolicy();
  provisionLocalPlaceFlagFixtures();
  await clearLocalEvaluationMailbox();
});

test.afterAll(() => {
  // The fixture Places are published so they can be reported; retiring them keeps them out of the
  // public discovery captures every later spec in this shared local session still has to take.
  retireLocalPlaceFlagFixtures();
});

test('a Member reports a Place closed from the card and a Moderator reviews a whole-Place claim', async ({
  browser,
  page
}) => {
  const memberEmail = `card-report-closed-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const selectedPlace = await openContributionReveal(page);

  // All three claims are offered, and none of them asks the Member to pick a fact first.
  await expect(selectedPlace.getByRole('button', { name: closedAction })).toBeVisible();
  await expect(selectedPlace.getByRole('button', { name: movedAction })).toBeVisible();
  await expect(selectedPlace.getByRole('button', { name: unsafeAction })).toBeVisible();

  await selectedPlace.getByRole('button', { name: closedAction }).click();
  // The claim was made by the trigger, so the editor asks for nothing but confirmation: no choice
  // to make, and the optional note is the only field in the group.
  const editor = selectedPlace.getByRole('group', { name: 'Report that this place is closed' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('radio')).toHaveCount(0);
  await expect(editor.getByRole('textbox')).toHaveCount(1);
  await editor
    .getByLabel('Anything to add? (optional)')
    .fill('The shutters have been down for weeks.');

  const flagId = await sendReport(page, selectedPlace);

  // The action it came from is replaced straight away, and only that one: an open "closed" says
  // nothing about whether the Place has moved or is unsafe.
  await expect(selectedPlace.getByRole('button', { name: closedAction })).toHaveCount(0);
  await expect(selectedPlace.locator('[data-report-pending]')).toHaveText(
    'Report sent - pending review'
  );
  await expect(selectedPlace.getByRole('button', { name: movedAction })).toBeVisible();
  await expect(selectedPlace.getByRole('button', { name: unsafeAction })).toBeVisible();
  await expect(selectedPlace.locator('[data-contribution-announcement]')).toHaveText(
    'Thank you. A Moderator will check this.'
  );

  // "Something else is wrong" is the one path out of the card, and it names no target at all.
  const deepLink = selectedPlace.getByRole('link', {
    name: `Something else is wrong - report another problem with ${correctable.nameEn}`
  });
  await expect(deepLink).toHaveAttribute('href', `/en/places/${correctable.placeId}/report`);

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(
    `/en/moderation?queue=corrections-and-reports&item=${flagId}&filter=actionable`
  );
  await waitForHydration(moderatorPage);

  // The queue summary says the same thing the panel does, because both read one helper. It used to
  // say "An Access Condition" here, naming a fact the Member never mentioned.
  const queueItem = moderatorPage.locator(`[data-work-item-id="${flagId}"]`);
  await expect(queueItem).toContainText('The whole place');
  await expect(queueItem).not.toContainText('An Access Condition');

  // The subject is the whole Place, not an Access Condition the Member never mentioned.
  const changeSection = moderatorPage.locator('#correction-change');
  await expect(changeSection).toContainText('The whole place');
  await expandReviewSection(changeSection);

  // The third snapshot shape: what identified this Place at the moment the claim was raised.
  const snapshot = changeSection.locator('[data-place-snapshot]');
  await expect(snapshot).toContainText(`${correctable.nameIs} / ${correctable.nameEn}`);
  await expect(snapshot).toContainText('Café');
  await expect(snapshot).toContainText('Reykjavík');

  // Truthfully labelled as a Member report the server wrote, citing its own summary of the reason
  // and never the Member's own words.
  const evidenceSection = moderatorPage.locator('#correction-evidence');
  await expect(evidenceSection).toContainText('Member report from the place page');
  await expandReviewSection(evidenceSection);
  await expect(
    evidenceSection.getByText('Reported closed from the place card.').first()
  ).toBeVisible();
  await expect(evidenceSection).toContainText('The shutters have been down for weeks.');

  // A whole-Place target has no Access Condition, so the Dispute route is not offered.
  await expect(
    moderatorPage.getByRole('button', { name: 'Open dispute', exact: true })
  ).toHaveCount(0);
  await expect(
    moderatorPage.getByRole('button', { name: 'Inactivate Place', exact: true }).first()
  ).toBeEnabled();
  await moderatorContext.close();
});

test('an unsafe claim from the card reaches the Moderator already escalated as a Safety Concern', async ({
  browser,
  page
}) => {
  const memberEmail = `card-report-unsafe-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const selectedPlace = await openContributionReveal(page);
  await selectedPlace.getByRole('button', { name: unsafeAction }).click();
  await expect(
    selectedPlace.getByRole('group', { name: 'Report that this place is unsafe for dogs' })
  ).toBeVisible();
  // No Safety Concern checkbox is offered anywhere on the card.
  await expect(selectedPlace.getByLabel('This is a Safety Concern')).toHaveCount(0);
  const flagId = await sendReport(page, selectedPlace);

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto(
    `/en/moderation?queue=corrections-and-reports&item=${flagId}&filter=actionable`
  );
  await waitForHydration(moderatorPage);

  // The Member never asked for an escalation and was never shown a checkbox. The mapping is applied
  // server-side, because a Member-initiated "unsafe for dogs" is definitionally a Safety Concern
  // and must not depend on a Moderator inferring it.
  await expect(moderatorPage.getByText('Safety Concern').first()).toBeVisible();
  const evidenceSection = moderatorPage.locator('#correction-evidence');
  await expandReviewSection(evidenceSection);
  await expect(
    evidenceSection.getByText('Reported unsafe for dogs from the place card.').first()
  ).toBeVisible();
  await moderatorContext.close();
});

test('the card hands a claim it cannot make to the form, which opens on the whole Place', async ({
  page
}) => {
  const memberEmail = `card-report-form-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  const selectedPlace = await openContributionReveal(page);
  await selectedPlace
    .getByRole('link', {
      name: `Something else is wrong - report another problem with ${correctable.nameEn}`
    })
    .click();
  await waitForHydration(page);

  // The link named no target, so the form opens on the whole Place and offers neither narrower
  // selector. This is the default state; every other test of this form deep-links past it.
  await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
  await expect(page.getByLabel('What are you correcting?')).toHaveValue('place');
  await expect(page.getByLabel('Choose the detail')).toHaveCount(0);
  await expect(page.getByLabel('Choose the Access Condition')).toHaveCount(0);

  await page.getByLabel('What kind of problem is this?').selectOption('misleading');
  await page
    .getByLabel('Private explanation to the Moderator')
    .fill('The listing describes a garden that was paved over.');
  await page.getByRole('button', { name: 'Send private Report' }).click();

  // The Member lands on their own list, where the claim is named as what they raised it about.
  await expect(page).toHaveURL(/\/en\/account\/corrections-and-reports/);
  const raised = page.getByRole('listitem').filter({ hasText: correctable.nameEn }).first();
  await expect(raised).toContainText('Report · The whole place');
  await expect(raised).not.toContainText('An Access Condition');
});

async function openContributionReveal(page: Page): Promise<Locator> {
  await page.goto(`/en?place=${correctable.placeId}`);
  await waitForHydration(page);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });
  await selectedPlace.getByText('Place details').click();
  await selectedPlace
    .getByRole('button', {
      name: `Spot something wrong? Correct the details for ${correctable.nameEn}`
    })
    .click();
  return selectedPlace;
}

async function sendReport(page: Page, selectedPlace: Locator): Promise<string> {
  const submissionPromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().includes('/reports');
  });
  await selectedPlace.getByRole('button', { name: 'Send', exact: true }).click();
  const submission = await submissionPromise;
  const submissionBody = await submission.text();
  expect(submission.status(), submissionBody).toBe(200);
  const flagId = (JSON.parse(submissionBody) as { flagId: string }).flagId;
  expect(flagId).toBeTruthy();
  return flagId;
}

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto(
    `/en/account?returnTo=${encodeURIComponent(`/en/places/${correctable.placeId}/report`)}`
  );
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
}

async function signInModerator(page: Page): Promise<void> {
  page.setDefaultTimeout(10_000);
  // The shared Moderator email is signed in once per test; clearing first keeps
  // waitForLocalMagicLink from matching a still-present message from an earlier sign-in.
  await clearLocalEvaluationMailbox();
  await page.goto(
    '/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation%3Fqueue%3Dcorrections-and-reports%26filter%3Dactionable'
  );
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await waitForHydration(page);
}

async function expandReviewSection(section: Locator): Promise<void> {
  if ((await section.getAttribute('open')) === null) {
    await section.locator('summary').click();
  }
}
