<script lang="ts">
  import { untrack } from 'svelte';

  import MapListShell from '$lib/discovery/MapListShell.svelte';
  import { createFailingMapAdapter } from '$lib/map/failing-adapter';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter } from '$lib/map/types';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let mapAdapter = $state<MapAdapter>(
    untrack(() =>
      data.forceMapFailure
        ? createFailingMapAdapter()
        : createMapLibreAdapter({
            style: data.mapStyleUrl ?? emptyMapLibreStyle,
            clusterLabel: (count) =>
              data.copy['directory.clusterCount'].replace('{count}', String(count))
          })
    )
  );
</script>

<svelte:head>
  <title>{data.copy['directory.title']}</title>
</svelte:head>

<main class="directory-shell" data-ui-mode="place">
  <MapListShell
    places={data.places}
    lang={data.lang}
    copy={data.copy}
    initialState={data.discoveryState}
    adapter={mapAdapter}
    signedIn={data.signedIn === true}
    initialFavouritePlaceIds={data.favouritePlaceIds ?? []}
    proximityAssistEnabled={data.proximityAssistEnabled === true}
    fitPlacesOnMount={data.fitPlacesOnMount === true}
  />
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--hv-color-snow);
    color: var(--hv-color-basalt);
    font-family: var(--font-sans);
  }

  .directory-shell {
    width: 100%;
    height: calc(100dvh - var(--hv-app-header-height, 4.4rem));
    overflow: hidden;
  }

  @media (min-width: 58.0625rem) {
    :global(body:has(.noscript-results)) .directory-shell {
      height: auto;
      min-height: calc(100dvh - var(--hv-app-header-height, 4.4rem));
      overflow: visible;
    }

    :global(body:has(.noscript-results)) .directory-shell :global(.map-list-shell) {
      height: calc(100dvh - var(--hv-app-header-height, 4.4rem));
    }
  }

  @media (max-width: 58rem) {
    .directory-shell {
      height: auto;
      min-height: calc(100dvh - var(--hv-app-header-height, 7.5rem));
      overflow: visible;
    }
  }
</style>
