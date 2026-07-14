<script lang="ts">
  import { tick } from 'svelte';

  import type { Catalogue, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';

  interface Props {
    place: PublishedPlaceSummary;
    selected: boolean;
    focusSelected?: boolean;
    interactive?: boolean;
    copy: Catalogue;
    onSelect?: (placeId: string, trigger: HTMLButtonElement) => void;
    signedIn?: boolean;
    favourite?: boolean;
    pendingConfirmation?: boolean;
    signInHref?: string;
    onFavouriteChange?: (placeId: string, favourite: boolean) => void;
  }

  let {
    place,
    selected,
    focusSelected = false,
    interactive = true,
    copy,
    onSelect = () => undefined,
    signedIn = false,
    favourite = false,
    pendingConfirmation = false,
    signInHref = '',
    onFavouriteChange = () => undefined
  }: Props = $props();
  let selectButton = $state<HTMLButtonElement>();

  $effect(() => {
    if (selected && focusSelected && selectButton) {
      void tick().then(() => selectButton?.focus());
    }
  });

  const categoryKeys: Record<PlaceCategory, MessageKey> = {
    restaurant: 'category.restaurant',
    cafe: 'category.cafe',
    bar: 'category.bar',
    shop: 'category.shop',
    shopping_centre: 'category.shoppingCentre',
    accommodation: 'category.accommodation',
    park: 'category.park',
    recreation: 'category.recreation',
    culture: 'category.culture',
    service: 'category.service',
    other: 'category.other'
  };
</script>

<article class:selected aria-label={place.name}>
  {#if interactive}
    <button
      type="button"
      class="place-summary"
      data-place-id={place.placeId}
      aria-label={copy['directory.selectPlace'].replace('{name}', place.name)}
      aria-pressed={selected}
      bind:this={selectButton}
      onclick={(event) => onSelect(place.placeId, event.currentTarget)}
    >
      <strong>{place.name}</strong>
      <span>{copy[categoryKeys[place.category]]} · {place.locality}</span>
    </button>
  {:else}
    <div class="place-summary">
      <strong>{place.name}</strong>
      <span>{copy[categoryKeys[place.category]]} · {place.locality}</span>
    </div>
  {/if}
  {#if interactive}
    <FavouriteControl
      placeId={place.placeId}
      placeName={place.name}
      {signedIn}
      {favourite}
      {pendingConfirmation}
      {copy}
      {signInHref}
      onChange={onFavouriteChange}
    />
  {/if}
</article>

<style>
  article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: var(--paper-light);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--amber);
    transition: transform 150ms ease;
  }

  article.selected {
    box-shadow:
      0 0 0 4px var(--teal),
      var(--shadow-offset) var(--shadow-offset) 0 var(--amber);
    transform: translateY(-0.18rem) rotate(-0.35deg);
  }

  .place-summary {
    display: grid;
    gap: 0.25rem;
    padding: 0.35rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .place-summary strong {
    font-size: 1.15rem;
  }

  button:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 3px;
  }

  @media (max-width: 32rem) {
    article {
      grid-template-columns: 1fr;
    }
  }
</style>
