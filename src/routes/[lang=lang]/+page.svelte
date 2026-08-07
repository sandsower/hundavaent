<script lang="ts">
  import { untrack } from 'svelte';

  import MapListShell from '$lib/discovery/MapListShell.svelte';
  import { createFailingMapAdapter } from '$lib/map/failing-adapter';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter } from '$lib/map/types';

  import type { PageProps } from './$types';

  const publicDirectoryClusterRadiusPixels = 40;

  let { data }: PageProps = $props();
  let mapAdapter = $state<MapAdapter>(
    untrack(() =>
      data.forceMapFailure
        ? createFailingMapAdapter()
        : createMapLibreAdapter({
            style: data.mapStyleUrl ?? emptyMapLibreStyle,
            clusterRadiusPixels: publicDirectoryClusterRadiusPixels,
            clusterLabel: (count) =>
              data.copy['directory.clusterCount'].replace('{count}', String(count))
          })
    )
  );
</script>

<svelte:head>
  <title>{data.copy['directory.title']}</title>
</svelte:head>

<!-- The map owns the full viewport; the app header floats above it. -->
<main class="directory-shell w-full h-dvh overflow-hidden" data-ui-mode="place">
  <MapListShell
    places={data.places}
    lang={data.lang}
    copy={data.copy}
    initialState={data.discoveryState}
    adapter={mapAdapter}
    signedIn={data.signedIn === true}
    favouritesAvailable={data.favouritesAvailable === true}
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

  /* Without JavaScript the header returns to flow and the server-rendered
     directory scrolls as a normal document. */
  :global(body:has(.noscript-results)) .directory-shell {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
</style>
