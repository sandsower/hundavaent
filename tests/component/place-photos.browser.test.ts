import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import PlacePhotos from '$lib/discovery/PlacePhotos.svelte';

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
  isPrimary: true
};

describe('PlacePhotos', () => {
  it('renders nothing when there are no approved photos', () => {
    const { container } = render(PlacePhotos, {
      photos: [],
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    expect(container.querySelector('[data-photos-section]')).toBeNull();
  });

  it('renders an image with dimensions, lazy loading, and bilingual alt text', () => {
    render(PlacePhotos, {
      photos: [photo],
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
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    const gallery = container.querySelector('[data-photos-section]');
    expect(gallery?.classList.contains('hv-panel')).toBe(true);
    expect(gallery?.getAttribute('data-surface')).toBe('media-gallery');
    expect(container.querySelector('[data-photo-frame="image-led"]')).toBeTruthy();
  });

  it('uses the Icelandic alt text when rendered in Icelandic', () => {
    render(PlacePhotos, {
      photos: [photo],
      placeName: 'Útgefinn staður',
      lang: 'is',
      copy: catalogues.is
    });

    expect(screen.getByAltText('Hundur liggur á gólfi kaffihúss')).toBeTruthy();
  });

  it('falls back to a generated alt text when a localized description is blank', () => {
    render(PlacePhotos, {
      photos: [{ ...photo, altTextEn: '' }],
      placeName: 'Published Place',
      lang: 'en',
      copy: catalogues.en
    });

    expect(screen.getByAltText('Photo of Published Place')).toBeTruthy();
  });
});
