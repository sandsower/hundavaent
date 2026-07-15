<script lang="ts">
  import { untrack } from 'svelte';

  import { resolve } from '$app/paths';

  import type { Catalogue, Locale } from '$i18n';
  import MapSurface from '$lib/map/MapSurface.svelte';
  import type { MapAdapter, MapCamera } from '$lib/map/types';
  import type { PersonalPlace } from '$server/personal-history/personal-history';

  type MappablePersonalPlace = PersonalPlace & { latitude: number; longitude: number };

  interface Props {
    places: PersonalPlace[];
    lang: Locale;
    copy: Catalogue;
    adapter: MapAdapter;
    truncated?: boolean;
    limit?: number;
  }

  let { places, lang, copy, adapter, truncated = false, limit = 200 }: Props = $props();
  let mappablePlaces = $derived(places.filter(hasCoordinates));
  let selectedPlaceId = $state<string | null>(null);
  // The initial camera only needs to frame the Places available when this view first mounts;
  // later Place-list changes (e.g. re-fetching the same "all" projection) should not recenter a
  // camera the Member may have already panned, so only the initial value is captured here.
  let camera = $state<MapCamera>(untrack(() => defaultCamera(mappablePlaces)));

  function hasCoordinates(place: PersonalPlace): place is MappablePersonalPlace {
    return place.latitude !== null && place.longitude !== null;
  }

  function defaultCamera(list: MappablePersonalPlace[]): MapCamera {
    if (list.length === 0) {
      return { latitude: 64.1466, longitude: -21.9426, zoom: 10 };
    }
    const latitude = list.reduce((sum, place) => sum + place.latitude, 0) / list.length;
    const longitude = list.reduce((sum, place) => sum + place.longitude, 0) / list.length;
    return { latitude, longitude, zoom: list.length === 1 ? 14 : 11 };
  }

  function selectPlace(placeId: string): void {
    selectedPlaceId = placeId;
    adapter.focusPlace(placeId);
  }

  function discoveryPlaceHref(placeId: string): string {
    const path = resolve('/[lang=lang]', { lang });
    const query = new URLSearchParams({ place: placeId });
    return `${path}?${query}`;
  }
</script>

{#if places.length === 0}
  <section class="empty-state hv-panel hv-stack" aria-labelledby="history-map-empty-title">
    <h2 id="history-map-empty-title" tabindex="-1">{copy['history.emptyMapTitle']}</h2>
    <p>{copy['history.emptyMapBody']}</p>
    <a class="hv-control" data-intent="primary" href={resolve('/[lang=lang]', { lang })}
      >{copy['favourite.backToDiscovery']}</a
    >
  </section>
{:else}
  {#if truncated}
    <p class="truncation-note hv-notice" data-tone="info" role="status">
      {copy['history.mapTruncated'].replace('{count}', String(limit))}
    </p>
  {/if}
  <div class="map-view">
    <div class="map-surface hv-panel">
      {#if mappablePlaces.length === 0}
        <section class="map-empty hv-stack" aria-labelledby="history-map-withheld-title">
          <h2 id="history-map-withheld-title" tabindex="-1">{copy['history.emptyMapTitle']}</h2>
          <p>{copy['history.emptyMapBody']}</p>
        </section>
      {:else}
        <MapSurface
          {adapter}
          places={mappablePlaces.map((place) => ({
            placeId: place.placeId,
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude
          }))}
          {selectedPlaceId}
          {camera}
          {copy}
          onMarkerSelect={selectPlace}
          onCameraChange={(nextCamera) => (camera = nextCamera)}
        >
          {#snippet failureContent()}
            <div class="map-failure">
              <p>{copy['directory.mapUnavailableTitle']}</p>
              <p>{copy['directory.mapUnavailableBody']}</p>
            </div>
          {/snippet}
        </MapSurface>
      {/if}
    </div>
    <ul class="map-list hv-list" aria-label={copy['history.tabMap']}>
      {#each places as place (place.placeId)}
        <li
          class="map-card hv-list-card hv-panel"
          class:selected={place.placeId === selectedPlaceId}
        >
          {#if hasCoordinates(place)}
            <button
              class="hv-control"
              data-intent={place.placeId === selectedPlaceId ? 'selected' : undefined}
              type="button"
              aria-pressed={place.placeId === selectedPlaceId}
              onclick={() => selectPlace(place.placeId)}
            >
              {place.name}
            </button>
          {:else}
            <strong>{place.name}</strong>
          {/if}
          {#if place.availability === 'available'}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="hv-control" href={discoveryPlaceHref(place.placeId)}
              >{copy['directory.viewPlace'].replace('{name}', place.name)}</a
            >
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .truncation-note {
    max-width: 42ch;
    margin: calc(var(--hv-space-context) * 1.5) 0 0;
  }

  .map-view {
    display: grid;
    margin-top: calc(var(--hv-space-context) * 1.5);
    gap: var(--hv-space-context);
    grid-template-columns: minmax(0, 1fr) 20rem;
  }

  .map-surface {
    min-height: 24rem;
    overflow: hidden;
  }

  .map-failure {
    display: grid;
    height: 100%;
    padding: 1.5rem;
    place-content: center;
    gap: 0.5rem;
    text-align: center;
  }

  .map-empty {
    display: grid;
    min-height: 24rem;
    padding: 1.5rem;
    place-content: center;
    gap: 0.5rem;
    text-align: center;
  }

  .map-empty h2,
  .map-empty p {
    margin: 0;
  }

  .map-list {
    align-content: start;
    margin: 0;
  }

  .map-card {
    display: grid;
    gap: 0.5rem;
  }

  .map-card.selected {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-signal-soft);
  }

  .map-card button {
    justify-content: start;
    text-align: left;
    cursor: pointer;
  }

  .map-card strong {
    color: var(--hv-color-basalt-muted);
  }

  .empty-state {
    max-width: 34rem;
    margin-top: calc(var(--hv-space-context) * 1.5);
    padding: var(--hv-space-panel);
  }

  .empty-state h2,
  .empty-state p {
    margin: 0;
  }

  @media (max-width: 45rem) {
    .map-view {
      grid-template-columns: 1fr;
    }
  }
</style>
