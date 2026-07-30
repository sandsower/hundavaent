<script lang="ts">
  import { untrack } from 'svelte';

  import { resolve } from '$app/paths';

  import CheckInHistoryList from '$lib/personal-history/CheckInHistoryList.svelte';
  import PersonalMapView from '$lib/personal-history/PersonalMapView.svelte';
  import { createFailingMapAdapter } from '$lib/map/failing-adapter';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter } from '$lib/map/types';
  import { Eyebrow, Meta, PageHeader, PageShell, PageTitle } from '@hundavaent/design-system';

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

<PageShell aria-labelledby="history-title">
  <PageHeader class="mb-section">
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle id="history-title">{data.copy['history.title']}</PageTitle>
    <Meta>{data.copy['history.intro']}</Meta>
  </PageHeader>

  <nav class="history-tabs flex flex-wrap items-center gap-actions" aria-label={data.copy['history.title']}>
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      class="hv-control"
      data-intent={data.view === 'checkins' ? 'selected' : undefined}
      href={tabHref('checkins')}
      aria-current={data.view === 'checkins' ? 'page' : undefined}
    >
      {data.copy['history.tabCheckIns']}
    </a>
    <a
      class="hv-control"
      data-intent={data.view === 'map' ? 'selected' : undefined}
      href={tabHref('map')}
      aria-current={data.view === 'map' ? 'page' : undefined}
    >
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
</PageShell>

<style>
  .history-tabs {
    justify-content: start;
    margin-top: var(--hv-space-context);
  }
</style>
