<script lang="ts">
  import { untrack } from 'svelte';

  import { resolve } from '$app/paths';

  import { Button, Notice, Panel } from '@hundavaent/design-system';
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
  <Panel
    as="section"
    class="map-empty-state grid gap-context"
    aria-labelledby="history-map-empty-title"
  >
    <h2 id="history-map-empty-title" tabindex="-1">{copy['history.emptyMapTitle']}</h2>
    <p>{copy['history.emptyMapBody']}</p>
    <Button href={resolve('/[lang=lang]', { lang })} intent="primary">
      {copy['favourite.backToDiscovery']}
    </Button>
  </Panel>
{:else}
  {#if truncated}
    <Notice as="p" tone="info" role="status" class="map-truncation-note">
      {copy['history.mapTruncated'].replace('{count}', String(limit))}
    </Notice>
  {/if}
  <div
    class="map-view grid grid-cols-[minmax(0,1fr)_20rem] gap-context [margin-top:calc(var(--hv-space-context)*1.5)] max-[45rem]:grid-cols-[1fr]"
  >
    <Panel class="map-surface">
      {#if mappablePlaces.length === 0}
        <!-- gap-context remains as an existing class, but its gap never rendered.
             The scoped .map-empty gap of 0.5rem won, so gap-2! preserves that rendered winner. -->
        <section
          class="map-empty grid place-content-center min-h-96 gap-context gap-2! p-6 text-center"
          aria-labelledby="history-map-withheld-title"
        >
          <h2 id="history-map-withheld-title" tabindex="-1" class="m-0">
            {copy['history.emptyMapTitle']}
          </h2>
          <p class="m-0">{copy['history.emptyMapBody']}</p>
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
            <div class="map-failure grid place-content-center h-full gap-2 p-6 text-center">
              <p>{copy['directory.mapUnavailableTitle']}</p>
              <p>{copy['directory.mapUnavailableBody']}</p>
            </div>
          {/snippet}
        </MapSurface>
      {/if}
    </Panel>
    <ul
      class="grid gap-context m-0 p-0 list-none map-list content-start"
      aria-label={copy['history.tabMap']}
    >
      {#each places as place (place.placeId)}
        <Panel
          as="li"
          padded
          class={place.placeId === selectedPlaceId ? 'map-card selected' : 'map-card'}
        >
          {#if hasCoordinates(place)}
            <Button
              pressed={place.placeId === selectedPlaceId}
              onclick={() => selectPlace(place.placeId)}
            >
              {place.name}
            </Button>
          {:else}
            <strong>{place.name}</strong>
          {/if}
          {#if place.availability === 'available'}
            <Button href={discoveryPlaceHref(place.placeId)}>
              {copy['directory.viewPlace'].replace('{name}', place.name)}
            </Button>
          {/if}
        </Panel>
      {/each}
    </ul>
  </div>
{/if}

<style>
  /* Notice's root is rendered by a child component, and the truncation banner sits at the top of
     the fragment with no native wrapping element in this component's own template to anchor a
     scoped :global() through - the same rootless situation favorites/+page.svelte's
     .saved-empty-state hook already carries. */
  :global(.map-truncation-note) {
    max-width: 42ch;
    margin: calc(var(--hv-space-context) * 1.5) 0 0;
  }

  /* Panel renders its own element inside a child component, so this component's scoped CSS
     cannot reach it directly - the actual target selector is wrapped in :global() and anchored
     through .map-view, the ancestor idiom FavouriteControl.svelte uses for its own
     child-component call sites. */
  .map-view :global(.map-surface) {
    min-height: 24rem;
    overflow: hidden;
  }

  /* Same child-component reasoning as .map-surface above, anchored through .map-list. Button's
     own rendered <button> is likewise reached only through :global() - it is Button's internal
     root element, not markup this component authors directly - while .selected and strong (both
     written directly as Panel's children here) stay reachable normally once .map-card itself is
     unwrapped. Button already owns cursor: pointer, so only the left-alignment override survives
     here; the scoped rule is unlayered and wins over Button's own justify-center Tailwind utility
     regardless of specificity, per Button.svelte's own cascade-layer note. */
  .map-list :global(.map-card) {
    display: grid;
    gap: 0.5rem;
  }

  .map-list :global(.map-card.selected) {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-signal-soft);
  }

  .map-list :global(.map-card button) {
    justify-content: start;
    text-align: left;
  }

  .map-list :global(.map-card strong) {
    color: var(--hv-color-basalt-muted);
  }

  /* Same rootless situation as .map-truncation-note above. */
  :global(.map-empty-state) {
    max-width: 34rem;
    margin-top: calc(var(--hv-space-context) * 1.5);
    padding: var(--hv-space-panel);
  }

  :global(.map-empty-state) h2,
  :global(.map-empty-state) p {
    margin: 0;
  }
</style>
