import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import { createDomTestMapAdapter, type DomTestMapAdapter } from '$lib/map/dom-test-adapter';
import MapSurface from '$lib/map/MapSurface.svelte';
import SuggestionLocationPicker from '$lib/map/SuggestionLocationPicker.svelte';
import type { MapAdapter, MapCallbacks, MapCamera } from '$lib/map/types';

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
    ]
  }
];
const camera: MapCamera = { latitude: 64.1466, longitude: -21.9426, zoom: 11 };
const fallbackCamera: MapCamera = { latitude: 64.1466, longitude: -21.9426, zoom: 15 };

describe('shared Map interface', () => {
  it('renders markers, selection, attribution, and marker callbacks', async () => {
    const adapter = createDomTestMapAdapter();
    const onMarkerSelect = vi.fn();

    render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: places[0].placeId,
      camera,
      copy: catalogues.en,
      onMarkerSelect,
      onCameraChange: vi.fn()
    });

    const marker = await screen.findByRole('button', { name: 'Published Place' });
    expect(marker.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Map data: deterministic test adapter')).toBeTruthy();
    await fireEvent.click(marker);
    expect(onMarkerSelect).toHaveBeenCalledWith(places[0].placeId);
  });

  it('forwards camera changes from the adapter', async () => {
    const adapter: DomTestMapAdapter = createDomTestMapAdapter();
    const onCameraChange = vi.fn();

    render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange
    });

    await screen.findByRole('button', { name: 'Published Place' });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Map' }).getAttribute('data-paint-ready')).toBe(
        'true'
      )
    );
    const nextCamera = { latitude: 64.13, longitude: -21.9, zoom: 13 };
    adapter.simulateCameraChange(nextCamera);
    expect(onCameraChange).toHaveBeenCalledWith(nextCamera);
  });

  it('forwards an optional map point selection for Location picking', async () => {
    const adapter: DomTestMapAdapter = createDomTestMapAdapter();
    const onMapSelect = vi.fn();

    render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange: vi.fn(),
      onMapSelect
    });

    await screen.findByRole('button', { name: 'Published Place' });
    const point = { latitude: 64.15, longitude: -21.93 };
    adapter.simulateMapSelect(point);
    expect(onMapSelect).toHaveBeenCalledWith(point);
  });

  it('forwards an optional draggable marker movement for Location editing', async () => {
    const adapter: DomTestMapAdapter = createDomTestMapAdapter();
    const onMarkerMove = vi.fn();

    render(MapSurface, {
      adapter,
      places: [{ ...places[0], draggable: true }],
      selectedPlaceId: places[0].placeId,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onMarkerMove,
      onCameraChange: vi.fn()
    });

    await screen.findByRole('button', { name: 'Published Place' });
    const point = { latitude: 64.151, longitude: -21.931 };
    adapter.simulateMarkerMove(places[0].placeId, point);
    expect(onMarkerMove).toHaveBeenCalledWith(places[0].placeId, point);
  });

  it('forwards terminal cluster members for an accessible selection fallback', async () => {
    let mountedCallbacks: MapCallbacks | null = null;
    const onClusterSelect = vi.fn();
    const adapter: MapAdapter = {
      mount: vi.fn((_container, callbacks) => {
        mountedCallbacks = callbacks;
      }),
      setPlaces: vi.fn(),
      setSelectedPlace: vi.fn(),
      focusPlace: vi.fn(),
      setCamera: vi.fn(),
      destroy: vi.fn()
    };

    render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange: vi.fn(),
      onClusterSelect
    });

    await waitFor(() => expect(adapter.setPlaces).toHaveBeenCalled());
    const callbacks = mountedCallbacks as unknown as MapCallbacks;
    callbacks.onClusterSelect?.([places[0].placeId, 'another-place']);
    expect(onClusterSelect).toHaveBeenCalledWith([places[0].placeId, 'another-place']);
  });

  it('emits no coordinates until the Location is answered, and demands nothing while it waits', async () => {
    const adapter: DomTestMapAdapter = createDomTestMapAdapter();
    const { container } = render(SuggestionLocationPicker, {
      adapter,
      copy: catalogues.en,
      fallbackCamera
    });

    await screen.findByText('Map data: deterministic test adapter');
    // The fallback camera is where the map opens, never a fact the form carries.
    expect(container.querySelector('input[name="latitude"]')).toBeNull();
    expect(container.querySelector('input[name="longitude"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggested place' })).toBeNull();
    // The picker states no demand of its own. Sending is what the unanswered pin blocks, so the
    // page raises it as an alert at that moment rather than standing under the map from arrival.
    expect(screen.queryByText('Place the pin where the place is.')).toBeNull();

    adapter.simulateMapSelect({ latitude: 64.15, longitude: -21.93 });
    await waitFor(() =>
      expect(container.querySelector<HTMLInputElement>('input[name="latitude"]')?.value).toBe(
        '64.15'
      )
    );
    expect(container.querySelector<HTMLInputElement>('input[name="longitude"]')?.value).toBe(
      '-21.93'
    );
    expect(screen.queryByText('Place the pin where the place is.')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Suggested place' })).toBeTruthy();
  });

  it('supports pointer, keyboard-centre, and manual Location selection', async () => {
    const adapter: DomTestMapAdapter = createDomTestMapAdapter();
    render(SuggestionLocationPicker, {
      adapter,
      copy: catalogues.en,
      fallbackCamera,
      latitude: 64.1423,
      longitude: -21.9555
    });

    expect(screen.queryByLabelText('Latitude')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Enter coordinates instead' }));
    const latitude = screen.getByLabelText('Latitude') as HTMLInputElement;
    const longitude = screen.getByLabelText('Longitude') as HTMLInputElement;
    await screen.findByRole('button', { name: 'Suggested place' });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Map' }).getAttribute('data-paint-ready')).toBe(
        'true'
      )
    );
    expect(latitude.value).toBe('64.1423');
    expect(longitude.value).toBe('-21.9555');

    adapter.simulateMapSelect({ latitude: 64.15, longitude: -21.93 });
    await waitFor(() => expect(latitude.value).toBe('64.15'));
    expect(screen.getByRole('status').textContent).toContain('Location selected at 64.15, -21.93');

    await fireEvent.input(latitude, { target: { value: '64.16' } });
    await fireEvent.input(longitude, { target: { value: '-21.92' } });
    expect(latitude.value).toBe('64.16');
    expect(longitude.value).toBe('-21.92');

    adapter.simulateCameraChange({ latitude: 64.17, longitude: -21.91, zoom: 16 });
    const useMapCentre = screen.getByRole('button', { name: 'Use map centre' });
    await fireEvent.click(useMapCentre);
    expect(latitude.value).toBe('64.17');
    expect(longitude.value).toBe('-21.91');
  });

  it('ignores startup camera events until the initial camera is applied', async () => {
    const onCameraChange = vi.fn();
    const startupCamera = { latitude: 64.1, longitude: -21.8, zoom: 9 };
    const adapter: MapAdapter = {
      mount: vi.fn((_container, callbacks) => {
        callbacks.onCameraChange(startupCamera);
      }),
      setPlaces: vi.fn(),
      setSelectedPlace: vi.fn(),
      focusPlace: vi.fn(),
      setCamera: vi.fn(),
      destroy: vi.fn()
    };

    render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange
    });

    await waitFor(() =>
      expect(adapter.setCamera).toHaveBeenCalledWith(camera, {
        duration: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 }
      })
    );
    expect(onCameraChange).not.toHaveBeenCalled();
  });

  it('rides camera moves on the provided duration and easing', async () => {
    const adapter: MapAdapter = {
      mount: vi.fn(),
      setPlaces: vi.fn(),
      setSelectedPlace: vi.fn(),
      focusPlace: vi.fn(),
      setCamera: vi.fn(),
      destroy: vi.fn()
    };
    const easing = (t: number) => t;

    const { rerender } = render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange: vi.fn(),
      motionDurationMs: 450,
      motionEasing: easing
    });

    await waitFor(() => expect(adapter.setCamera).toHaveBeenCalled());
    const moved: MapCamera = { latitude: 64.2, longitude: -21.8, zoom: 13 };
    await rerender({ camera: moved });
    await waitFor(() =>
      expect(adapter.setCamera).toHaveBeenCalledWith(moved, {
        duration: 450,
        easing,
        padding: { top: 0, right: 0, bottom: 0, left: 0 }
      })
    );
  });

  it('shows recoverable failure and retries mounting', async () => {
    let attempts = 0;
    const adapter: MapAdapter = {
      mount: vi.fn(() => {
        attempts += 1;
        if (attempts === 1) throw new Error('style failure');
      }),
      setPlaces: vi.fn(),
      setSelectedPlace: vi.fn(),
      focusPlace: vi.fn(),
      setCamera: vi.fn(),
      destroy: vi.fn()
    };

    render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange: vi.fn()
    });

    expect(
      await screen.findByRole('heading', { name: 'The map is unavailable right now' })
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(screen.queryByRole('heading', { name: 'The map is unavailable right now' })).toBeNull();
  });

  it('disposes the adapter when the surface unmounts', async () => {
    const adapter = createDomTestMapAdapter();
    const view = render(MapSurface, {
      adapter,
      places,
      selectedPlaceId: null,
      camera,
      copy: catalogues.en,
      onMarkerSelect: vi.fn(),
      onCameraChange: vi.fn()
    });

    await screen.findByRole('button', { name: 'Published Place' });
    view.unmount();
    expect(adapter.destroyed).toBe(true);
  });
});
