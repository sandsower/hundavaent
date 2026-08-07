<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';

  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import { subscribeToFavouriteInvalidation } from '$lib/favourites/sync';
  import type { FavouriteAvailability } from '$server/favourites/favourites';
  import {
    Button,
    Eyebrow,
    Meta,
    PageHeader,
    PageShell,
    PageTitle,
    Panel,
    Status
  } from '@hundavaent/design-system';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let locallyRemovedPlaceIds = $state<string[]>([]);
  let savedPlaces = $derived(
    data.savedPlaces.filter((place) => !locallyRemovedPlaceIds.includes(place.placeId))
  );
  let announcement = $state('');
  let refreshing = false;
  let refreshQueued = false;
  let mutationEpoch = 0;

  onMount(() => subscribeToFavouriteInvalidation(refreshFromOtherTab));

  function refreshFromOtherTab(): void {
    if (refreshing) {
      refreshQueued = true;
      return;
    }

    refreshing = true;
    const refreshMutationEpoch = mutationEpoch;
    void invalidateAll()
      .then(() => {
        if (refreshMutationEpoch === mutationEpoch) {
          locallyRemovedPlaceIds = [];
        } else {
          refreshQueued = true;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing = false;
        if (refreshQueued) {
          refreshQueued = false;
          refreshFromOtherTab();
        }
      });
  }

  async function removeSavedPlace(
    placeId: string,
    favourite: boolean,
    trigger: HTMLButtonElement
  ): Promise<void> {
    if (favourite) return;
    const removedIndex = savedPlaces.findIndex((place) => place.placeId === placeId);
    if (removedIndex < 0) return;

    const removedPlace = savedPlaces[removedIndex];
    mutationEpoch += 1;
    locallyRemovedPlaceIds = [...new Set([...locallyRemovedPlaceIds, placeId])];
    if (refreshing) refreshQueued = true;
    announcement = data.copy['favourite.removedAnnouncement'].replace('{name}', removedPlace.name);
    await tick();

    const remainingButtons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-saved-row] [data-favourite-place] button'
      )
    ];
    const nextButton = remainingButtons[Math.min(removedIndex, remainingButtons.length - 1)];
    if (nextButton) {
      nextButton.focus();
      return;
    }

    document.querySelector<HTMLElement>('[data-saved-empty-heading]')?.focus();
    if (trigger.isConnected) trigger.blur();
  }

  function availabilityLabel(availability: FavouriteAvailability): string {
    if (availability === 'inactive') return data.copy['favourite.inactive'];
    if (availability === 'unavailable') return data.copy['favourite.unavailable'];
    return data.copy['favourite.available'];
  }

  function discoveryPlaceHref(placeId: string): string {
    const path = resolve('/[lang=lang]', { lang: data.lang });
    const query = new URLSearchParams({ place: placeId });
    return `${path}?${query}`;
  }

  function nextPageHref(beforeSavedAt: string, beforePlaceId: string): string {
    const path = resolve('/[lang=lang]/favorites', { lang: data.lang });
    const query = new URLSearchParams({
      before: beforeSavedAt,
      beforePlace: beforePlaceId
    });
    return `${path}?${query}`;
  }
</script>

<svelte:head>
  <title>{data.copy['favourite.savedTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<PageShell width="narrow" aria-labelledby="saved-title">
  <PageHeader class="mb-section">
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle id="saved-title">{data.copy['favourite.savedTitle']}</PageTitle>
    <Meta>{data.copy['favourite.savedIntro']}</Meta>
  </PageHeader>

  {#if savedPlaces.length === 0 && data.isFirstPage}
    <Panel
      as="section"
      class="saved-empty-state grid gap-context"
      aria-labelledby="saved-empty-title"
    >
      <h2 id="saved-empty-title" class="m-0" data-saved-empty-heading tabindex="-1">
        {data.copy['favourite.emptyTitle']}
      </h2>
      <p class="m-0">{data.copy['favourite.emptyBody']}</p>
      <Button href={resolve('/[lang=lang]', { lang: data.lang })} intent="primary">
        {data.copy['favourite.backToDiscovery']}
      </Button>
    </Panel>
  {:else if savedPlaces.length === 0}
    <Panel
      as="section"
      class="saved-empty-state grid gap-context"
      aria-labelledby="saved-page-empty-title"
    >
      <h2 id="saved-page-empty-title" class="m-0" data-saved-empty-heading tabindex="-1">
        {data.copy['favourite.pageEmptyTitle']}
      </h2>
      <p class="m-0">{data.copy['favourite.pageEmptyBody']}</p>
      <Button href={resolve('/[lang=lang]/favorites', { lang: data.lang })} intent="primary">
        {data.copy['favourite.pageEmptyAction']}
      </Button>
    </Panel>
  {:else}
    <ul
      class="saved-list grid gap-context m-0 p-0 list-none [margin-block:calc(var(--hv-space-context)*1.5)]!"
      aria-label={data.copy['favourite.savedTitle']}
    >
      {#each savedPlaces as place (place.placeId)}
        <Panel
          as="li"
          padded
          data-saved-row
          class={`saved-card${place.availability !== 'available' ? ' unavailable' : ''}`}
        >
          <div class="grid gap-context">
            <h2 class="m-0">{place.name}</h2>
            <Meta>{place.locality}</Meta>
            <Status
              tone={place.availability === 'available' ? undefined : 'attention'}
              data-status={place.availability === 'available' ? undefined : 'attention'}
            >
              {availabilityLabel(place.availability)}
            </Status>
            {#if place.availability !== 'available'}
              <Meta as="small">
                {place.availability === 'inactive'
                  ? data.copy['favourite.inactiveHelp']
                  : data.copy['favourite.unavailableHelp']}
              </Meta>
            {/if}
            {#if place.availability === 'inactive' && place.successorPlaceId && place.successorName}
              <p class="successor m-0 font-bold text-basalt-muted">
                {data.copy['history.successorNote'].replace('{name}', place.successorName)}
              </p>
            {/if}
          </div>
          <div
            class="saved-actions flex flex-wrap items-center gap-actions content-start justify-end max-[35rem]:justify-stretch"
          >
            {#if place.availability === 'available'}
              <!-- The helper resolves the localized internal path before adding encoded query data. -->
              <Button href={discoveryPlaceHref(place.placeId)}>
                {data.copy['directory.openPlace']}
              </Button>
            {:else if place.successorPlaceId && place.successorAvailable}
              <Button href={discoveryPlaceHref(place.successorPlaceId)}>
                {data.copy['history.successorLink'].replace('{name}', place.successorName ?? '')}
              </Button>
            {/if}
            <FavouriteControl
              placeId={place.placeId}
              placeName={place.name}
              signedIn={true}
              favourite={true}
              copy={data.copy}
              signInHref=""
              onChange={removeSavedPlace}
            />
          </div>
        </Panel>
      {/each}
    </ul>

    {#if data.nextCursor}
      <!-- The helper resolves the localized internal path before adding encoded cursor data. -->
      <Button
        href={nextPageHref(data.nextCursor.beforeSavedAt, data.nextCursor.beforePlaceId)}
        intent="primary"
        class="saved-next-page"
      >
        {data.copy['favourite.nextPage']}
      </Button>
    {/if}
  {/if}
</PageShell>

<p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>

<style>
  :global(.saved-card) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--hv-space-panel);
  }

  :global(.saved-card.unavailable) {
    background: var(--hv-color-snow);
  }

  :global(.saved-card small) {
    max-width: 42ch;
  }

  :global(.saved-empty-state) {
    max-width: 34rem;
    margin-top: calc(var(--hv-space-context) * 1.5);
    padding: var(--hv-space-panel);
  }

  /* Button's rendered anchor has no native wrapping ancestor here - the same rootless situation
     .saved-card/.saved-empty-state above already carry. */
  :global(.saved-next-page) {
    margin-top: 0.75rem;
  }

  @media (max-width: 35rem) {
    :global(.saved-card) {
      grid-template-columns: 1fr;
    }
  }
</style>
