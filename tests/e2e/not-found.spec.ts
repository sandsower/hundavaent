import { expect, test } from '@playwright/test';

test('an unknown localized path renders the branded 404 page', async ({ page }) => {
  const response = await page.goto('/is/this-page-does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Síðan fannst ekki' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Til baka í staðaleit' })).toHaveAttribute(
    'href',
    '/is'
  );

  const englishResponse = await page.goto('/en/this-page-does-not-exist');

  expect(englishResponse?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to place search' })).toHaveAttribute(
    'href',
    '/en'
  );
});

test('an unknown path outside the locale tree renders the branded root 404 page', async ({
  page
}) => {
  const response = await page.goto('/this-page-does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Síðan fannst ekki' })).toBeVisible();
  await expect(page.getByText('Page not found.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hundavænt' })).toHaveAttribute('href', '/is');
});
