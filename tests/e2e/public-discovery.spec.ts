import { expect, test } from '@playwright/test';

import { waitForHydration } from './support/hydration';
import { waitForLocalMagicLink } from './support/local-supabase';

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
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
      'href',
      '/en/account?returnTo=%2Fen'
    );
    const desktopResults = page.getByRole('region', { name: 'Places found' });
    await expect(
      desktopResults.getByRole('button', { name: 'Select Published Place' })
    ).toBeVisible();
    await expect(
      desktopResults
        .getByLabel('Published Place', { exact: true })
        .getByText('Accessibility unknown')
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
    await expect(selected.getByRole('heading', { name: 'Mobility access' })).toBeVisible();
    await expect(selected.getByText('Accessibility unknown')).toBeVisible();
    await expect(selected.getByText('Place details', { exact: true })).toBeVisible();
    await expect(selected.getByRole('heading', { name: 'Dog access' })).toHaveCount(0);
    await expect(selected.getByText('Last verified')).toHaveCount(0);
    await selected.getByText('Place details', { exact: true }).click();
    await expect(selected.getByRole('heading', { name: 'Dog access' })).toBeVisible();
    await expect(selected.getByRole('heading', { name: 'Opening hours' })).toBeVisible();
    await expect(selected.getByRole('heading', { name: 'Dog amenities' })).toBeVisible();
    await expect(selected.getByText('Condition 1')).toHaveCount(0);
    await expect(selected.getByRole('link', { name: 'Website' })).toBeVisible();
    await expect(selected.getByRole('link', { name: 'Correct this' })).toHaveCount(0);
    await expect(selected.getByRole('link', { name: 'Report a problem' })).toHaveCount(0);
    await expect(selected.getByRole('link', { name: 'Access information' })).toHaveCount(0);
    await expect(selected.getByText('Official Place website')).toHaveCount(0);
  });

  test('keeps the mobile brand, menu, and account action on one unclipped row', async ({
    page
  }) => {
    test.setTimeout(30_000);

    const expectHeaderControlsToFit = async () => {
      const header = page.locator('.site-header');
      const controls = [
        header.locator('.brand h1'),
        header.locator('.mobile-menu > summary'),
        header.locator('.account-link')
      ];
      const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
      expect(boxes.every(Boolean)).toBe(true);
      const visibleBoxes = boxes.map((box) => box!);
      const centreLines = visibleBoxes.map((box) => box.y + box.height / 2);
      const headerBox = (await header.boundingBox())!;

      expect(Math.max(...centreLines) - Math.min(...centreLines)).toBeLessThanOrEqual(2);
      expect(headerBox.height).toBeLessThanOrEqual(72);
      for (let index = 0; index < visibleBoxes.length - 1; index += 1) {
        expect(visibleBoxes[index].x + visibleBoxes[index].width).toBeLessThanOrEqual(
          visibleBoxes[index + 1].x
        );
      }
      expect(visibleBoxes.at(-1)!.x + visibleBoxes.at(-1)!.width).toBeLessThanOrEqual(
        headerBox.x + headerBox.width
      );
    };

    for (const { lang, width } of [
      { lang: 'en', width: 390 },
      { lang: 'is', width: 320 }
    ] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${lang}`);
      await waitForHydration(page);

      await expectHeaderControlsToFit();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
    }

    const email = `mobile-header-${Date.now()}@example.invalid`;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/is');
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Skrá inn', exact: true }).click();
    const authDialog = page.getByRole('dialog');
    await authDialog.getByLabel('Netfang').fill(email);
    await authDialog.getByRole('button', { name: 'Senda mér innskráningartengil' }).click();
    await page.goto(await waitForLocalMagicLink(email));
    await waitForHydration(page);
    await expect(page.getByRole('link', { name: 'Reikningurinn minn' })).toBeVisible();
    await expectHeaderControlsToFit();
  });

  test('keeps every mobile place detail reachable inside the compact sheet', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(
      '/is?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=map'
    );

    const selectedPlace = page.getByRole('complementary', { name: 'Valinn staður' });
    await selectedPlace.getByText('Upplýsingar um staðinn', { exact: true }).click();
    const scrollBody = selectedPlace.locator('[data-card-scroll-body]');
    const geometry = await scrollBody.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));

    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    const finalDetail = selectedPlace.locator('.place-links a');
    await finalDetail.scrollIntoViewIfNeeded();
    await expect(finalDetail).toBeInViewport();
    expect(await scrollBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(
      selectedPlace.getByRole('button', { name: 'Loka upplýsingum um valinn stað' })
    ).toBeVisible();
  });

  test('renders the full north-star media header when a result has no approved photo', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/en');
    await waitForHydration(page);

    const card = page.locator('[data-place-card]').filter({ hasText: 'Published Place' });
    const media = card.locator('[data-place-card-media="category-band"]');

    await expect(card).toBeVisible();
    await expect(media).toBeVisible();
    await expect(media).toHaveCSS('min-height', '83.2px');
    await expect(media).toHaveCSS('background-image', /linear-gradient/);
    await expect(card.getByText('Outdoor place · Park')).toBeVisible();
    const dogAccessBox = await card
      .getByRole('group', { name: 'Dog access at Published Place' })
      .boundingBox();
    const wheelchairBadgeBox = await card
      .locator('[data-wheelchair-accessibility="unknown"]')
      .boundingBox();
    expect(dogAccessBox).not.toBeNull();
    expect(wheelchairBadgeBox).not.toBeNull();
    expect(wheelchairBadgeBox!.y).toBeGreaterThanOrEqual(dogAccessBox!.y + dogAccessBox!.height);
    await expect(card.getByRole('img')).toHaveCount(0);
  });

  test('tells the localized About story and links into discovery and contribution', async ({
    page
  }) => {
    await page.goto('/en/about');

    await expect(
      page.getByRole('heading', { name: 'We wanted to bring Miles with us.' })
    ).toBeVisible();
    await expect(page.getByAltText('Vic holding Miles, a long-haired dachshund')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Most of the useful information travels only by word of mouth.'
      })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dog Access' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dog-Friendliness' })).toBeVisible();
    const englishBrowseLinks = page.getByRole('link', { name: 'Browse the map' });
    await expect(englishBrowseLinks).toHaveCount(2);
    await expect(englishBrowseLinks.first()).toHaveAttribute('href', '/en');
    await expect(englishBrowseLinks.last()).toHaveAttribute('href', '/en');
    await expect(page.getByRole('link', { name: 'Suggest a place' })).toHaveAttribute(
      'href',
      '/en/suggest'
    );
    await expect(page.getByRole('link', { name: 'Reykjavík dog rules history' })).toHaveAttribute(
      'href',
      'https://www.hundasamur.is/greinar1/hundahald-i-ettbyli'
    );
    await expect(page.getByRole('link', { name: 'Strætó pet rules' })).toHaveAttribute(
      'href',
      'https://www.straeto.is/notendaupplysingar/gaeludyr-i-straeto'
    );
    await expect(page.getByRole('link', { name: 'Kringlan dog policy' })).toHaveAttribute(
      'href',
      'https://www.kringlan.is/frettir/smahundar-a-sunnudogum'
    );

    await page.goto('/is/about');
    await expect(
      page.getByRole('heading', { name: 'Okkur langaði að taka Miles með.' })
    ).toBeVisible();
    await expect(page.getByAltText('Vic heldur á Miles, síðhærðum dachshundi')).toBeVisible();
    const icelandicBrowseLinks = page.getByRole('link', { name: 'Skoða kortið' });
    await expect(icelandicBrowseLinks).toHaveCount(2);
    await expect(icelandicBrowseLinks.first()).toHaveAttribute('href', '/is');
    await expect(icelandicBrowseLinks.last()).toHaveAttribute('href', '/is');
    await expect(page.getByRole('link', { name: 'Leggja til stað' })).toHaveAttribute(
      'href',
      '/is/suggest'
    );
  });

  test('provides a localized Member account entry point', async ({ page }) => {
    await page.goto('/is/account');
    await expect(page).toHaveURL('/is?auth=open&authReturnTo=%2Fis');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Halda áfram með Hundavænt' })).toBeVisible();
    await expect(dialog.getByLabel('Netfang')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Senda mér innskráningartengil' })
    ).toBeEnabled();
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
    await expect(page.locator('.maplibregl-ctrl-top-right')).toHaveCSS('visibility', 'hidden');
    expect(
      (await page.locator('.selected-place-overlay').boundingBox())?.height
    ).toBeLessThanOrEqual(550);
    await expect(page).toHaveURL(/view=map/);

    await page.goto(
      '/en?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=map'
    );
    const mobilePlace = page.getByRole('complementary', { name: 'Selected place' });
    await expect(mobilePlace).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Are dogs welcome?' })).toBeVisible();
    await mobilePlace.getByText('Place details', { exact: true }).click();
    const finalDetail = mobilePlace.getByRole('link', { name: 'Website' });
    await finalDetail.scrollIntoViewIfNeeded();
    await expect(finalDetail).toBeInViewport();
    await expect(mobilePlace.getByRole('button', { name: 'Close selected place' })).toBeVisible();
  });

  test('shares combined discovery filters and selection across languages', async ({ page }) => {
    await page.goto('/en');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByRole('combobox', { name: 'Place type' }).selectOption('outdoors');
    await page.getByRole('combobox', { name: 'Area', exact: true }).selectOption('Reykjavík');
    await page.getByLabel('Dog access area').selectOption('outdoors');
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
    await page.getByRole('button', { name: 'More filters' }).click();
    await expect(page.getByRole('button', { name: 'Hide filters' })).toBeVisible();
    await page.getByRole('button', { name: 'Use my location' }).click();

    await expect(page.getByText('Location is blocked in this browser.')).toBeVisible();
    await expect(page.getByText(/keep browsing manually/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toBeVisible();
    await page.reload();
    await waitForHydration(page);
    await page.getByRole('button', { name: 'More filters' }).click();
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

    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByRole('combobox', { name: 'Distance' }).selectOption('25');
    await page.getByRole('button', { name: 'Hide filters' }).click();
    await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toBeVisible();
  });

  test('coordinates mobile filter and result sheets with focus restoration', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    await waitForHydration(page);

    await page.getByRole('button', { name: 'More filters' }).click();
    await expect(page.getByRole('combobox', { name: 'Place type' })).toBeFocused();
    await page.getByRole('button', { name: /Show \d+ results?/ }).click();
    await expect(page.getByRole('combobox', { name: 'Place type' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close results' })).toBeFocused();

    await page.getByRole('button', { name: 'More filters' }).click();
    await expect(page.getByRole('heading', { name: 'Places found' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Place type' })).toBeFocused();
    await page.getByRole('button', { name: 'Hide filters' }).click();
    await expect(page.getByRole('button', { name: 'More filters' })).toBeFocused();

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

    await page.getByText('Place details', { exact: true }).click();
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
