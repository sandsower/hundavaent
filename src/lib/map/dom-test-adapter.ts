import type {
  MapAdapter,
  MapCallbacks,
  MapCamera,
  MapCameraOptions,
  MapPadding,
  MapPlace,
  MapPoint
} from './types';

export interface DomTestMapAdapter extends MapAdapter {
  readonly destroyed: boolean;
  simulateCameraChange(camera: MapCamera): void;
  simulateMapSelect(point: MapPoint): void;
  simulateMarkerMove(placeId: string, point: MapPoint): void;
}

export function createDomTestMapAdapter(): DomTestMapAdapter {
  let root: HTMLElement | null = null;
  let callbacks: MapCallbacks | null = null;
  let selectedPlaceId: string | null = null;
  let isDestroyed = false;
  const markers = new Map<string, HTMLButtonElement>();

  function mount(container: HTMLElement, nextCallbacks: MapCallbacks): void {
    isDestroyed = false;
    callbacks = nextCallbacks;
    root = document.createElement('div');
    root.setAttribute('data-map-adapter', 'dom-test');

    const markerLayer = document.createElement('div');
    markerLayer.setAttribute('data-marker-layer', '');
    root.append(markerLayer);

    const attribution = document.createElement('p');
    attribution.textContent = 'Map data: deterministic test adapter';
    attribution.setAttribute('data-attribution', '');
    root.append(attribution);
    container.replaceChildren(root);
  }

  function setPlaces(places: readonly MapPlace[]): void {
    const markerLayer = root?.querySelector<HTMLElement>('[data-marker-layer]');
    if (!markerLayer) return;

    const activeIds = new Set(places.map((place) => place.placeId));
    for (const [placeId, marker] of markers) {
      if (!activeIds.has(placeId)) {
        marker.remove();
        markers.delete(placeId);
      }
    }

    for (const place of places) {
      let marker = markers.get(place.placeId);
      if (!marker) {
        marker = document.createElement('button');
        marker.type = 'button';
        marker.dataset.placeId = place.placeId;
        marker.onclick = () => callbacks?.onMarkerSelect(place.placeId);
        markers.set(place.placeId, marker);
        markerLayer.append(marker);
      }

      marker.textContent = place.name;
      marker.setAttribute('aria-label', place.name);
      marker.setAttribute('aria-pressed', String(place.placeId === selectedPlaceId));
      marker.dataset.latitude = String(place.latitude);
      marker.dataset.longitude = String(place.longitude);
    }
  }

  function setSelectedPlace(placeId: string | null): void {
    selectedPlaceId = placeId;
    for (const [markerPlaceId, marker] of markers) {
      marker.setAttribute('aria-pressed', String(markerPlaceId === placeId));
    }
  }

  function focusPlace(placeId: string): void {
    markers.get(placeId)?.focus();
  }

  function setCamera(camera: MapCamera, options: MapCameraOptions = {}): void {
    if (!root) return;
    root.dataset.latitude = String(camera.latitude);
    root.dataset.longitude = String(camera.longitude);
    root.dataset.zoom = String(camera.zoom);
    if (options.padding) setPadding(options.padding);
  }

  function setPadding(padding: MapPadding): void {
    if (!root) return;
    root.dataset.paddingTop = String(padding.top);
    root.dataset.paddingRight = String(padding.right);
    root.dataset.paddingBottom = String(padding.bottom);
    root.dataset.paddingLeft = String(padding.left);
  }

  function destroy(): void {
    root?.remove();
    root = null;
    callbacks = null;
    markers.clear();
    isDestroyed = true;
  }

  return {
    mount,
    setPlaces,
    setSelectedPlace,
    focusPlace,
    setCamera,
    setPadding,
    destroy,
    get destroyed() {
      return isDestroyed;
    },
    simulateCameraChange(camera) {
      callbacks?.onCameraChange(camera);
    },
    simulateMapSelect(point) {
      callbacks?.onMapSelect?.(point);
    },
    simulateMarkerMove(placeId, point) {
      callbacks?.onMarkerMove?.(placeId, point);
    }
  };
}
