<script lang="ts">
  import { untrack } from 'svelte';

  import { Button, Field, Input, Select } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import MapSurface from '$lib/map/MapSurface.svelte';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter, MapCamera, MapPoint } from '$lib/map/types';
  import type { AddressSearchResult } from '$server/locations/address-search';

  export interface ModerationLocationValue {
    addressLine: string;
    locality: string;
    postalCode: string;
    municipality: string;
    latitude: number;
    longitude: number;
    geometryPrecision: string;
    geometrySource: string;
  }

  interface Props {
    copy: Catalogue;
    value: ModerationLocationValue;
    markerName: string;
    mapStyleUrl?: string | null;
    adapter?: MapAdapter;
  }

  let { copy, value = $bindable(), markerName, mapStyleUrl = null, adapter }: Props = $props();
  let mapAdapter = $state<MapAdapter>(
    untrack(
      () =>
        adapter ??
        createMapLibreAdapter({
          style: mapStyleUrl ?? emptyMapLibreStyle,
          clusterLabel: (count) => copy['directory.clusterCount'].replace('{count}', String(count))
        })
    )
  );
  let camera = $state<MapCamera>(
    untrack(() => ({ latitude: value.latitude, longitude: value.longitude, zoom: 16 }))
  );
  let query = $state('');
  let searching = $state(false);
  let searchState = $state<'idle' | 'empty' | 'unavailable'>('idle');
  let results = $state<AddressSearchResult[]>([]);
  let announcement = $state('');

  const places = $derived([
    {
      placeId: 'moderation-location',
      name: markerName,
      latitude: value.latitude,
      longitude: value.longitude,
      draggable: true
    }
  ]);

  async function search(): Promise<void> {
    const requestedQuery = query.trim();
    if (requestedQuery.length < 3 || searching) return;
    searching = true;
    searchState = 'idle';
    results = [];
    try {
      const response = await fetch(
        `/api/moderation/locations/search?q=${encodeURIComponent(requestedQuery)}`,
        { headers: { accept: 'application/json' } }
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
    value = {
      addressLine: result.addressLine,
      locality: result.locality,
      postalCode: result.postalCode,
      municipality: result.municipality,
      latitude: result.latitude,
      longitude: result.longitude,
      geometryPrecision: 'official_address_point',
      geometrySource: result.source
    };
    camera = { latitude: result.latitude, longitude: result.longitude, zoom: 17 };
    query = result.label;
    results = [];
    announcePoint(result);
  }

  function selectPoint(point: MapPoint): void {
    const latitude = rounded(point.latitude);
    const longitude = rounded(point.longitude);
    value = {
      ...value,
      latitude,
      longitude,
      geometryPrecision: 'moderator_confirmed_point',
      geometrySource: 'Moderator-confirmed map point'
    };
    announcePoint({ latitude, longitude });
  }

  function useMapCenter(): void {
    selectPoint(camera);
  }

  function announcePoint(point: Pick<MapPoint, 'latitude' | 'longitude'>): void {
    announcement = copy['moderation.location.pinMoved']
      .replace('{latitude}', String(point.latitude))
      .replace('{longitude}', String(point.longitude));
  }

  function rounded(number: number): number {
    return Number(number.toFixed(6));
  }

  function updateField<K extends keyof ModerationLocationValue>(
    key: K,
    nextValue: ModerationLocationValue[K]
  ): void {
    value = { ...value, [key]: nextValue };
  }
</script>

<div class="location-editor">
  <div class="address-search" role="search">
    <Field label={copy['moderation.location.searchLabel']} class="mod-field">
      <span class="search-row">
        <Input
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
          intent="neutral"
          disabled={searching || query.trim().length < 3}
          onclick={() => void search()}
        >
          {searching
            ? copy['moderation.location.searching']
            : copy['moderation.location.searchAction']}
        </Button>
      </span>
    </Field>
    <small>{copy['moderation.location.searchHelp']}</small>
  </div>

  {#if results.length > 0}
    <section class="search-results" aria-label={copy['moderation.location.resultsLabel']}>
      {#each results as result (result.id)}
        <button type="button" onclick={() => chooseResult(result)}>{result.label}</button>
      {/each}
    </section>
  {:else if searchState === 'empty'}
    <p class="search-note" role="status">{copy['moderation.location.searchEmpty']}</p>
  {:else if searchState === 'unavailable'}
    <p class="search-note" role="status">{copy['moderation.location.searchUnavailable']}</p>
  {/if}

  <div class="map-heading">
    <p>{copy['moderation.location.mapHelp']}</p>
    <Button intent="neutral" onclick={useMapCenter}>
      {copy['moderation.location.useMapCenter']}
    </Button>
  </div>
  <MapSurface
    adapter={mapAdapter}
    {places}
    selectedPlaceId="moderation-location"
    {camera}
    {copy}
    onMarkerSelect={() => undefined}
    onMarkerMove={(_placeId, point) => selectPoint(point)}
    onCameraChange={(nextCamera) => (camera = nextCamera)}
    onMapSelect={selectPoint}
    compact
  />

  <details class="manual-details">
    <summary>{copy['moderation.location.editDetails']}</summary>
    <div class="field-grid">
      <Field label={copy['moderation.addressLabel']} class="mod-field wide">
        <Input
          required
          value={value.addressLine}
          oninput={(event) => updateField('addressLine', event.currentTarget.value)}
        />
      </Field>
      <Field label={copy['moderation.localityLabel']} class="mod-field">
        <Input
          required
          value={value.locality}
          oninput={(event) => updateField('locality', event.currentTarget.value)}
        />
      </Field>
      <Field label={copy['moderation.postalCodeLabel']} class="mod-field">
        <Input
          required
          pattern="[0-9][0-9][0-9]"
          value={value.postalCode}
          oninput={(event) => updateField('postalCode', event.currentTarget.value)}
        />
      </Field>
      <Field label={copy['moderation.municipalityLabel']} class="mod-field">
        <Select
          required
          aria-label={copy['moderation.municipalityLabel']}
          value={value.municipality}
          onchange={(event) => updateField('municipality', event.currentTarget.value)}
        >
          <option value="reykjavik">Reykjavík</option>
          <option value="kopavogur">Kópavogur</option>
          <option value="seltjarnarnes">Seltjarnarnes</option>
          <option value="gardabaer">Garðabær</option>
          <option value="hafnarfjordur">Hafnarfjörður</option>
          <option value="mosfellsbaer">Mosfellsbær</option>
          <option value="kjosarhreppur">Kjósarhreppur</option>
        </Select>
      </Field>
      <Field label={copy['moderation.latitudeLabel']} class="mod-field">
        <Input
          required
          type="number"
          inputmode="decimal"
          min="-90"
          max="90"
          step="any"
          value={value.latitude}
          oninput={(event) => updateField('latitude', Number(event.currentTarget.value))}
        />
      </Field>
      <Field label={copy['moderation.longitudeLabel']} class="mod-field">
        <Input
          required
          type="number"
          inputmode="decimal"
          min="-180"
          max="180"
          step="any"
          value={value.longitude}
          oninput={(event) => updateField('longitude', Number(event.currentTarget.value))}
        />
      </Field>
      <Field label={copy['moderation.geometryPrecisionLabel']} class="mod-field">
        <Select
          required
          aria-label={copy['moderation.geometryPrecisionLabel']}
          value={value.geometryPrecision}
          onchange={(event) => updateField('geometryPrecision', event.currentTarget.value)}
        >
          <option value="moderator_confirmed_point">
            {copy['moderation.geometryPrecision.moderatorConfirmed']}
          </option>
          <option value="official_address_point">
            {copy['moderation.geometryPrecision.officialAddress']}
          </option>
          <option value="official_representative_centroid">
            {copy['moderation.geometryPrecision.officialCentroid']}
          </option>
          <option value="municipality_anchor_pending_geocode">
            {copy['moderation.geometryPrecision.pending']}
          </option>
        </Select>
      </Field>
      <Field label={copy['moderation.geometrySourceLabel']} class="mod-field wide">
        <Input
          required
          value={value.geometrySource}
          oninput={(event) => updateField('geometrySource', event.currentTarget.value)}
        />
      </Field>
    </div>
  </details>

  <input type="hidden" name="addressLine" value={value.addressLine} />
  <input type="hidden" name="locality" value={value.locality} />
  <input type="hidden" name="postalCode" value={value.postalCode} />
  <input type="hidden" name="municipality" value={value.municipality} />
  <input type="hidden" name="latitude" value={value.latitude} />
  <input type="hidden" name="longitude" value={value.longitude} />
  <input type="hidden" name="geometryPrecision" value={value.geometryPrecision} />
  <input type="hidden" name="geometrySource" value={value.geometrySource} />
  <p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>
</div>

<style>
  .location-editor {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
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

  .search-note,
  .map-heading p {
    margin: 0;
    color: var(--hv-color-basalt-muted);
  }

  .map-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .manual-details {
    border-top: 1px solid color-mix(in srgb, var(--hv-color-basalt) 18%, transparent);
    padding-top: 0.75rem;
  }

  .manual-details summary {
    cursor: pointer;
    color: var(--hv-color-fjord);
    font-weight: 800;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .field-grid :global(.wide) {
    grid-column: 1 / -1;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  @media (max-width: 42rem) {
    .search-row,
    .field-grid {
      grid-template-columns: 1fr;
    }

    .field-grid :global(.wide) {
      grid-column: auto;
    }
  }
</style>
