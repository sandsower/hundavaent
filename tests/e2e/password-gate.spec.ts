import { expect, test } from '@playwright/test';

const gatedOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_GATE_PORT ?? '4174'}`;
const gatePassword = 'gate-test-password';

test.use({ baseURL: gatedOrigin });

test('a Visitor without the password is walled off and let in only by the correct one', async ({
  page
}) => {
  await page.goto('/is?view=map');

  await expect(page).toHaveURL('/gate?redirectTo=%2Fis%3Fview%3Dmap');
  await expect(page.getByRole('heading', { name: 'Hundavænt' })).toBeVisible();

  const passwordField = page.getByLabel('Lykilorð');
  await passwordField.fill('rangt-lykilord');
  await page.getByRole('button', { name: 'Opna' }).click();

  await expect(page.getByRole('alert')).toContainText('Rangt lykilorð');
  await expect(page).toHaveURL('/gate?redirectTo=%2Fis%3Fview%3Dmap');

  await passwordField.fill(gatePassword);
  await passwordField.press('Enter');

  await expect(page).toHaveURL('/is?view=map');

  await page.goto('/en');
  await expect(page).toHaveURL('/en');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('gated responses are never indexable', async ({ request }) => {
  const walled = await request.get('/is', { maxRedirects: 0 });
  expect(walled.status()).toBe(303);
  expect(walled.headers()['location']).toBe('/gate?redirectTo=%2Fis');
  expect(walled.headers()['x-robots-tag']).toBe('noindex, nofollow');

  const gatePage = await request.get('/gate');
  expect(gatePage.status()).toBe(200);
  expect(gatePage.headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(gatePage.headers()['cache-control']).toBe('private, no-store');
});

test('the health check stays reachable without a gate cookie', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.service).toBe('hundavaent');
});

test('an external redirect destination is discarded at the gate', async ({ page }) => {
  await page.goto('/gate?redirectTo=https%3A%2F%2Fattacker.example%2F');

  await page.getByLabel('Lykilorð').fill(gatePassword);
  await page.getByRole('button', { name: 'Opna' }).click();

  await expect(page).toHaveURL(`${gatedOrigin}/is`);
});
