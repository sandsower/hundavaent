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

<main class="directory-shell">
  <section>
    <MapListShell
      places={data.places}
      lang={data.lang}
      copy={data.copy}
      initialState={data.discoveryState}
      adapter={mapAdapter}
      signedIn={data.signedIn === true}
      initialFavouritePlaceIds={data.favouritePlaceIds ?? []}
      pendingFavouritePlaceId={data.pendingFavourite ?? null}
      proximityAssistEnabled={data.proximityAssistEnabled === true}
      fitPlacesOnMount={data.fitPlacesOnMount === true}
    />
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f0df;
    color: #193b45;
    font-family: var(--font-sans);
  }

  .directory-shell {
    width: min(100% - 2rem, 96rem);
    margin: 0 auto;
    padding: 1rem 0 1.25rem;
  }
</style>
