<script lang="ts">
  import { untrack } from 'svelte';

  import type { Catalogue } from '$i18n';

  import MapSurface from './MapSurface.svelte';
  import type { MapAdapter, MapCamera, MapPoint } from './types';

  interface Props {
    adapter: MapAdapter;
    copy: Catalogue;
    initialLatitude: number;
    initialLongitude: number;
  }

  let { adapter, copy, initialLatitude, initialLongitude }: Props = $props();
  let latitude = $state(untrack(() => initialLatitude));
  let longitude = $state(untrack(() => initialLongitude));
  let camera = $state<MapCamera>(
    untrack(() => ({
      latitude: initialLatitude,
      longitude: initialLongitude,
      zoom: 15
    }))
  );
  let announcement = $state('');
  let coordinatesOpen = $state(false);
  const places = $derived([
    {
      placeId: 'suggested-location',
      name: copy['suggestion.locationMarker'],
      latitude,
      longitude
    }
  ]);

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

<section class="location-picker">
  <div class="picker-heading">
    <div>
      <h3>{copy['suggestion.locationPickerTitle']}</h3>
      <p>{copy['suggestion.locationPickerHelp']}</p>
    </div>
    <button type="button" onclick={useMapCenter}>{copy['suggestion.useMapCenter']}</button>
  </div>

  <MapSurface
    {adapter}
    {places}
    selectedPlaceId="suggested-location"
    {camera}
    {copy}
    onMarkerSelect={() => undefined}
    onCameraChange={(nextCamera) => (camera = nextCamera)}
    onMapSelect={selectPoint}
    compact
  />

  <div class="coordinate-alternative">
    <span>{copy['suggestion.manualLocationHelp']}</span>
    <button
      type="button"
      class="text-toggle"
      aria-expanded={coordinatesOpen}
      onclick={() => (coordinatesOpen = !coordinatesOpen)}
    >
      {copy['suggestion.coordinatesAlternative']}
    </button>
  </div>
  {#if coordinatesOpen}
    <div class="coordinates">
      <label>
        {copy['suggestion.latitude']}
        <input
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
      <label>
        {copy['suggestion.longitude']}
        <input
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
  {:else}
    <input name="latitude" type="hidden" value={latitude} />
    <input name="longitude" type="hidden" value={longitude} />
  {/if}
  <p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>
</section>

<style>
  .location-picker {
    display: grid;
    gap: 0.85rem;
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
    font-size: 1.25rem;
  }

  .picker-heading p {
    margin-top: 0.25rem;
    opacity: 0.82;
  }

  button {
    flex: none;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.6rem 0.8rem;
    color: var(--ink);
    font: inherit;
    font-weight: 850;
  }

  .coordinate-alternative {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    align-items: baseline;
    color: var(--ink-soft);
    font-size: 0.88rem;
  }

  .text-toggle {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--coral-dark);
    box-shadow: none;
    text-decoration: underline;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }

  .coordinates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 800;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    background: white;
    padding: 0.7rem;
    color: var(--ink);
    font: inherit;
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
