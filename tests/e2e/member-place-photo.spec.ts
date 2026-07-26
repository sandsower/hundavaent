import { expect, test, type Locator, type Page } from '@playwright/test';

import { evaluationModerator } from '../evaluation/fixtures';
import {
  clearLocalEvaluationMailbox,
  clearLocalPlaceMedia,
  configureLocalMemberPhotoPolicy,
  localMemberPhotoFixture,
  provisionLocalMemberPhotoFixture,
  provisionLocalModerator,
  retireLocalMemberPhotoFixture,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

/**
 * A Member gives a photo, and it travels the whole distance: held for review, visible to its
 * uploader and to nobody else, found by a Moderator through the work list, approved with the
 * metadata the constraint demands, and served to anonymous readers - with the metadata it arrived
 * carrying gone from the bytes.
 *
 * The last assertion is the one this phase exists for. A photo taken on a phone carries GPS, an
 * approved photo is served verbatim to `anon`, and a Moderator reviews pixels rather than byte
 * ranges. Nothing downstream of the upload endpoint would ever catch an unstripped block, so it is
 * caught here, by fetching what the public actually receives and reading it.
 *
 * The file is built by the browser (a real JPEG from a real encoder) and given a real EXIF block,
 * so it can be both decodable at the far end and genuinely carrying a location at this one. Both
 * halves matter: a fixture nothing can decode would not prove the photo survives, and a fixture
 * with no metadata would not prove anything was removed.
 *
 * Runnable twice against one database: the fixture Place is upserted and its media is cleared
 * before the journey starts, and every Member is a fresh identity.
 */

const fixture = localMemberPhotoFixture;
const gpsMarker = 'GPS 64.1466 N 21.9426 W';
const publicAltText = `Photo of ${fixture.nameEn}`;

test.beforeAll(async () => {
  await provisionLocalModerator(evaluationModerator.email);
  await configureLocalMemberPhotoPolicy();
  provisionLocalMemberPhotoFixture();
  clearLocalPlaceMedia(fixture.placeId);
  await clearLocalEvaluationMailbox();
});

test.afterAll(() => {
  clearLocalPlaceMedia(fixture.placeId);
  retireLocalMemberPhotoFixture();
});

test('a Member photo is held for review, seen only by its uploader, and published stripped', async ({
  browser,
  page,
  request
}) => {
  // Two Members, a Moderator and an anonymous reader, each with their own sign-in round trip,
  // in one journey: the default per-test budget is for a single visit.
  test.setTimeout(120_000);
  const memberEmail = `place-photo-member-${Date.now()}@example.invalid`;
  await signInMember(page, memberEmail);

  // --- The affordance, and the photo. ---
  const selectedPlace = await openPlaceCard(page);
  await expect(
    selectedPlace.getByRole('button', { name: `Add a photo of ${fixture.nameEn}` })
  ).toBeVisible();

  const submission = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('/photos')
  );
  // The file that goes up is a real JPEG genuinely carrying the location, so the scan at the end
  // of this journey is a statement about the strip rather than about an empty fixture.
  const attached = await attachGeneratedJpeg(page);
  expect(attached.carriesMarker).toBe(true);
  expect(attached.byteLength).toBeGreaterThan(200);
  const submissionResponse = await submission;
  expect(submissionResponse.status(), await submissionResponse.text()).toBe(200);

  // The tile is the Member's own photo, read back through the uploader gateway: a signed URL
  // minted for an unapproved object, which no other reader can obtain.
  const pendingTile = selectedPlace.locator('[data-member-photo]');
  await expect(pendingTile).toHaveCount(1);
  await expect(pendingTile.locator('[data-photo-badge]')).toHaveText('Waiting for review');
  await expect(selectedPlace.locator('[data-photo-announcement]')).toHaveText(
    'Thank you. A Moderator will check your photo.'
  );
  const pendingImage = pendingTile.locator('img');
  await expect(pendingImage).toBeVisible();
  await expect
    .poll(async () =>
      pendingImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0);

  // --- Another Member sees a Place with no photos on it. ---
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signInMember(otherPage, `place-photo-other-${Date.now()}@example.invalid`);
  const otherPlace = await openPlaceCard(otherPage);
  await expect(otherPlace.locator('[data-member-photo]')).toHaveCount(0);
  await expect(otherPlace.getByText('Waiting for review')).toHaveCount(0);
  await expect(otherPlace.getByAltText(publicAltText)).toHaveCount(0);
  await otherContext.close();

  // --- A Moderator finds the Place through the work list and approves the photo. ---
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  await signInModerator(moderatorPage);
  await moderatorPage.goto('/en/moderation');
  await waitForHydration(moderatorPage);

  const pendingSection = moderatorPage.locator('[data-pending-photos]');
  await expect(pendingSection).toBeVisible();
  const workListEntry = pendingSection.locator(`[data-pending-photo-place="${fixture.placeId}"]`);
  await expect(workListEntry).toContainText(fixture.nameEn);
  await expect(workListEntry).toContainText('Photos waiting: 1');
  await workListEntry.click();
  await expect(moderatorPage).toHaveURL(`/en/moderation/places/${fixture.placeId}`);
  await waitForHydration(moderatorPage);

  const mediaSection = moderatorPage.locator('#candidate-media');
  await mediaSection.locator(':scope > summary').click();
  await expect(mediaSection).toHaveAttribute('open', '');
  const photoItem = moderatorPage
    .locator('[data-media-column="photo"] li[data-media-item]')
    .first();
  await expect(photoItem.getByText('Pending')).toBeVisible();
  await photoItem.getByLabel('People shown in the photo').selectOption('no_prominent_people');
  await photoItem.getByRole('button', { name: 'Publish photo' }).click();
  await expect(moderatorPage.getByText('Photo approved and published.')).toBeVisible();

  // Cleared work is work the list stops offering.
  await moderatorPage.goto('/en/moderation');
  await waitForHydration(moderatorPage);
  await expect(
    moderatorPage.locator(`[data-pending-photo-place="${fixture.placeId}"]`)
  ).toHaveCount(0);
  await moderatorContext.close();

  // --- The public sees the photo, and never sees where it was taken. ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`/en?place=${fixture.placeId}`);
  await waitForHydration(publicPage);
  const publicPlace = publicPage.getByRole('complementary', { name: 'Selected place' });
  const publicPhoto = publicPlace.getByAltText(publicAltText);
  await expect(publicPhoto).toBeVisible();
  await expect
    .poll(async () => publicPhoto.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const publicUrl = await publicPhoto.getAttribute('src');
  expect(publicUrl).toBeTruthy();
  await publicContext.close();

  const served = await request.get(publicUrl as string);
  expect(served.ok()).toBe(true);
  const bytes = await served.body();
  // A JPEG, still: the first two bytes are the start-of-image marker.
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  expect(bytes.length).toBeGreaterThan(100);
  expect(bytes.includes(Buffer.from('Exif', 'ascii'))).toBe(false);
  expect(bytes.includes(Buffer.from(gpsMarker, 'ascii'))).toBe(false);
});

/**
 * Encodes a real JPEG in the page, splices a real EXIF block carrying a location into it, and
 * hands it to the file input the affordance owns. Nothing binary lives in this repository; every
 * image fixture is generated by the test that needs it.
 */
async function attachGeneratedJpeg(
  page: Page
): Promise<{ byteLength: number; carriesMarker: boolean }> {
  return page.evaluate(async (marker: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser refused a 2d canvas context');
    context.fillStyle = '#2f6f5e';
    context.fillRect(0, 0, 64, 48);
    context.fillStyle = '#f2c14e';
    context.fillRect(8, 8, 24, 18);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!blob) throw new Error('This browser cannot encode image/jpeg');
    const encoded = new Uint8Array(await blob.arrayBuffer());

    const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0));
    const uint32LE = (value: number): number[] => [
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    ];
    const description = [...ascii(marker), 0x00];
    // "Exif\0\0", a little-endian TIFF header, and one ASCII entry whose data sits at TIFF
    // offset 26, immediately after the single-entry directory.
    const exif = [
      ...ascii('Exif'),
      0x00,
      0x00,
      ...ascii('II'),
      0x2a,
      0x00,
      0x08,
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x0e,
      0x01,
      0x02,
      0x00,
      ...uint32LE(description.length),
      ...uint32LE(26),
      0x00,
      0x00,
      0x00,
      0x00,
      ...description
    ];
    const carrying = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      (exif.length + 2) >> 8,
      (exif.length + 2) & 0xff,
      ...exif,
      ...encoded.subarray(2)
    ]);

    const picker = document.querySelector('[data-photo-picker]');
    if (!(picker instanceof HTMLInputElement)) throw new Error('The photo picker is not rendered');
    const transfer = new DataTransfer();
    transfer.items.add(new File([carrying], 'walk.jpg', { type: 'image/jpeg' }));
    picker.files = transfer.files;
    picker.dispatchEvent(new Event('change', { bubbles: true }));

    const markerBytes = ascii(marker);
    const carriesMarker = [...carrying].some((_value, start) =>
      markerBytes.every((byte, offset) => carrying[start + offset] === byte)
    );
    return { byteLength: carrying.length, carriesMarker };
  }, gpsMarker);
}

async function openPlaceCard(page: Page): Promise<Locator> {
  await page.goto(`/en?place=${fixture.placeId}`);
  await waitForHydration(page);
  const selectedPlace = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selectedPlace).toBeVisible();
  return selectedPlace;
}

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(email);
  await page.goto(magicLink);
}

async function signInModerator(page: Page): Promise<void> {
  await clearLocalEvaluationMailbox();
  await page.goto('/en/moderation/sign-in?returnTo=%2Fen%2Fmoderation');
  await waitForHydration(page);
  await page.locator('main').getByLabel('Email address').fill(evaluationModerator.email);
  await page.locator('main').getByRole('button', { name: 'Send sign-in link' }).click();
  const magicLink = await waitForLocalMagicLink(evaluationModerator.email);
  await page.goto(magicLink);
  await waitForHydration(page);
}
