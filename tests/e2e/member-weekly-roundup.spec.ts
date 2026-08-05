import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import {
  getLocalSupabaseStatus,
  localWeeklyRoundupFixtures,
  provisionLocalWeeklyRoundupFixtures,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

test.beforeAll(() => {
  provisionLocalWeeklyRoundupFixtures();
});

test('a Member can shape a bilingual roundup without activating weekly rhythm or sending email', async ({
  page,
  request
}) => {
  test.setTimeout(60_000);
  const email = `weekly-roundup-${Date.now()}@example.invalid`;
  await signInMember(page, email);

  // The trail lives on the impact record's rhythm pillar since the hub redesign. Signing in
  // must not have activated the current week.
  await expectCurrentWeekOpen(page);

  // The recap has no account-hub entry while the member base is small; the route is direct-only.
  await page.goto('/en/account/roundup');
  await expect(page).toHaveURL('/en/account/roundup');
  await expect(page.getByRole('heading', { name: 'Choose where your trail begins' })).toBeVisible();
  // The checkboxes must not be ticked before Svelte finishes hydrating: hydration re-renders
  // the form and silently wipes any pre-hydration checkbox state, so the save then persists
  // only the boxes ticked afterwards.
  await waitForHydration(page);
  const mailboxBeforePreferences = await mailboxCount(request);

  await page.getByRole('checkbox', { name: 'Reykjavík' }).check();
  await page.getByRole('checkbox', { name: 'Kópavogur' }).check();
  await page.getByRole('radio', { name: 'English' }).check();
  await page
    .getByRole('checkbox', {
      name: 'I would be interested in receiving this recap by email later'
    })
    .check();
  await page.getByRole('button', { name: 'Save recap settings' }).click();

  await expect(
    page.getByText('Your private recap settings were saved. No email was sent.')
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A few fresh tracks' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: localWeeklyRoundupFixtures.newCafe.nameEn })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: localWeeklyRoundupFixtures.updatedPark.nameEn })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: localWeeklyRoundupFixtures.updatedService.nameEn })
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(await mailboxCount(request)).toBe(mailboxBeforePreferences);

  await page.getByRole('button', { name: 'Edit recap settings' }).click();
  const emailInterest = page.getByRole('checkbox', {
    name: 'I would be interested in receiving this recap by email later'
  });
  await expect(emailInterest).toBeChecked();
  await emailInterest.uncheck();
  await page.getByRole('checkbox', { name: 'Reykjavík' }).uncheck();
  await page.getByRole('checkbox', { name: 'Kópavogur' }).uncheck();
  await page.getByRole('checkbox', { name: 'Kjósarhreppur' }).check();
  await page.getByRole('button', { name: 'Save recap settings' }).click();
  await expect(page.getByRole('heading', { name: 'No new tracks this week' })).toBeVisible();
  expect(await mailboxCount(request)).toBe(mailboxBeforePreferences);

  await page.getByRole('button', { name: 'Edit recap settings' }).click();
  await page.getByRole('checkbox', { name: 'Kjósarhreppur' }).uncheck();
  await page.getByRole('checkbox', { name: 'Kópavogur' }).check();
  await page.getByRole('button', { name: 'Save recap settings' }).click();
  await expect(page.getByRole('heading', { name: 'A short trail this week' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: localWeeklyRoundupFixtures.updatedPark.nameEn })
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);

  await page.getByRole('button', { name: 'Edit recap settings' }).click();
  await page.getByRole('checkbox', { name: 'Kópavogur' }).uncheck();
  await page.getByRole('checkbox', { name: 'Reykjavík' }).check();
  await page.getByRole('radio', { name: 'Icelandic' }).check();
  await page.getByRole('button', { name: 'Save recap settings' }).click();
  await expect(page.getByRole('heading', { name: 'Stutt slóð í þessari viku' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: localWeeklyRoundupFixtures.newCafe.nameIs })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: localWeeklyRoundupFixtures.updatedService.nameIs })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skoða alla staði' })).toHaveAttribute('href', '/is');

  await expectCurrentWeekOpen(page);
});

test('Visitors cannot reach or call private roundup surfaces', async ({ page, request }) => {
  const path = '/en/account/roundup';
  await page.goto(path);
  await expect(page).toHaveURL(`/en?auth=open&authReturnTo=${encodeURIComponent(path)}`);
  await expect(page.getByRole('dialog').getByLabel('Email address')).toBeVisible();

  const status = getLocalSupabaseStatus();
  const headers = {
    apikey: status.publishableKey,
    Authorization: `Bearer ${status.publishableKey}`,
    'Content-Type': 'application/json'
  };
  for (const functionName of [
    'get_current_member_roundup_preferences',
    'save_current_member_roundup_preferences',
    'get_current_member_weekly_roundup'
  ]) {
    const response = await request.post(`${status.apiUrl}/rest/v1/rpc/${functionName}`, {
      headers,
      data:
        functionName === 'save_current_member_roundup_preferences'
          ? {
              requested_municipalities: ['reykjavik'],
              requested_categories: [],
              requested_locale: 'en',
              requested_email_interest: false
            }
          : {}
    });
    expect(response.ok()).toBe(false);
    expect([401, 403, 404]).toContain(response.status());
  }
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(email));
  await waitForHydration(page);
}

// The trail renders on the impact record's rhythm pillar; opening the details reveals it.
async function expectCurrentWeekOpen(page: Page): Promise<void> {
  await page.goto('/en/account/impact');
  await page.locator('[data-impact-pillar="rhythm"] summary').click();
  await expect(page.locator('[data-weekly-rhythm-history] .current')).toHaveAttribute(
    'data-state',
    'open'
  );
}

async function mailboxCount(request: APIRequestContext): Promise<number> {
  const response = await request.get(`${getLocalSupabaseStatus().inbucketUrl}/api/v1/messages`);
  expect(response.ok()).toBe(true);
  const mailbox = (await response.json()) as { messages: unknown[] };
  return mailbox.messages.length;
}
