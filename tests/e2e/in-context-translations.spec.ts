import { expect, test, type Page } from '@playwright/test';

import {
  clearLocalEvaluationMailbox,
  provisionLocalInterfaceTranslationInventory,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const translationOwnerEmail = 'victor.val.mtz@gmail.com';

test.describe.configure({ timeout: 60_000 });

test.beforeAll(() => {
  provisionLocalInterfaceTranslationInventory();
});

test('ordinary Members receive no translation control, payload, or client module', async ({
  page
}) => {
  await signIn(page, `ordinary-translation-${Date.now()}@example.invalid`);

  await expect(page.getByRole('button', { name: 'Translate this page' })).toHaveCount(0);
  const contextStatus = await page.evaluate(async () =>
    fetch('/api/translations/context?pageId=%2Fabout').then((response) => response.status)
  );
  expect(contextStatus).toBe(403);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('/src/lib/translations/TranslationMode.svelte'))
    )
  ).toBe(false);
});

test('the translation owner edits, submits, and approves one page package without changing public copy', async ({
  page
}) => {
  await signIn(page, translationOwnerEmail);

  await expect(page.getByRole('button', { name: 'Translate this page' })).toBeVisible();
  await page.getByRole('button', { name: 'Translate this page' }).click();
  await expect(page.getByRole('toolbar', { name: 'Translation mode' })).toBeVisible();

  const aboutLink = page.locator('a[data-translation-key="nav.about"]');
  await expect(aboutLink).toHaveText('About');
  await page.getByRole('button', { name: 'Edit translation: nav.about' }).click();

  const panel = page.getByRole('complementary', { name: 'nav.about' });
  await expect(panel.getByRole('heading', { name: 'nav.about' })).toBeVisible();
  await panel.getByLabel('Icelandic').fill('Um Hundavænt');
  await panel.getByLabel('English').fill('About Hundavænt');
  await expect(panel.getByText('Saved', { exact: true })).toBeVisible();
  await expect(aboutLink).toHaveText('About');

  await panel.getByRole('button', { name: 'Submit page package' }).click();
  await expect(page.getByText('Package for /about submitted for review.')).toBeVisible();
  await page.getByRole('button', { name: 'Review packages (1)' }).click();
  await page.getByRole('button', { name: /\/about.*1 changes/ }).click();

  const reviewPanel = page.getByRole('complementary', { name: 'Submitted page packages' });
  await expect(reviewPanel.getByText('About Hundavænt')).toBeVisible();
  await reviewPanel.getByRole('button', { name: 'Approve complete package' }).click();
  await expect(page.getByRole('button', { name: 'Review packages (0)' })).toBeVisible();
  await expect(aboutLink).toHaveText('About');

  await page.getByRole('button', { name: 'Close review panel' }).click();
  await page.getByRole('button', { name: 'Edit translation: nav.about' }).click();
  await expect(page.getByText('Approved history')).toBeVisible();
  await expect(page.getByText(/Approved by victor\.val\.mtz@gmail\.com/)).toBeVisible();
  await page.screenshot({ path: 'test-results/in-context-translation-owner.png', fullPage: true });
});

async function signIn(page: Page, email: string): Promise<void> {
  await clearLocalEvaluationMailbox();
  await page.goto('/en/about');
  await waitForHydration(page);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
  await expect(page).toHaveURL('/en/about');
  await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();
}
