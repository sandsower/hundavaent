<script lang="ts">
  import { untrack } from 'svelte';

  import { Button, Field, Input, Meta } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type { AddressSearchResult } from '$server/locations/address-search';

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
  }

  let {
    adapter,
    copy,
    fallbackCamera,
    latitude = $bindable(null),
    longitude = $bindable(null)
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
  let query = $state('');
  let searching = $state(false);
  let searchState = $state<'idle' | 'empty' | 'unavailable'>('idle');
  let results = $state<AddressSearchResult[]>([]);
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

  async function search(): Promise<void> {
    const requestedQuery = query.trim();
    if (requestedQuery.length < 3 || searching) return;
    searching = true;
    searchState = 'idle';
    results = [];
    try {
      const response = await fetch(
        `/api/locations/search?q=${encodeURIComponent(requestedQuery)}`,
        {
          headers: { accept: 'application/json' }
        }
      );
      if (!response.ok) throw new Error('Address search failed');
      const payload = (await response.json()) as { results?: AddressSearchResult[] };
      results = Array.isArray(payload.results) ? payload.results : [];
      searchState = results.length === 0 ? 'empty' : 'idle';
    } catch {
      searchState = 'unavailable';
    } finally {
      searching = false;
    }
  }

  function chooseResult(result: AddressSearchResult): void {
    selectPoint(result);
    camera = { latitude: result.latitude, longitude: result.longitude, zoom: 17 };
    query = result.label;
    results = [];
  }

  function rounded(value: number): number {
    return Number(value.toFixed(6));
  }
</script>

<section class="location-picker">
  <div class="picker-heading">
    <div>
      <h3>{copy['suggestion.locationPickerTitle']}</h3>
      <Meta class="picker-help">{copy['suggestion.locationPickerHelp']}</Meta>
    </div>
    <Button type="button" class="use-map-center" onclick={useMapCenter}>
      {copy['suggestion.useMapCenter']}
    </Button>
  </div>

  <div class="address-search" role="search">
    <Field label={copy['suggestion.locationSearchLabel']} class="field-label">
      <span class="search-row">
        <Input
          type="search"
          bind:value={query}
          minlength={3}
          autocomplete="street-address"
          onkeydown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void search();
          }}
        />
        <Button
          type="button"
          disabled={searching || query.trim().length < 3}
          onclick={() => void search()}
        >
          {searching
            ? copy['suggestion.locationSearching']
            : copy['suggestion.locationSearchAction']}
        </Button>
      </span>
    </Field>
    <Meta as="small">{copy['suggestion.locationSearchHelp']}</Meta>
  </div>

  {#if results.length > 0}
    <section class="search-results" aria-label={copy['suggestion.locationResultsLabel']}>
      {#each results as result (result.id)}
        <button type="button" onclick={() => chooseResult(result)}>{result.label}</button>
      {/each}
    </section>
  {:else if searchState === 'empty'}
    <Meta as="p" role="status">{copy['suggestion.locationSearchEmpty']}</Meta>
  {:else if searchState === 'unavailable'}
    <Meta as="p" role="status">{copy['suggestion.locationSearchUnavailable']}</Meta>
  {/if}

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

  <Meta as="div" class="coordinate-alternative">
    <span>{copy['suggestion.manualLocationHelp']}</span>
    <button
      type="button"
      class="text-toggle"
      aria-expanded={coordinatesOpen}
      onclick={() => (coordinatesOpen = !coordinatesOpen)}
    >
      {copy['suggestion.coordinatesAlternative']}
    </button>
  </Meta>
  {#if coordinatesOpen}
    <div class="coordinates">
      <Field label={copy['suggestion.latitude']} class="field-label">
        <Input
          name="latitude"
          type="number"
          min="-90"
          max="90"
          step="any"
          required
          bind:value={latitude}
        />
      </Field>
      <Field label={copy['suggestion.longitude']} class="field-label">
        <Input
          name="longitude"
          type="number"
          min="-180"
          max="180"
          step="any"
          required
          bind:value={longitude}
        />
      </Field>
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
  /* Deliberately not a panel. The question this answers is already wrapped in one by the form, and
     a raised surface inset inside an identical raised surface reads as a mistake rather than as
     structure. One question, one panel. */
  .location-picker {
    display: grid;
    gap: var(--hv-space-panel);
  }

  .picker-heading {
    display: flex;
    gap: var(--hv-space-panel);
    align-items: start;
    justify-content: space-between;
  }

  h3 {
    margin: 0;
    color: var(--hv-color-basalt);
    font-size: 1.25rem;
  }

  /* Meta renders its own <p> in a separate component; the hook is ancestor-scoped under
     .picker-heading (this file's own hashed scope), never a bare :global(). */
  .picker-heading :global(.picker-help) {
    margin-top: 0.25rem;
  }

  /* Button renders its own <button> in a separate component; same ancestor-scoped hook rule. */
  .picker-heading :global(.use-map-center) {
    flex: none;
  }

  .address-search {
    display: grid;
    gap: 0.35rem;
  }

  .search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
  }

  .search-results {
    display: grid;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--hv-color-basalt) 25%, transparent);
    border-radius: 0.65rem;
    background: var(--hv-color-snow-raised);
  }

  .search-results button {
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--hv-color-basalt) 15%, transparent);
    border-radius: 0;
    background: transparent;
    padding: 0.75rem;
    color: var(--hv-color-basalt);
    text-align: left;
    box-shadow: none;
  }

  .search-results button:last-child {
    border-bottom: 0;
  }

  .search-results button:hover,
  .search-results button:focus-visible {
    background: var(--hv-color-fjord-soft);
  }

  /* Meta renders its own <div> in a separate component (m-0 already covers the old margin:0
     reset the bare-<p> "search-note" rule carried); the hook is ancestor-scoped under
     .location-picker, never a bare :global(). */
  .location-picker :global(.coordinate-alternative) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    align-items: baseline;
  }

  /* .text-toggle is a plain <button> authored directly in this file's own markup (passed as a
     child into Meta's snippet), so it keeps this file's scope hash and needs no :global() - only
     Meta's own wrapping element does. hv-control is fully stripped here (border/background/
     padding/min-height/focus all neutralized or restated below), matching the "carry only what
     renders" rule: this is a plain underlined text link, not a control. */
  .text-toggle {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--hv-color-fjord);
    box-shadow: none;
    text-decoration: underline;
  }

  .text-toggle:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .coordinates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--hv-space-panel);
  }

  /* Field renders its own <label> in a separate component; the hook is ancestor-scoped under
     .address-search / .coordinates (this file's own hashed scope), never a bare :global(). All
     three Field instances share one hook class since they all want the same label treatment. */
  .address-search :global(.field-label label),
  .coordinates :global(.field-label label) {
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
    .search-row,
    .coordinates {
      display: grid;
      grid-template-columns: 1fr;
    }

    .picker-heading :global(.use-map-center) {
      justify-self: start;
    }
  }
</style>
