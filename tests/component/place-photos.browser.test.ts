import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import PlacePhotos from '$lib/discovery/PlacePhotos.svelte';

// PlacePhotos' root carries the Panel.svelte utility recipe directly (border-border-subtle
// rounded-panel bg-snow-raised shadow-raised) rather than the retired hv-panel class, so the
// panel-recipe pin below asserts computed style instead of a class name - the phase-2 precedent
// used for FavouriteControl/Button. app.css is the app's real CSS entrypoint and pulls in both
// the plain --hv-* custom properties (tokens.css) and the Tailwind utility layer the recipe is
// built from, the same way button.browser.test.ts and access-symbols.browser.test.ts already
// load it for their own computed-style assertions.
import '../../src/app.css';

const placeId = '79300000-0000-4000-8000-000000000001';
const photo = {
  mediaId: 'media-photo-approved',
  url: 'https://example.invalid/signed/photo-approved.jpg',
  widthPx: 1600,
  heightPx: 1200,
  altTextIs: 'Hundur liggur á gólfi kaffihúss',
  altTextEn: 'A dog lies on a cafe floor',
  rightsBasis: 'cc_by' as const,
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Published_Place.jpg',
  licenseReference: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attributionText: 'Published Place by A. Photographer, CC BY 4.0',
  attributionUrl: 'https://commons.wikimedia.org/wiki/User:Photographer',
  isPrimary: true,
  urlExpiresAt: '2099-01-01T00:00:00.000Z'
};

describe('PlacePhotos', () => {
  it('renders nothing when there are no approved photos', () => {
    const { container } = render(PlacePhotos, {
      photos: [],
      placeId,
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    expect(container.querySelector('[data-photos-section]')).toBeNull();
  });

  it('renders an image with dimensions, lazy loading, and bilingual alt text', () => {
    render(PlacePhotos, {
      photos: [photo],
      placeId,
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    const image = screen.getByAltText('A dog lies on a cafe floor') as HTMLImageElement;
    expect(image.src).toBe(photo.url);
    // The width/height HTML attributes (not the CSS-rendered layout size) are what reserve
    // aspect-ratio space and prevent layout shift, so assert on the attributes directly.
    expect(image.getAttribute('width')).toBe('1600');
    expect(image.getAttribute('height')).toBe('1200');
    expect(image.loading).toBe('lazy');
    expect(screen.getByText(photo.attributionText)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Photo source' }).getAttribute('href')).toBe(
      photo.attributionUrl
    );
    expect(screen.getByRole('link', { name: 'CC BY 4.0' }).getAttribute('href')).toBe(
      photo.licenseUrl
    );
    expect(image.closest('figure')?.hasAttribute('data-primary-photo')).toBe(true);
  });

  it('exposes an image-led media surface using the shared panel vocabulary', () => {
    const { container } = render(PlacePhotos, {
      photos: [photo],
      placeId,
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    const gallery = container.querySelector<HTMLElement>('[data-photos-section]');
    expect(gallery).toBeTruthy();
    // The panel-recipe pin: PlacePhotos' root wears Panel.svelte's utility recipe directly
    // rather than the retired hv-panel class, so this asserts the raised panel surface actually
    // renders (non-none shadow, non-zero radius) rather than checking for a class name.
    const style = getComputedStyle(gallery!);
    expect(style.boxShadow).not.toBe('none');
    expect(Number.parseFloat(style.borderRadius)).toBeGreaterThan(0);
    expect(gallery?.getAttribute('data-surface')).toBe('media-gallery');
    expect(container.querySelector('[data-photo-frame="image-led"]')).toBeTruthy();
  });

  it('reduces the selected-place treatment to one primary featured image', () => {
    const secondaryPhoto = {
      ...photo,
      mediaId: 'media-photo-secondary',
      url: 'https://example.invalid/signed/photo-secondary.jpg',
      isPrimary: false
    };
    const { container } = render(PlacePhotos, {
      photos: [secondaryPhoto, photo],
      placeId,
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en,
      featured: true
    });

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.src).toBe(photo.url);
    const surface = container.querySelector<HTMLElement>('[data-surface="featured-media"]');
    const heading = container.querySelector<HTMLElement>('#place-photos-heading');
    expect(surface).toBeTruthy();
    expect(getComputedStyle(surface!).marginTop).toBe('0px');
    expect(getComputedStyle(surface!).paddingTop).toBe('0px');
    expect(getComputedStyle(surface!).borderTopWidth).toBe('0px');
    expect(getComputedStyle(heading!).position).toBe('absolute');
    expect(getComputedStyle(heading!).width).toBe('1px');
  });

  it('uses the Icelandic alt text when rendered in Icelandic', () => {
    render(PlacePhotos, {
      photos: [photo],
      placeId,
      placeName: 'Útgefinn staður',
      lang: 'is',
      copy: catalogues.is
    });

    expect(screen.getByAltText('Hundur liggur á gólfi kaffihúss')).toBeTruthy();
  });

  it('falls back to a generated alt text when a localized description is blank', () => {
    render(PlacePhotos, {
      photos: [{ ...photo, altTextEn: '' }],
      placeId,
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    expect(screen.getByAltText('Photo of Published Place')).toBeTruthy();
  });
});
