import { expect, test } from '@playwright/test';

test('map failure preserves the complete localized Place list', async ({ page }) => {
  await page.goto('/en?__mapFailure=1&view=map');

  await expect(
    page.getByRole('heading', { name: 'The map is unavailable right now' })
  ).toBeVisible();
  await expect(page.getByText('You can still browse every place in the list.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Published Place' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Published Place' })).toHaveCount(0);
  const fallbackResult = page.getByRole('button', { name: 'Select Published Place' });
  await fallbackResult.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close selected place' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(fallbackResult).toBeFocused();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'The map is unavailable right now' })
  ).toBeVisible();
});
