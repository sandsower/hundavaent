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
  <section class="empty" aria-labelledby="history-map-empty-title">
    <span aria-hidden="true">🗺️</span>
    <h2 id="history-map-empty-title" tabindex="-1">{copy['history.emptyMapTitle']}</h2>
    <p>{copy['history.emptyMapBody']}</p>
    <a href={resolve('/[lang=lang]', { lang })}>{copy['favourite.backToDiscovery']}</a>
  </section>
{:else}
  {#if truncated}
    <p class="truncation-note" role="status">
      {copy['history.mapTruncated'].replace('{count}', String(limit))}
    </p>
  {/if}
  <div class="map-view">
    <div class="map-surface">
      {#if mappablePlaces.length === 0}
        <section class="map-empty" aria-labelledby="history-map-withheld-title">
          <span aria-hidden="true">🗺️</span>
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
    <ul class="map-list" aria-label={copy['history.tabMap']}>
      {#each places as place (place.placeId)}
        <li class:selected={place.placeId === selectedPlaceId}>
          {#if hasCoordinates(place)}
            <button
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
            <a href={discoveryPlaceHref(place.placeId)}
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
    margin: 1.5rem 0 0;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: var(--paper-light);
    color: var(--ink-soft);
    font-weight: 700;
  }
  .map-view {
    display: grid;
    margin-top: 1.5rem;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) 20rem;
  }
  .map-surface {
    min-height: 24rem;
    overflow: hidden;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
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
  .map-empty span {
    font-size: 3rem;
  }
  .map-empty h2,
  .map-empty p {
    margin: 0;
  }
  .map-list {
    display: grid;
    align-content: start;
    margin: 0;
    padding: 0;
    gap: 0.5rem;
    list-style: none;
  }
  .map-list li {
    display: grid;
    padding: 0.6rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    gap: 0.35rem;
    background: var(--paper-light);
  }
  .map-list li.selected {
    background: var(--sun);
  }
  .map-list button {
    padding: 0;
    border: none;
    background: none;
    color: var(--ink);
    font-weight: 900;
    text-align: left;
    cursor: pointer;
  }
  .map-list strong {
    color: var(--ink-soft);
  }
  .empty {
    display: grid;
    max-width: 34rem;
    margin-top: 2rem;
    padding: 2rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    gap: 0.6rem;
    background: var(--paper-light);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--amber);
  }
  .empty span {
    font-size: 3rem;
  }
  .empty h2,
  .empty p {
    margin: 0;
  }
  .empty a {
    display: inline-block;
    min-height: 2.75rem;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    font-weight: 900;
    text-align: center;
  }
  @media (max-width: 45rem) {
    .map-view {
      grid-template-columns: 1fr;
    }
  }
</style>
