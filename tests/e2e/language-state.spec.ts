import { expect, test } from '@playwright/test';

import { waitForHydration } from './support/hydration';

const placeId = '30000000-0000-4000-8000-000000000003';
const query = `place=${placeId}&lat=64.1423&lng=-21.9555&z=13&view=map`;

test('locale switching preserves selected-place map discovery context', async ({ page }) => {
  await page.goto(`/en?${query}`);
  await waitForHydration(page);
  await page.getByRole('link', { name: 'Íslenska' }).click();
  await expect(page).toHaveURL(`/is?${query}`);
  await expect(page.getByRole('heading', { name: 'Hundavænt' })).toBeVisible();

  await page.goto(`/is?${query}#access`);
  await waitForHydration(page);
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(`/en?${query}#access`);
  await expect(page.getByLabel('Selected place').getByText('Published Place')).toBeVisible();
});
