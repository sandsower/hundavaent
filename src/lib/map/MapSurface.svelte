<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  import type { Catalogue } from '$i18n';

  import type { MapAdapter, MapCamera, MapPadding, MapPlace, MapPoint } from './types';

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
    onMarkerMove?: (placeId: string, point: MapPoint) => void;
    onMoveStateChange?: (moving: boolean) => void;
    failureContent?: Snippet;
    onFailureChange?: (failed: boolean) => void;
    compact?: boolean;
    fitPlacesOnMount?: boolean;
    viewportPadding?: MapPadding;
    motionDurationMs?: number;
    motionEasing?: (t: number) => number;
    viewerLocation?: MapPoint | null;
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
    onMarkerMove,
    onMoveStateChange,
    failureContent,
    onFailureChange = () => undefined,
    compact = false,
    fitPlacesOnMount = false,
    viewportPadding = { top: 0, right: 0, bottom: 0, left: 0 },
    motionDurationMs = 0,
    motionEasing,
    viewerLocation = null
  }: Props = $props();
  let container = $state<HTMLElement>();
  let mounted = $state(false);
  let failed = $state(false);
  let paintReady = $state(false);
  // The camera prop applied last; a fitted mount must not be snapped back to the
  // fallback camera when the camera effect first runs.
  let appliedCamera: MapCamera | null = null;
  let appliedPadding: MapPadding | null = null;

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
        onMarkerMove,
        onMoveStateChange,
        onCameraChange: (nextCamera) => {
          if (cameraInitialized) onCameraChange(nextCamera);
        }
      });
      adapter.setPlaces(places);
      adapter.setSelectedPlace(selectedPlaceId);
      adapter.setViewerLocation?.(viewerLocation);
      if (fitPlacesOnMount && places.length > 0 && adapter.fitToPlaces) {
        adapter.fitToPlaces(places);
      } else {
        adapter.setCamera(camera, { duration: 0, padding: viewportPadding });
      }
      adapter.setPadding?.(viewportPadding, { duration: 0 });
      appliedCamera = camera;
      appliedPadding = viewportPadding;
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
    if (mounted) adapter.setViewerLocation?.(viewerLocation);
  });

  $effect(() => {
    if (!mounted) return;
    if (
      appliedCamera &&
      appliedCamera.latitude === camera.latitude &&
      appliedCamera.longitude === camera.longitude &&
      appliedCamera.zoom === camera.zoom &&
      appliedPadding?.top === viewportPadding.top &&
      appliedPadding.right === viewportPadding.right &&
      appliedPadding.bottom === viewportPadding.bottom &&
      appliedPadding.left === viewportPadding.left
    ) {
      return;
    }
    appliedCamera = camera;
    appliedPadding = viewportPadding;
    adapter.setCamera(camera, {
      duration: motionDurationMs,
      easing: motionEasing,
      padding: viewportPadding
    });
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
    border: 1px solid var(--hv-color-basalt, #1e2d31);
    border-radius: var(--hv-radius-shell, 0.75rem);
    background: #dce5df;
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
    background: #dce5df;
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
    border: 1px solid var(--hv-color-basalt, #1e2d31);
    border-radius: var(--hv-radius-control, 0.35rem);
    background: var(--hv-color-signal, #f2c94c);
    color: inherit;
    font: inherit;
    font-weight: 850;
  }

  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring, #2f6f86);
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
