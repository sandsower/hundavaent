<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  import type { Catalogue } from '$i18n';

  import type { MapAdapter, MapCamera, MapPlace, MapPoint } from './types';

  interface Props {
    adapter: MapAdapter;
    places: readonly MapPlace[];
    selectedPlaceId: string | null;
    camera: MapCamera;
    copy: Catalogue;
    onMarkerSelect: (placeId: string) => void;
    onClusterSelect?: (placeIds: readonly string[]) => void;
    onCameraChange: (camera: MapCamera) => void;
    onMapSelect?: (point: MapPoint) => void;
    failureContent?: Snippet;
    onFailureChange?: (failed: boolean) => void;
    compact?: boolean;
    fitPlacesOnMount?: boolean;
  }

  let {
    adapter,
    places,
    selectedPlaceId,
    camera,
    copy,
    onMarkerSelect,
    onClusterSelect,
    onCameraChange,
    onMapSelect,
    failureContent,
    onFailureChange = () => undefined,
    compact = false,
    fitPlacesOnMount = false
  }: Props = $props();
  let container = $state<HTMLElement>();
  let mounted = $state(false);
  let failed = $state(false);
  let paintReady = $state(false);
  // The camera prop applied last; a fitted mount must not be snapped back to the
  // fallback camera when the camera effect first runs.
  let appliedCamera: MapCamera | null = null;

  async function initialize(): Promise<void> {
    if (!container) return;
    failed = false;
    onFailureChange(false);
    mounted = false;
    paintReady = false;
    let cameraInitialized = false;

    try {
      await adapter.mount(container, {
        onMarkerSelect,
        onClusterSelect,
        onMapSelect,
        onCameraChange: (nextCamera) => {
          if (cameraInitialized) onCameraChange(nextCamera);
        }
      });
      adapter.setPlaces(places);
      adapter.setSelectedPlace(selectedPlaceId);
      if (fitPlacesOnMount && places.length > 0 && adapter.fitToPlaces) {
        adapter.fitToPlaces(places);
      } else {
        adapter.setCamera(camera);
      }
      appliedCamera = camera;
      await nextPaint();
      paintReady = true;
      cameraInitialized = true;
      mounted = true;
    } catch {
      failed = true;
      onFailureChange(true);
      adapter.destroy();
    }
  }

  async function nextPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function retry(): Promise<void> {
    adapter.destroy();
    await initialize();
  }

  onMount(() => {
    void initialize();
    return () => adapter.destroy();
  });

  $effect(() => {
    if (mounted) adapter.setPlaces(places);
  });

  $effect(() => {
    if (mounted) adapter.setSelectedPlace(selectedPlaceId);
  });

  $effect(() => {
    if (!mounted) return;
    if (
      appliedCamera &&
      appliedCamera.latitude === camera.latitude &&
      appliedCamera.longitude === camera.longitude &&
      appliedCamera.zoom === camera.zoom
    ) {
      return;
    }
    appliedCamera = camera;
    adapter.setCamera(camera);
  });
</script>

<section
  class="map-surface"
  class:compact
  aria-label={copy['directory.mapLabel']}
  data-paint-ready={paintReady}
>
  {#if failed}
    <div class="map-failure">
      <div class="failure-message" role="status">
        <h2>{copy['directory.mapUnavailableTitle']}</h2>
        <p>{copy['directory.mapUnavailableBody']}</p>
      </div>
      <button type="button" onclick={retry}>{copy['directory.retryMap']}</button>
      {@render failureContent?.()}
    </div>
  {/if}
  <div class:hidden={failed} class="map-container" bind:this={container}></div>
</section>

<style>
  .map-surface,
  .map-container {
    /* Fill the viewport below the header and page padding instead of leaving a dead band. */
    min-height: max(32rem, calc(100dvh - 7.5rem));
  }

  .map-surface {
    position: relative;
    overflow: hidden;
    border: 2px solid #193b45;
    border-radius: 1.4rem;
    background: #d9ece7;
  }

  .map-surface.compact,
  .map-surface.compact .map-container,
  .map-surface.compact .map-failure {
    min-height: clamp(18rem, 42dvh, 26rem);
  }

  .map-container {
    padding: 1rem;
  }

  :global(.maplibregl-canvas) {
    background: #d9ece7;
  }

  /* Keep the attribution clear of the surface's rounded corner. */
  .map-surface :global(.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib) {
    margin-right: 1.1rem;
  }

  .hidden {
    display: none;
  }

  .map-failure {
    display: grid;
    min-height: max(32rem, calc(100dvh - 7.5rem));
    box-sizing: border-box;
    gap: 1rem;
    align-content: start;
    overflow: auto;
    padding: 2rem;
  }

  .failure-message {
    text-align: center;
  }

  .failure-message h2 {
    margin-top: 0;
  }

  button {
    justify-self: center;
    padding: 0.65rem 1rem;
    border: 2px solid #193b45;
    border-radius: 999px;
    background: #f8cf58;
    color: inherit;
    font: inherit;
    font-weight: 850;
  }

  button:focus-visible {
    outline: 4px solid #f1a33b;
    outline-offset: 3px;
  }

  @media (max-width: 48rem) {
    .map-surface,
    .map-container,
    .map-failure {
      /* The stacked mobile header is taller, so more of the viewport is spoken for. */
      min-height: max(26rem, calc(100dvh - 10.5rem));
    }

    .map-surface.compact,
    .map-surface.compact .map-container,
    .map-surface.compact .map-failure {
      min-height: 20rem;
    }
  }
</style>
