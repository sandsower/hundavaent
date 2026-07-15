import { expect, test } from '@playwright/test';

import { waitForHydration } from './support/hydration';

test.describe('public discovery locale routes', () => {
  test('redirects the root route to the Icelandic directory', async ({ page, request }) => {
    const redirectResponse = await request.get('/', { maxRedirects: 0 });
    const ssrResponse = await request.get('/is');

    expect(redirectResponse.status()).toBe(307);
    expect(redirectResponse.headers().location).toBe('/is');
    expect(await ssrResponse.text()).toContain('<html lang="is">');

    await page.goto('/is');

    await expect(page).toHaveURL(/\/is$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'is');
    await expect(page.getByRole('heading', { name: 'Hundavænt' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Staðir sem fundust' })).toBeVisible();
    await expect(page.getByText('Finndu hundvæna staði á höfuðborgarsvæðinu.')).toHaveCount(0);
  });

  test('renders the English directory from the server', async ({ page, request }) => {
    const ssrResponse = await request.get('/en');
    const html = await ssrResponse.text();
    const renderedHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    expect(html).toContain('<html lang="en">');
    expect(renderedHtml).toContain('Published Place');
    expect(renderedHtml).not.toContain('Candidate Place');
    expect(renderedHtml).not.toContain('Unverified Place');

    await page.goto('/en');

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Hundavænt' })).toBeVisible();
    await expect(page.getByText('Dog-friendly places', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Find dog-friendly places in the capital region.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/en/about');
    await expect(page.getByRole('link', { name: 'Log in / Register' })).toHaveAttribute(
      'href',
      '/en/account?returnTo=%2Fen'
    );
    const desktopResults = page.getByRole('region', { name: 'Places found' });
    await expect(
      desktopResults.getByRole('button', { name: 'Select Published Place' })
    ).toBeVisible();
    await expect(page.getByText('Candidate Place')).toHaveCount(0);
    await expect(page.getByText('Unverified Place')).toHaveCount(0);

    await page.getByRole('button', { name: 'Published Place', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Published Place' })).toHaveCount(0);

    await page.goto('/en/places/30000000-0000-4000-8000-000000000003');
    await expect(page).toHaveURL('/en?place=30000000-0000-4000-8000-000000000003');
    const selected = page.getByLabel('Selected place');
    await expect(selected.getByText('Published Place')).toBeVisible();
    await selected.getByText('Details', { exact: true }).click();
    await expect(selected.getByRole('heading', { name: 'Dog access' })).toBeVisible();
    await expect(selected.getByRole('link', { name: 'Website' })).toBeVisible();
    await expect(selected.getByRole('link', { name: 'Access information' })).toBeVisible();
    await expect(selected.getByText('Official Place website')).toHaveCount(0);
  });

  test('provides localized About and Member account entry points', async ({ page }) => {
    await page.goto('/en/about');
    await expect(page.getByRole('heading', { name: 'About Hundavænt' })).toBeVisible();
    await expect(page.getByText('More information is coming soon.')).toBeVisible();

    await page.goto('/is/account');
    await expect(page.getByRole('heading', { name: 'Velkomin á Hundavænt' })).toBeVisible();
    await expect(page.getByLabel('Netfang')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Senda innskráningartengil' })).toBeEnabled();
  });

  test('uses one map-first selected Place state across desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/en?view=map');
    await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'List' })).toHaveCount(0);
    await expect
      .poll(() => page.locator('.map-surface').evaluate((element) => element.clientHeight))
      .toBeGreaterThanOrEqual(620);
    const desktopMarker = page.getByRole('button', { name: 'Published Place', exact: true });
    await desktopMarker.click();
    await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
    await expect(page).toHaveURL(/place=30000000-0000-4000-8000-000000000003/);
    await expect(page).toHaveURL(/view=map/);
    await page.getByRole('button', { name: 'Close selected place' }).click();
    await expect(page.getByRole('complementary', { name: 'Selected place' })).toHaveCount(0);
    await expect(desktopMarker).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en?view=map');
    await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'List' })).toHaveCount(0);
    await expect
      .poll(() => page.locator('.map-surface').evaluate((element) => element.clientHeight))
      .toBeGreaterThanOrEqual(590);
    await page.getByRole('button', { name: 'Published Place', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
    await expect(page.locator('.selected-place-overlay')).toHaveCSS('position', 'fixed');
    await expect(page).toHaveURL(/view=map/);

    await page.goto(
      '/en?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=map'
    );
    await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Are dogs welcome?' })).toBeVisible();
  });

  test('shares combined discovery filters and selection across languages', async ({ page }) => {
    await page.goto('/en');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Show filters' }).click();
    await page.getByLabel('Place type').selectOption('outdoors');
    await page.getByRole('combobox', { name: 'Area', exact: true }).selectOption('Reykjavík');
    await page.getByLabel('Dog access area').selectOption('outdoors');
    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByLabel('Leash and restraint').selectOption('leash_required');
    await page.getByLabel('Permission').selectOption('standing_permission');
    await page.getByRole('searchbox', { name: 'Search for a place' }).fill('Reykjavík');

    await expect(page).toHaveURL(/category=outdoors/);
    await expect(page).toHaveURL(/area=Reykjav%C3%ADk/);
    await expect(page).toHaveURL(/access=outdoors/);
    await expect(page).toHaveURL(/q=Reykjav%C3%ADk/);
    await page.getByRole('button', { name: 'Hide filters' }).click();
    await page.getByRole('button', { name: 'Select Published Place' }).click();
    await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();

    await page.getByRole('link', { name: 'Íslenska' }).click();
    await expect(page).toHaveURL(/\/is\?/);
    await expect(page).toHaveURL(/category=outdoors/);
    await expect(page).toHaveURL(/q=Reykjav%C3%ADk/);
    await expect(page).toHaveURL(/place=30000000-0000-4000-8000-000000000003/);
    await expect(page.getByRole('complementary', { name: 'Valinn staður' })).toBeVisible();
  });

  test('supports no-results recovery and browser history without leaving the map', async ({
    page
  }) => {
    await page.goto('/en');
    await waitForHydration(page);
    await page.getByRole('searchbox', { name: 'Search for a place' }).fill('does not exist');
    await expect(page.getByText('No places match')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Search for a place' })).toHaveValue(
      'does not exist'
    );
    await expect(page.getByText('No places match')).toBeVisible();
  });

  test('explains denied geolocation and only retries after an explicit action', async ({
    page
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
            failure({
              code: 1,
              message: 'denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3
            })
        }
      });
    });
    await page.goto('/en');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Show filters' }).click();
    await expect(page.getByRole('button', { name: 'Hide filters' })).toBeVisible();
    await page.getByRole('button', { name: 'Use my location' }).click();

    await expect(page.getByText('Location is blocked in this browser.')).toBeVisible();
    await expect(page.getByText(/keep browsing manually/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toBeVisible();
    await page.reload();
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Show filters' }).click();
    await expect(page.getByRole('button', { name: 'Try location again' })).toBeVisible();
  });

  test('uses granted geolocation for distance without replacing the shareable camera', async ({
    page,
    context
  }) => {
    // No origin restriction so the grant follows the configured baseURL on any local port.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 64.0, longitude: -21.9426 });
    await page.goto('/en?lat=64.2&lng=-21.8&z=11&view=map');
    await waitForHydration(page);
    await page.getByRole('searchbox', { name: 'Search for a place' }).fill('Published Place');
    await page.getByRole('button', { name: 'Show filters' }).click();
    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByRole('button', { name: 'Use my location' }).click();

    await expect(page.getByText('Nearby search is ready.')).toBeVisible();
    await expect(page).toHaveURL(/distance=5/);
    await expect(page).toHaveURL(/lat=64.2/);
    await expect(page).toHaveURL(/lng=-21.8/);
    await expect(page).not.toHaveURL(/lat=64(?:\.0+)?(?:&|$)/);
    await expect(page).not.toHaveURL(/lng=-21.9426/);
    await page.getByRole('button', { name: 'Hide filters' }).click();
    await expect(page.getByText('No places match')).toBeVisible();

    await page.getByRole('button', { name: 'Show filters' }).click();
    await page.getByRole('combobox', { name: 'Distance' }).selectOption('25');
    await page.getByRole('button', { name: 'Hide filters' }).click();
    await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toBeVisible();
  });

  test('coordinates mobile filter and result sheets with focus restoration', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    await waitForHydration(page);

    await page.getByRole('button', { name: 'Show filters' }).click();
    await expect(page.getByRole('combobox', { name: 'Place type' })).toBeFocused();
    await page.getByRole('button', { name: /Show \d+ results?/ }).click();
    await expect(page.getByRole('combobox', { name: 'Place type' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close results' })).toBeFocused();

    await page.getByRole('button', { name: 'Show filters' }).click();
    await expect(page.getByRole('heading', { name: 'Places found' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Place type' })).toBeFocused();
    await page.getByRole('button', { name: 'Hide filters' }).click();
    await expect(page.getByRole('button', { name: 'Show filters' })).toBeFocused();

    const showResults = page.getByRole('button', { name: /Show \d+ results?/ });
    await showResults.click();
    await page.getByRole('button', { name: 'Close results' }).click();
    await expect(showResults).toBeFocused();
  });

  test('keeps the selected Place usable on a short landscape phone', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto(
      '/en?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=map'
    );

    const map = page.locator('.map-surface');
    const overlay = page.locator('.selected-place-overlay');
    await expect(map).toBeVisible();
    await expect(overlay).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close selected place' })).toBeVisible();
    const bounds = await overlay.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(250);
    expect(bounds?.width).toBeLessThanOrEqual(330);

    await page.getByText('Details', { exact: true }).click();
    const accessHeading = page.getByRole('heading', { name: 'Dog access' });
    await accessHeading.scrollIntoViewIfNeeded();
    await expect(accessHeading).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close selected place' })).toBeVisible();
  });
});

test.describe('public discovery without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps the server-rendered fallback directory reachable on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en');

    const fallbackDirectory = page.locator('.noscript-results');
    await expect(fallbackDirectory.getByRole('heading', { name: 'List' })).toBeVisible();
    await expect(fallbackDirectory.getByText('Published Place', { exact: true })).toBeVisible();

    const documentGeometry = await page.locator('html').evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    expect(documentGeometry.scrollHeight).toBeGreaterThan(documentGeometry.clientHeight);

    await fallbackDirectory.scrollIntoViewIfNeeded();
    await expect(fallbackDirectory).toBeInViewport();
  });
});
