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

<main class="saved-shell" aria-labelledby="saved-title">
  <header>
    <p class="eyebrow">{data.copy['site.name']}</p>
    <h1 id="saved-title">{data.copy['favourite.savedTitle']}</h1>
    <p>{data.copy['favourite.savedIntro']}</p>
  </header>

  {#if savedPlaces.length === 0 && data.isFirstPage}
    <section class="empty" aria-labelledby="saved-empty-title">
      <span aria-hidden="true">♡</span>
      <h2 id="saved-empty-title" data-saved-empty-heading tabindex="-1">
        {data.copy['favourite.emptyTitle']}
      </h2>
      <p>{data.copy['favourite.emptyBody']}</p>
      <a href={resolve('/[lang=lang]', { lang: data.lang })}>
        {data.copy['favourite.backToDiscovery']}
      </a>
    </section>
  {:else if savedPlaces.length === 0}
    <section class="empty" aria-labelledby="saved-page-empty-title">
      <span aria-hidden="true">♡</span>
      <h2 id="saved-page-empty-title" data-saved-empty-heading tabindex="-1">
        {data.copy['favourite.pageEmptyTitle']}
      </h2>
      <p>{data.copy['favourite.pageEmptyBody']}</p>
      <a href={resolve('/[lang=lang]/saved', { lang: data.lang })}>
        {data.copy['favourite.pageEmptyAction']}
      </a>
    </section>
  {:else}
    <ul aria-label={data.copy['favourite.savedTitle']}>
      {#each savedPlaces as place (place.placeId)}
        <li data-saved-row class:unavailable={place.availability !== 'available'}>
          <div>
            <h2>{place.name}</h2>
            <p>{place.locality}</p>
            <strong>{availabilityLabel(place.availability)}</strong>
            {#if place.availability !== 'available'}
              <small>
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
          <div class="actions">
            {#if place.availability === 'available'}
              <!-- The helper resolves the localized internal path before adding encoded query data. -->
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={discoveryPlaceHref(place.placeId)}>{data.copy['directory.openPlace']}</a>
            {:else if place.successorPlaceId && place.successorAvailable}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={discoveryPlaceHref(place.successorPlaceId)}>
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
        class="next-page"
        href={nextPageHref(data.nextCursor.beforeSavedAt, data.nextCursor.beforePlaceId)}
        >{data.copy['favourite.nextPage']}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {/if}
  {/if}
</main>

<p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>

<style>
  .saved-shell {
    width: min(100% - 2rem, 56rem);
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
  ul {
    display: grid;
    margin: 2rem 0;
    padding: 0;
    gap: 1rem;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 1rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    gap: 1rem;
    background: var(--paper-light);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--teal);
  }
  li.unavailable {
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--paper-deep);
  }
  h2,
  li p {
    margin: 0;
  }
  li strong,
  li small {
    display: block;
    margin-top: 0.35rem;
  }
  .successor {
    margin-top: 0.65rem;
    color: var(--ink-soft);
  }
  li small {
    max-width: 42ch;
    color: var(--ink-soft);
  }
  .actions {
    display: grid;
    gap: 0.5rem;
    align-content: start;
  }
  .actions > a,
  .empty a,
  .next-page {
    min-height: 2.75rem;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    font-weight: 900;
    text-align: center;
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
  .next-page {
    display: inline-block;
  }
  @media (max-width: 35rem) {
    li {
      grid-template-columns: 1fr;
    }
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
