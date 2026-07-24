import { describe, expect, it } from 'vitest';

import {
  defaultCameraForPlaces,
  defaultDiscoveryState,
  isChipActive,
  parseDiscoveryState,
  serializeDiscoveryState,
  toggleChip,
  viewAfterQueryChange
} from '$lib/discovery/state';

describe('discovery URL state', () => {
  it('parses selected Place, camera, zoom, and view mode', () => {
    const params = new URLSearchParams({
      place: '30000000-0000-4000-8000-000000000003',
      lat: '64.1423',
      lng: '-21.9555',
      z: '13.5',
      view: 'list',
      q: 'kaffi miðbær',
      category: 'food_drink',
      area: 'Reykjavík',
      access: 'indoors',
      restraint: 'leash_required',
      permission: 'ask_on_arrival',
      distance: '5',
      favorites: '1'
    });

    expect(parseDiscoveryState(params)).toEqual({
      selectedPlaceId: '30000000-0000-4000-8000-000000000003',
      camera: { latitude: 64.1423, longitude: -21.9555, zoom: 13.5 },
      view: 'list',
      filters: {
        query: 'kaffi miðbær',
        category: 'food_drink',
        area: 'Reykjavík',
        accessArea: 'indoors',
        restraintCondition: 'leash_required',
        permissionRequirement: 'ask_on_arrival',
        distanceKm: 5,
        favoritesOnly: true
      }
    });
  });

  it('falls back independently for invalid and out-of-range input', () => {
    const params = new URLSearchParams({
      place: 'not-a-place',
      lat: 'north',
      lng: '181',
      z: '50',
      view: 'unknown',
      category: 'veterinary',
      access: 'everywhere',
      restraint: 'none',
      permission: 'always',
      distance: '500',
      favorites: 'yes'
    });

    expect(parseDiscoveryState(params)).toEqual(defaultDiscoveryState);
  });

  it('centres an initial camera on the available Places', () => {
    const camera = defaultCameraForPlaces([
      { latitude: 64.12838244934707, longitude: -21.84002879647739 }
    ]);

    expect(camera).toEqual({
      latitude: 64.12838244934707,
      longitude: -21.84002879647739,
      zoom: 12
    });
    expect(parseDiscoveryState(new URLSearchParams('view=map'), camera).camera).toEqual(camera);
  });

  it('frames a spread of Places while explicit URL camera values still win', () => {
    const camera = defaultCameraForPlaces([
      { latitude: 64.08, longitude: -22.02 },
      { latitude: 64.2, longitude: -21.72 }
    ]);

    expect(camera.latitude).toBe(64.14);
    expect(camera.longitude).toBeCloseTo(-21.87);
    expect(camera.zoom).toBeGreaterThanOrEqual(8);
    expect(camera.zoom).toBeLessThan(11);
    expect(
      parseDiscoveryState(new URLSearchParams('lat=64.15&lng=-21.94&z=13'), camera).camera
    ).toEqual({ latitude: 64.15, longitude: -21.94, zoom: 13 });
  });

  it('serializes canonically with stable order and bounded precision', () => {
    const state = {
      selectedPlaceId: '30000000-0000-4000-8000-000000000003',
      camera: {
        latitude: 64.14234567,
        longitude: -21.95554321,
        zoom: 13.456
      },
      view: 'map' as const,
      filters: {
        query: '  Café  ',
        category: 'food_drink' as const,
        area: 'Reykjavík',
        accessArea: 'indoors' as const,
        restraintCondition: 'leash_required' as const,
        permissionRequirement: 'standing_permission' as const,
        distanceKm: 3 as const,
        favoritesOnly: true
      }
    };

    expect(serializeDiscoveryState(state).toString()).toBe(
      'place=30000000-0000-4000-8000-000000000003&lat=64.14235&lng=-21.95554&z=13.46&view=map&q=Caf%C3%A9&category=food_drink&area=Reykjav%C3%ADk&access=indoors&restraint=leash_required&permission=standing_permission&distance=3&favorites=1'
    );
  });

  it('round-trips canonical state without drift', () => {
    const state = parseDiscoveryState(new URLSearchParams('lat=64.15&lng=-21.94&z=12&view=list'));

    expect(parseDiscoveryState(serializeDiscoveryState(state))).toEqual(state);
  });
});

describe('chip-driven list toggling', () => {
  it('opens the list with the chosen slice from a quiet map', () => {
    expect(toggleChip({ view: 'map', category: null, query: '' }, 'food_drink')).toEqual({
      category: 'food_drink',
      query: '',
      view: 'list'
    });
    expect(toggleChip({ view: 'map', category: null, query: '' }, 'all')).toEqual({
      category: null,
      query: '',
      view: 'list'
    });
  });

  it('dismisses the filter and the list together on the active chip', () => {
    expect(toggleChip({ view: 'list', category: 'food_drink', query: '' }, 'food_drink')).toEqual({
      category: null,
      query: '',
      view: 'map'
    });
    expect(toggleChip({ view: 'list', category: null, query: '' }, 'all')).toEqual({
      category: null,
      query: '',
      view: 'map'
    });
  });

  it('returns to a clean arrival even when a search narrowed the slice', () => {
    expect(
      toggleChip({ view: 'list', category: 'food_drink', query: 'kaffi' }, 'food_drink')
    ).toEqual({ category: null, query: '', view: 'map' });
  });

  it('swaps the slice in place and keeps a narrowing query on category chips', () => {
    expect(
      toggleChip({ view: 'list', category: 'food_drink', query: 'kaffi' }, 'shopping')
    ).toEqual({ category: 'shopping', query: 'kaffi', view: 'list' });
    expect(toggleChip({ view: 'list', category: 'food_drink', query: 'kaffi' }, 'all')).toEqual({
      category: null,
      query: '',
      view: 'list'
    });
  });

  it('reopens a folded slice from its active chip instead of clearing it', () => {
    expect(isChipActive({ view: 'map', category: 'food_drink', query: '' }, 'food_drink')).toBe(
      true
    );
    expect(toggleChip({ view: 'map', category: 'food_drink', query: '' }, 'food_drink')).toEqual({
      category: 'food_drink',
      query: '',
      view: 'list'
    });
    expect(toggleChip({ view: 'list', category: 'food_drink', query: '' }, 'food_drink')).toEqual({
      category: null,
      query: '',
      view: 'map'
    });
  });

  it('treats "All" as active only while the unfiltered, unsearched list is open', () => {
    expect(isChipActive({ view: 'list', category: null, query: '' }, 'all')).toBe(true);
    expect(isChipActive({ view: 'map', category: null, query: '' }, 'all')).toBe(false);
    expect(isChipActive({ view: 'list', category: null, query: 'kaffi' }, 'all')).toBe(false);
    expect(isChipActive({ view: 'list', category: 'food_drink', query: '' }, 'all')).toBe(false);
    expect(isChipActive({ view: 'list', category: 'food_drink', query: '' }, 'food_drink')).toBe(
      true
    );
  });

  it('lets search open the list and closes it only when no slice remains', () => {
    expect(viewAfterQueryChange('kaffi', null, 'map')).toBe('list');
    expect(viewAfterQueryChange('kaffi', 'food_drink', 'map')).toBe('list');
    expect(viewAfterQueryChange('', 'food_drink', 'list')).toBe('list');
    expect(viewAfterQueryChange('', null, 'list')).toBe('map');
    expect(viewAfterQueryChange('   ', null, 'list')).toBe('map');
  });
});
