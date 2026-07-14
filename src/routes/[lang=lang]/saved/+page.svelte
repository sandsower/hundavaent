<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';

  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import { subscribeToFavouriteInvalidation } from '$lib/favourites/sync';
  import type { FavouriteAvailability } from '$server/favourites/favourites';

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
    const path = resolve('/[lang=lang]/saved', { lang: data.lang });
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

<main class="hv-page-shell" data-width="narrow" data-ui-mode="place" aria-labelledby="saved-title">
  <header class="hv-page-header">
    <div class="hv-stack">
      <p class="hv-eyebrow">{data.copy['site.name']}</p>
      <h1 id="saved-title" class="hv-page-title">{data.copy['favourite.savedTitle']}</h1>
      <p class="hv-meta">{data.copy['favourite.savedIntro']}</p>
    </div>
  </header>

  {#if savedPlaces.length === 0 && data.isFirstPage}
    <section class="empty-state hv-panel hv-stack" aria-labelledby="saved-empty-title">
      <h2 id="saved-empty-title" data-saved-empty-heading tabindex="-1">
        {data.copy['favourite.emptyTitle']}
      </h2>
      <p>{data.copy['favourite.emptyBody']}</p>
      <a
        class="hv-control"
        data-intent="primary"
        href={resolve('/[lang=lang]', { lang: data.lang })}
      >
        {data.copy['favourite.backToDiscovery']}
      </a>
    </section>
  {:else if savedPlaces.length === 0}
    <section class="empty-state hv-panel hv-stack" aria-labelledby="saved-page-empty-title">
      <h2 id="saved-page-empty-title" data-saved-empty-heading tabindex="-1">
        {data.copy['favourite.pageEmptyTitle']}
      </h2>
      <p>{data.copy['favourite.pageEmptyBody']}</p>
      <a
        class="hv-control"
        data-intent="primary"
        href={resolve('/[lang=lang]/saved', { lang: data.lang })}
      >
        {data.copy['favourite.pageEmptyAction']}
      </a>
    </section>
  {:else}
    <ul class="hv-list saved-list" aria-label={data.copy['favourite.savedTitle']}>
      {#each savedPlaces as place (place.placeId)}
        <li
          class="saved-card hv-list-card hv-panel"
          data-saved-row
          class:unavailable={place.availability !== 'available'}
        >
          <div class="hv-stack">
            <h2>{place.name}</h2>
            <p class="hv-meta">{place.locality}</p>
            <strong
              class="hv-status"
              data-status={place.availability === 'available' ? undefined : 'attention'}
              >{availabilityLabel(place.availability)}</strong
            >
            {#if place.availability !== 'available'}
              <small class="hv-meta">
                {place.availability === 'inactive'
                  ? data.copy['favourite.inactiveHelp']
                  : data.copy['favourite.unavailableHelp']}
              </small>
            {/if}
            {#if place.availability === 'inactive' && place.successorPlaceId && place.successorName}
              <p class="successor">
                {data.copy['history.successorNote'].replace('{name}', place.successorName)}
              </p>
            {/if}
          </div>
          <div class="saved-actions hv-page-actions">
            {#if place.availability === 'available'}
              <!-- The helper resolves the localized internal path before adding encoded query data. -->
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a class="hv-control" href={discoveryPlaceHref(place.placeId)}
                >{data.copy['directory.openPlace']}</a
              >
            {:else if place.successorPlaceId && place.successorAvailable}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a class="hv-control" href={discoveryPlaceHref(place.successorPlaceId)}>
                {data.copy['history.successorLink'].replace('{name}', place.successorName ?? '')}
              </a>
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
        </li>
      {/each}
    </ul>

    {#if data.nextCursor}
      <!-- The helper resolves the localized internal path before adding encoded cursor data. -->
      <!-- eslint-disable svelte/no-navigation-without-resolve -->
      <a
        class="next-page hv-control"
        data-intent="primary"
        href={nextPageHref(data.nextCursor.beforeSavedAt, data.nextCursor.beforePlaceId)}
        >{data.copy['favourite.nextPage']}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {/if}
  {/if}
</main>

<p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>

<style>
  .saved-list {
    margin-block: calc(var(--hv-space-context) * 1.5);
  }

  .saved-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--hv-space-panel);
  }

  .saved-card.unavailable {
    background: var(--hv-color-snow);
  }

  h2,
  .saved-card p {
    margin: 0;
  }

  .successor {
    color: var(--hv-color-basalt-muted);
    font-weight: 700;
  }

  .saved-card small {
    max-width: 42ch;
  }

  .saved-actions {
    align-content: start;
    justify-content: end;
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

  .next-page {
    margin-top: 0.75rem;
  }

  @media (max-width: 35rem) {
    .saved-card {
      grid-template-columns: 1fr;
    }

    .saved-actions {
      justify-content: stretch;
    }
  }
</style>
