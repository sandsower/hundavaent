<script lang="ts">
  import { untrack } from 'svelte';

  import { resolve } from '$app/paths';

  import CheckInHistoryList from '$lib/personal-history/CheckInHistoryList.svelte';
  import PersonalMapView from '$lib/personal-history/PersonalMapView.svelte';
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

  function tabHref(view: 'checkins' | 'map'): string {
    const path = resolve('/[lang=lang]/history', { lang: data.lang });
    return view === 'checkins' ? path : `${path}?${new URLSearchParams({ view })}`;
  }
</script>

<svelte:head>
  <title>{data.copy['history.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="history-shell" aria-labelledby="history-title">
  <header>
    <p class="eyebrow">{data.copy['site.name']}</p>
    <h1 id="history-title">{data.copy['history.title']}</h1>
    <p>{data.copy['history.intro']}</p>
  </header>

  <nav class="tabs" aria-label={data.copy['history.title']}>
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a href={tabHref('checkins')} aria-current={data.view === 'checkins' ? 'page' : undefined}>
      {data.copy['history.tabCheckIns']}
    </a>
    <a href={tabHref('map')} aria-current={data.view === 'map' ? 'page' : undefined}>
      {data.copy['history.tabMap']}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </nav>

  {#if data.view === 'checkins'}
    <CheckInHistoryList
      checkIns={data.checkIns ?? []}
      lang={data.lang}
      copy={data.copy}
      isFirstPage={data.isFirstPage ?? true}
      nextCursor={data.nextCheckInCursor ?? null}
    />
  {:else}
    <PersonalMapView
      places={data.mapPlaces ?? []}
      lang={data.lang}
      copy={data.copy}
      adapter={mapAdapter}
      truncated={data.mapTruncated ?? false}
      limit={data.mapLimit ?? 200}
    />
  {/if}
</main>

<style>
  .history-shell {
    width: min(100% - 2rem, 64rem);
    margin: 0 auto;
    padding: clamp(1.5rem, 5vw, 4rem) 0 4rem;
  }
  header {
    max-width: 40rem;
  }
  .eyebrow {
    color: var(--coral-dark);
    font-size: 0.78rem;
    font-weight: 950;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0.25rem 0;
    font-size: clamp(2.5rem, 9vw, 5rem);
    letter-spacing: -0.055em;
    line-height: 0.95;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    margin-top: 1.5rem;
    gap: 0.5rem;
  }
  .tabs a {
    padding: 0.6rem 1rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--paper-light);
    color: var(--ink);
    font-weight: 900;
    text-decoration: none;
  }
  .tabs a[aria-current='page'] {
    background: var(--sun);
  }
</style>
