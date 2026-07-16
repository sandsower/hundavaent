import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import PlaceList from '$lib/discovery/PlaceList.svelte';

const places = [
  {
    placeId: '30000000-0000-4000-8000-000000000003',
    name: 'Published Place',
    category: 'park' as const,
    locality: 'Reykjavík',
    latitude: 64.1423,
    longitude: -21.9555,
    accessConditionCount: 1,
    simpleAccessSummary: true,
    accessArea: 'outdoors' as const,
    restraintCondition: 'leash_required' as const,
    permissionRequirement: 'standing_permission' as const,
    accessConditions: [
      {
        accessArea: 'outdoors' as const,
        restraintCondition: 'leash_required' as const,
        permissionRequirement: 'standing_permission' as const
      }
    ],
    primaryPhoto: null,
    verifiedAt: '2026-07-09T11:00:00.000Z'
  },
  {
    placeId: '30000000-0000-4000-8000-000000000004',
    name: 'Second Place',
    category: 'cafe' as const,
    locality: 'Kópavogur',
    latitude: 64.111,
    longitude: -21.907,
    accessConditionCount: 1,
    simpleAccessSummary: true,
    accessArea: 'indoors' as const,
    restraintCondition: 'leash_required' as const,
    permissionRequirement: 'ask_on_arrival' as const,
    accessConditions: [
      {
        accessArea: 'indoors' as const,
        restraintCondition: 'leash_required' as const,
        permissionRequirement: 'ask_on_arrival' as const
      }
    ],
    primaryPhoto: {
      mediaId: '40000000-0000-4000-8000-000000000004',
      url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%238ba9a0"/%3E%3C/svg%3E',
      widthPx: 400,
      heightPx: 300,
      altTextIs: 'Hundur á kaffihúsi',
      altTextEn: 'A dog at a cafe',
      rightsBasis: 'cc_by' as const,
      sourceUrl: 'https://photos.example.invalid/cafe',
      licenseReference: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attributionText: 'A. Photographer',
      attributionUrl: null,
      urlExpiresAt: '2099-01-01T00:00:00.000Z'
    },
    verifiedAt: '2026-07-09T12:00:00.000Z'
  }
];

describe('PlaceList', () => {
  it('renders a semantic localized list without leaving the map for a separate details view', () => {
    render(PlaceList, {
      places,
      selectedPlaceId: null,
      lang: 'en',
      copy: catalogues.en,
      onSelect: vi.fn(),
      signInHref: (placeId) => `/en/account?returnTo=%2Fen%3Ffavourite%3D${placeId}`
    });

    expect(screen.getByRole('list', { name: 'List' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/Park or outdoor area/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in to save Published Place' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in to save Second Place' })).toBeTruthy();
  });

  it('uses the north-star media header for both approved photos and photo fallbacks', () => {
    const { container } = render(PlaceList, {
      places,
      selectedPlaceId: null,
      lang: 'en',
      copy: catalogues.en,
      onSelect: vi.fn()
    });

    const fallback = container.querySelector<HTMLElement>('[data-place-card-media="category-band"]');
    const photo = container.querySelector<HTMLElement>('[data-place-card-media="photo"]');
    const image = screen.getByRole('img', { name: 'A dog at a cafe' });

    expect(fallback).toBeTruthy();
    expect(photo).toBeTruthy();
    expect(screen.getByText('Outdoor place · Park')).toBeTruthy();
    expect(screen.getByText('Indoor place · Café')).toBeTruthy();
    expect(getComputedStyle(fallback!).backgroundImage).toContain('linear-gradient');
    expect(image.getBoundingClientRect().height).toBeCloseTo(83.2, 0);
    expect(image.closest('[data-place-card-media]')).toBe(photo);
  });

  it('replaces an unavailable approved photo with the north-star fallback band', async () => {
    const { container } = render(PlaceList, {
      places: [places[1]],
      selectedPlaceId: null,
      lang: 'en',
      copy: catalogues.en,
      onSelect: vi.fn()
    });

    await fireEvent.error(screen.getByRole('img', { name: 'A dog at a cafe' }));

    expect(container.querySelector('[data-place-card-media="photo"]')).toBeNull();
    expect(container.querySelector('[data-place-card-media="category-band"]')).toBeTruthy();
  });

  it('exposes selected state and activates through keyboard semantics', async () => {
    const onSelect = vi.fn();
    render(PlaceList, {
      places,
      selectedPlaceId: places[0].placeId,
      lang: 'en',
      copy: catalogues.en,
      onSelect
    });

    const first = screen.getByRole('button', { name: 'Select Published Place' });
    const second = screen.getByRole('button', { name: 'Select Second Place' });

    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('false');
    second.focus();
    await fireEvent.keyDown(second, { key: 'Enter' });
    await fireEvent.click(second);
    expect(onSelect).toHaveBeenLastCalledWith(places[1].placeId, second);
  });

  it('focuses the selected card when focus intent is explicit', async () => {
    render(PlaceList, {
      places,
      selectedPlaceId: places[1].placeId,
      lang: 'en',
      focusSelected: true,
      copy: catalogues.en,
      onSelect: vi.fn()
    });

    const selected = screen.getByRole('button', { name: 'Select Second Place' });
    await waitFor(() => expect(document.activeElement).toBe(selected));
  });
});
