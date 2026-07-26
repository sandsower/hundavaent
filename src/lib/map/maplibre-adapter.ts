import type { Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl';

import { clusterMapPlaces, isTerminalMapCluster } from '$lib/discovery/clusters';

import { markerPinSvg } from './marker-icons';
import type {
  MapAdapter,
  MapCallbacks,
  MapCamera,
  MapCameraOptions,
  MapPadding,
  MapPlace,
  MapPoint
} from './types';

export interface MapLibreAdapterOptions {
  style: string | StyleSpecification;
  attribution?: string;
  clusterLabel?: (count: number) => string;
  clusterRadiusPixels?: number;
}

export interface MapLibreAdapter extends MapAdapter {
  getCamera(): MapCamera | null;
}

const maximumInteractiveClusterZoom = 18;

export function createMapLibreAdapter(options: MapLibreAdapterOptions): MapLibreAdapter {
  const clusterRadiusPixels = options.clusterRadiusPixels ?? 72;
  let map: MapLibreMap | null = null;
  let maplibreModule: typeof import('maplibre-gl') | null = null;
  let callbacks: MapCallbacks | null = null;
  let places: readonly MapPlace[] = [];
  let selectedPlaceId: string | null = null;
  let applyingCamera = false;
  const markers = new Map<string, { marker: Marker; element: HTMLButtonElement }>();
  const markerPlaceIds = new Map<string, readonly string[]>();
  let viewerMarker: Marker | null = null;

  async function mount(container: HTMLElement, nextCallbacks: MapCallbacks): Promise<void> {
    const maplibre = await import('maplibre-gl');
    maplibreModule = maplibre;
    await import('maplibre-gl/dist/maplibre-gl.css');
    callbacks = nextCallbacks;
    map = new maplibre.Map({
      container,
      style: options.style,
      center: [-21.9426, 64.1466],
      zoom: 11,
      attributionControl: false
    });
    // A style URL (MapTiler) already carries its own attribution, OpenStreetMap included;
    // only a local style object needs the fallback credit.
    const fallbackAttribution =
      typeof options.style === 'string' ? undefined : '© OpenStreetMap contributors';
    map.addControl(
      new maplibre.AttributionControl({
        compact: false,
        customAttribution: options.attribution ?? fallbackAttribution
      })
    );
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);

    await new Promise<void>((resolve, reject) => {
      const handleLoad = () => {
        map?.off('error', handleError);
        resolve();
      };
      const handleError = (event: { error?: Error }) => {
        map?.off('load', handleLoad);
        reject(event.error ?? new Error('MapLibre failed to load'));
      };
      map?.once('load', handleLoad);
      map?.once('error', handleError);
    });

    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    map?.resize({ hundavaentProgrammatic: true });
    reconcileMarkers();
  }

  function setPlaces(nextPlaces: readonly MapPlace[]): void {
    places = nextPlaces;
    reconcileMarkers();
  }

  function reconcileMarkers(): void {
    if (!map) return;

    const clusters = clusterMapPlaces(places, map.getZoom(), selectedPlaceId, clusterRadiusPixels);
    const activeIds = new Set(clusters.map((cluster) => cluster.id));
    for (const [placeId, entry] of markers) {
      if (!activeIds.has(placeId)) {
        entry.marker.remove();
        markers.delete(placeId);
        markerPlaceIds.delete(placeId);
      }
    }

    if (!maplibreModule) return;
    for (const cluster of clusters) {
      const place =
        cluster.placeIds.length === 1
          ? places.find((candidate) => candidate.placeId === cluster.placeIds[0])
          : null;
      const existing = markers.get(cluster.id);
      const label = place
        ? place.name
        : (options.clusterLabel?.(cluster.placeIds.length) ?? `${cluster.placeIds.length} places`);
      markerPlaceIds.set(cluster.id, cluster.placeIds);
      if (existing) {
        existing.marker.setLngLat([cluster.longitude, cluster.latitude]);
        existing.marker.setDraggable(Boolean(place?.draggable));
        renderMarkerContent(existing.element, place, cluster.placeIds.length);
        existing.element.setAttribute('aria-label', label);
        setPressedState(existing.element, place?.placeId ?? null, selectedPlaceId);
        continue;
      }

      const element = document.createElement('button');
      element.type = 'button';
      element.className = place ? 'hundavaent-marker' : 'hundavaent-marker cluster';
      renderMarkerContent(element, place, cluster.placeIds.length);
      element.setAttribute('aria-label', label);
      setPressedState(element, place?.placeId ?? null, selectedPlaceId);
      element.onclick = () => {
        if (place) {
          callbacks?.onMarkerSelect(place.placeId);
        } else {
          const clusterPlaces = places.filter((candidate) =>
            cluster.placeIds.includes(candidate.placeId)
          );
          if (
            isTerminalMapCluster(clusterPlaces, maximumInteractiveClusterZoom, clusterRadiusPixels)
          ) {
            callbacks?.onClusterSelect?.([...cluster.placeIds]);
            return;
          }
          map?.easeTo({
            center: [cluster.longitude, cluster.latitude],
            zoom: Math.min((map?.getZoom() ?? 11) + 2, maximumInteractiveClusterZoom)
          });
        }
      };
      // 'bottom' puts the pin tail (or the cluster bubble's base) on the coordinate.
      const marker = new maplibreModule.Marker({
        element,
        anchor: 'bottom',
        draggable: Boolean(place?.draggable)
      })
        .setLngLat([cluster.longitude, cluster.latitude])
        .addTo(map);
      if (place?.draggable) {
        marker.on('dragend', () => {
          const point = marker.getLngLat();
          callbacks?.onMarkerMove?.(place.placeId, {
            latitude: point.lat,
            longitude: point.lng
          });
        });
      }
      markers.set(cluster.id, { marker, element });
    }
  }

  function setSelectedPlace(placeId: string | null): void {
    selectedPlaceId = placeId;
    reconcileMarkers();
    for (const [markerPlaceId, entry] of markers) {
      const isIndividual = markerPlaceIds.get(markerPlaceId)?.length === 1;
      if (isIndividual) {
        entry.element.setAttribute('aria-pressed', String(markerPlaceId === placeId));
      } else {
        entry.element.removeAttribute('aria-pressed');
      }
      entry.element.classList.toggle('selected', isIndividual && markerPlaceId === placeId);
    }
  }

  function focusPlace(placeId: string): void {
    const markerId = markers.has(placeId)
      ? placeId
      : [...markerPlaceIds].find(([, placeIds]) => placeIds.includes(placeId))?.[0];
    if (markerId) markers.get(markerId)?.element.focus();
  }

  function setCamera(camera: MapCamera, options: MapCameraOptions = {}): void {
    if (!map) return;
    const current = map.getCenter();
    const currentPadding = map.getPadding();
    const nextPadding = options.padding ?? currentPadding;
    if (
      Math.abs(current.lat - camera.latitude) < 0.000001 &&
      Math.abs(current.lng - camera.longitude) < 0.000001 &&
      Math.abs(map.getZoom() - camera.zoom) < 0.001 &&
      currentPadding.top === nextPadding.top &&
      currentPadding.right === nextPadding.right &&
      currentPadding.bottom === nextPadding.bottom &&
      currentPadding.left === nextPadding.left
    ) {
      return;
    }

    applyingCamera = true;
    if ((options.duration ?? 0) > 0) {
      map.easeTo({
        center: [camera.longitude, camera.latitude],
        zoom: camera.zoom,
        padding: nextPadding,
        duration: options.duration,
        // Spelling out an undefined easing would override maplibre's default with nothing.
        ...(options.easing ? { easing: options.easing } : {})
      });
    } else {
      map.jumpTo({
        center: [camera.longitude, camera.latitude],
        zoom: camera.zoom,
        padding: nextPadding
      });
    }
  }

  function setPadding(padding: MapPadding, options: { duration?: number } = {}): void {
    if (!map) return;
    const current = map.getPadding();
    if (
      current.top === padding.top &&
      current.right === padding.right &&
      current.bottom === padding.bottom &&
      current.left === padding.left
    ) {
      return;
    }
    map.easeTo({ padding, duration: options.duration ?? 0 }, { hundavaentProgrammatic: true });
  }

  function fitToPlaces(nextPlaces: readonly MapPlace[]): void {
    if (!map || nextPlaces.length === 0) return;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const place of nextPlaces) {
      west = Math.min(west, place.longitude);
      east = Math.max(east, place.longitude);
      south = Math.min(south, place.latitude);
      north = Math.max(north, place.latitude);
    }
    map.fitBounds(
      [
        [west, south],
        [east, north]
      ],
      {
        // Clears the floating search card at the top; keeps single places readable.
        padding: { top: 170, right: 56, bottom: 56, left: 56 },
        maxZoom: 14.5,
        duration: 0
      },
      { hundavaentProgrammatic: true }
    );
  }

  function setViewerLocation(point: MapPoint | null): void {
    if (!point) {
      viewerMarker?.remove();
      viewerMarker = null;
      return;
    }
    if (viewerMarker) {
      viewerMarker.setLngLat([point.longitude, point.latitude]);
      return;
    }
    if (!map || !maplibreModule) return;
    const element = document.createElement('div');
    element.className = 'hundavaent-viewer-location';
    // The dot is where the reader already knows they are standing; a screen reader hears the
    // outcome through the shell's status line instead of a decorative map ornament.
    element.setAttribute('aria-hidden', 'true');
    viewerMarker = new maplibreModule.Marker({ element, anchor: 'center' })
      .setLngLat([point.longitude, point.latitude])
      .addTo(map);
  }

  // Only user gestures (drag, wheel, pinch) carry an originalEvent; camera
  // animations must not de-emphasize the floating chrome.
  function handleMoveStart(event?: { originalEvent?: unknown }): void {
    if (event?.originalEvent) callbacks?.onMoveStateChange?.(true);
  }

  function handleMoveEnd(event?: { hundavaentProgrammatic?: boolean }): void {
    if (!map) return;
    reconcileMarkers();
    callbacks?.onMoveStateChange?.(false);
    if (event?.hundavaentProgrammatic) return;
    if (applyingCamera) {
      applyingCamera = false;
      return;
    }
    const center = map.getCenter();
    callbacks?.onCameraChange({
      latitude: center.lat,
      longitude: center.lng,
      zoom: map.getZoom()
    });
  }

  function handleMapClick(event: { lngLat: { lat: number; lng: number } }): void {
    callbacks?.onMapSelect?.({
      latitude: event.lngLat.lat,
      longitude: event.lngLat.lng
    });
  }

  function destroy(): void {
    for (const entry of markers.values()) entry.marker.remove();
    markers.clear();
    markerPlaceIds.clear();
    viewerMarker?.remove();
    viewerMarker = null;
    map?.off('movestart', handleMoveStart);
    map?.off('moveend', handleMoveEnd);
    map?.off('click', handleMapClick);
    map?.remove();
    map = null;
    maplibreModule = null;
    callbacks = null;
  }

  function getCamera(): MapCamera | null {
    if (!map) return null;
    const center = map.getCenter();
    return { latitude: center.lat, longitude: center.lng, zoom: map.getZoom() };
  }

  return {
    mount,
    setPlaces,
    setSelectedPlace,
    focusPlace,
    setCamera,
    setPadding,
    fitToPlaces,
    setViewerLocation,
    destroy,
    getCamera
  };
}

/**
 * Fills a marker button with its visual content: a category pin plus a name
 * chip for a single place, or a bare count for a cluster bubble. The pin SVG
 * is only rebuilt when the category changes; the name lives in a text node,
 * never in markup.
 */
function renderMarkerContent(
  element: HTMLButtonElement,
  place: MapPlace | null | undefined,
  count: number
): void {
  if (!place) {
    element.textContent = String(count);
    delete element.dataset.pinCategory;
    return;
  }

  const renderedCategory = place.category ?? '';
  if (element.dataset.pinCategory !== renderedCategory) {
    element.innerHTML = markerPinSvg(place.category);
    const chip = document.createElement('span');
    chip.className = 'marker-label';
    chip.setAttribute('aria-hidden', 'true');
    element.append(chip);
    element.dataset.pinCategory = renderedCategory;
  }
  const label = element.querySelector('.marker-label');
  if (label && label.textContent !== place.name) {
    label.textContent = place.name;
  }
}

function setPressedState(
  element: HTMLButtonElement,
  markerPlaceId: string | null,
  selectedPlaceId: string | null
): void {
  if (markerPlaceId) {
    element.setAttribute('aria-pressed', String(markerPlaceId === selectedPlaceId));
  } else {
    element.removeAttribute('aria-pressed');
  }
}

export const emptyMapLibreStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'hundavaent-background',
      type: 'background',
      paint: { 'background-color': '#dce5df' }
    }
  ]
};
