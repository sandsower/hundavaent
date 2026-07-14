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
    verifiedAt: '2026-07-09T12:00:00.000Z'
  }
];

describe('PlaceList', () => {
  it('renders a semantic localized list without leaving the map for a separate details view', () => {
    render(PlaceList, {
      places,
      selectedPlaceId: null,
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

  it('exposes selected state and activates through keyboard semantics', async () => {
    const onSelect = vi.fn();
    render(PlaceList, {
      places,
      selectedPlaceId: places[0].placeId,
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
      focusSelected: true,
      copy: catalogues.en,
      onSelect: vi.fn()
    });

    const selected = screen.getByRole('button', { name: 'Select Second Place' });
    await waitFor(() => expect(document.activeElement).toBe(selected));
  });
});
