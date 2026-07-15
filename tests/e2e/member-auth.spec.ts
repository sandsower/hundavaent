import { expect, test } from '@playwright/test';

import { evaluationFixtureIds, evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  expireLocalMagicLink,
  provisionLocalModerator,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

test('a Visitor signs in by email, returns to the same Place state, signs out, and cannot replay the link', async ({
  page
}) => {
  const email = `member-${Date.now()}@example.invalid`;
  const placePath = `/en?place=${evaluationFixtureIds.places.published}&lat=64.1423&lng=-21.9555&z=13&view=map#selected-place`;

  await page.goto(placePath);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selectedPlace).toBeVisible();
  await expect(selectedPlace.getByText('Published Place')).toBeVisible();
  await waitForHydration(page);
  await expect(page).toHaveURL(placePath);
  const accountUrl = `/en/account?returnTo=${encodeURIComponent(placePath)}`;
  const accountLink = page.getByRole('link', { name: 'Sign in', exact: true });
  await expect(accountLink).toHaveAttribute('href', accountUrl);
  await accountLink.click();

  await expect(page).toHaveURL(placePath);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continue with Hundavænt' })).toBeVisible();
  await waitForHydration(page);
  const authDialog = page.getByRole('dialog');
  await authDialog.getByLabel('Email address').fill(email);
  await authDialog.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(authDialog.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(placePath);
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();

  await page.getByRole('link', { name: 'My account' }).click();
  await expect(page).toHaveURL(`/en/account?returnTo=${encodeURIComponent(placePath)}`);
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open moderation workspace' })).toHaveCount(0);
  await expect(page.getByText(email)).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Private profile name')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to place discovery' }).click();
  await expect(page).toHaveURL(placePath);
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();

  await page.getByRole('link', { name: 'My account' }).click();
  await expect(page).toHaveURL(`/en/account?returnTo=${encodeURIComponent(placePath)}`);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Start deletion request' }).click();
  await expect(
    page.getByText('Your request is recorded. We will contact you before anything is deleted.')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(placePath);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();

  await page.goto(magicLink);
  await expect(page).toHaveURL(/\/en\?.*auth=open.*authStatus=link_invalid/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText("Sign-in didn't work. Please try again.")).toBeVisible();
});

test('Member authentication recovery states are bilingual and public discovery stays open', async ({
  page
}) => {
  await page.goto('/is?auth=open&authStatus=link_invalid');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Innskráningin tókst ekki. Reyndu aftur.')).toBeVisible();

  await page.goto('/en');
  await expect(page.getByText(/place found|places found/)).toBeVisible();
});

test('a passwordless link opened on another device signs in without an originating verifier', async ({
  browser,
  page
}) => {
  const email = `other-device-${Date.now()}@example.invalid`;

  await page.goto('/en');
  await waitForHydration(page);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  const authDialog = page.getByRole('dialog');
  await authDialog.getByLabel('Email address').fill(email);
  await authDialog.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(authDialog.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const magicLink = await waitForLocalMagicLink(email);

  const otherDevice = await browser.newContext();
  const otherPage = await otherDevice.newPage();
  await otherPage.goto(magicLink);
  await waitForHydration(otherPage);
  await expect(otherPage).toHaveURL('/en');
  await expect(otherPage.getByRole('link', { name: 'My account' })).toBeVisible();
  await otherDevice.close();
});

test('an actually expired local magic link is denied by the provider and recovers', async ({
  page
}) => {
  const email = `expired-${Date.now()}@example.invalid`;

  await page.goto('/en');
  await waitForHydration(page);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  const authDialog = page.getByRole('dialog');
  await authDialog.getByLabel('Email address').fill(email);
  await authDialog.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(authDialog.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const magicLink = await waitForLocalMagicLink(email);
  await expireLocalMagicLink(email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(/\/en\?.*auth=open.*authStatus=link_invalid/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a Moderator retains the ordinary private Member account experience', async ({ page }) => {
  await provisionLocalModerator(evaluationModerator.email);
  await clearLocalEvaluationMailbox();
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await expect(page).toHaveURL(/\/en\/moderation\?queue=suggestions(?:&|$)/);

  await page.getByRole('link', { name: 'My account' }).click();
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(evaluationModerator.email)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign-in identity' })).toBeVisible();

  await page.goto('/is/account');
  await expect(page.getByRole('heading', { name: 'Reikningurinn minn' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Opna umsjónarsvæði' })).toHaveAttribute(
    'href',
    '/is/moderation'
  );
});
