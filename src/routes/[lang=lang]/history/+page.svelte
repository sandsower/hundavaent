<script lang="ts">
  import { untrack } from 'svelte';

  import { resolve } from '$app/paths';

  import CheckInHistoryList from '$lib/personal-history/CheckInHistoryList.svelte';
  import PersonalMapView from '$lib/personal-history/PersonalMapView.svelte';
  import { createFailingMapAdapter } from '$lib/map/failing-adapter';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter } from '$lib/map/types';
  import {
    Button,
    Eyebrow,
    Meta,
    PageHeader,
    PageShell,
    PageTitle
  } from '@hundavaent/design-system';

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

  <nav
    class="history-tabs flex flex-wrap items-center justify-start gap-actions mt-context"
    aria-label={data.copy['history.title']}
  >
    <Button
      href={tabHref('checkins')}
      intent={data.view === 'checkins' ? 'committed' : 'neutral'}
      aria-current={data.view === 'checkins' ? 'page' : undefined}
    >
      {data.copy['history.tabCheckIns']}
    </Button>
    <Button
      href={tabHref('map')}
      intent={data.view === 'map' ? 'committed' : 'neutral'}
      aria-current={data.view === 'map' ? 'page' : undefined}
    >
      {data.copy['history.tabMap']}
    </Button>
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
