<script lang="ts">
  import { untrack } from 'svelte';

  import type { Catalogue } from '$i18n';

  import MapSurface from './MapSurface.svelte';
  import type { MapAdapter, MapCamera, MapPoint } from './types';

  interface Props {
    adapter: MapAdapter;
    copy: Catalogue;
    /**
     * Where the map opens before anyone has answered. It is a camera and never an answer: a
     * Member who never touches the picker submits no coordinates at all, so the map can point
     * somewhere plausible without the form claiming a Place is there.
     */
    fallbackCamera: MapCamera;
    /** The placed pin, or `null` while the question is unanswered. */
    latitude?: number | null;
    longitude?: number | null;
    requiredHintId?: string;
  }

  let {
    adapter,
    copy,
    fallbackCamera,
    latitude = $bindable(null),
    longitude = $bindable(null),
    requiredHintId = 'suggestion-location-required'
  }: Props = $props();
  let camera = $state<MapCamera>(
    untrack(() =>
      latitude === null || longitude === null
        ? fallbackCamera
        : { latitude, longitude, zoom: fallbackCamera.zoom }
    )
  );
  let announcement = $state('');
  let coordinatesOpen = $state(false);
  const answered = $derived(latitude !== null && longitude !== null);
  const places = $derived.by(() =>
    latitude === null || longitude === null
      ? []
      : [
          {
            placeId: 'suggested-location',
            name: copy['suggestion.locationMarker'],
            latitude,
            longitude
          }
        ]
  );

  function selectPoint(point: MapPoint): void {
    latitude = rounded(point.latitude);
    longitude = rounded(point.longitude);
    announcement = copy['suggestion.locationSelected']
      .replace('{latitude}', String(latitude))
      .replace('{longitude}', String(longitude));
  }

  function useMapCenter(): void {
    selectPoint(camera);
  }

  function rounded(value: number): number {
    return Number(value.toFixed(6));
  }
</script>

<section class="location-picker hv-panel">
  <div class="picker-heading">
    <div>
      <h3>{copy['suggestion.locationPickerTitle']}</h3>
      <p class="hv-meta">{copy['suggestion.locationPickerHelp']}</p>
    </div>
    <button class="hv-control" type="button" onclick={useMapCenter}
      >{copy['suggestion.useMapCenter']}</button
    >
  </div>

  <MapSurface
    {adapter}
    {places}
    selectedPlaceId={answered ? 'suggested-location' : null}
    {camera}
    {copy}
    onMarkerSelect={() => undefined}
    onCameraChange={(nextCamera) => (camera = nextCamera)}
    onMapSelect={selectPoint}
    compact
  />

  {#if !answered}
    <p class="pin-required" id={requiredHintId}>{copy['suggestion.locationRequired']}</p>
  {/if}

  <div class="coordinate-alternative hv-meta">
    <span>{copy['suggestion.manualLocationHelp']}</span>
    <button
      type="button"
      class="hv-control text-toggle"
      aria-expanded={coordinatesOpen}
      onclick={() => (coordinatesOpen = !coordinatesOpen)}
    >
      {copy['suggestion.coordinatesAlternative']}
    </button>
  </div>
  {#if coordinatesOpen}
    <div class="coordinates">
      <label class="hv-stack">
        {copy['suggestion.latitude']}
        <input
          class="hv-field"
          id="suggestion-latitude"
          name="latitude"
          type="number"
          min="-90"
          max="90"
          step="any"
          required
          bind:value={latitude}
        />
      </label>
      <label class="hv-stack">
        {copy['suggestion.longitude']}
        <input
          class="hv-field"
          name="longitude"
          type="number"
          min="-180"
          max="180"
          step="any"
          required
          bind:value={longitude}
        />
      </label>
    </div>
  {:else if answered}
    <!-- Only a placed pin is submitted. An unanswered question sends nothing, which is what makes
         the server's missing-coordinate branch the honest refusal it is written to be. -->
    <input name="latitude" type="hidden" value={latitude} />
    <input name="longitude" type="hidden" value={longitude} />
  {/if}
  <p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>
</section>

<style>
  .location-picker {
    display: grid;
    gap: 0.85rem;
    padding: var(--hv-space-panel);
  }

  .picker-heading {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--hv-color-basalt);
    font-size: 1.25rem;
  }

  .picker-heading p {
    margin-top: 0.25rem;
  }

  .picker-heading button {
    flex: none;
  }

  .pin-required {
    color: var(--hv-color-basalt);
    font-weight: 800;
  }

  .coordinate-alternative {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    align-items: baseline;
  }

  .text-toggle {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--hv-color-fjord);
    box-shadow: none;
    text-decoration: underline;
  }

  .coordinates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  label {
    color: var(--hv-color-basalt);
    font-weight: 800;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 42rem) {
    .picker-heading,
    .coordinates {
      display: grid;
      grid-template-columns: 1fr;
    }

    .picker-heading button {
      justify-self: start;
    }
  }
</style>
