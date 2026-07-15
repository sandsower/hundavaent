<script lang="ts">
  import { tick } from 'svelte';

  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import { accessAreaMessageKeys } from '$i18n/structured-place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import PhotoCredit from './PhotoCredit.svelte';
  import RefreshablePlaceImage from './RefreshablePlaceImage.svelte';

  interface Props {
    place: PublishedPlaceSummary;
    lang: Locale;
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
    lang,
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

<article class:selected class:has-photo={place.primaryPhoto !== null} aria-label={place.name}>
  {#if place.primaryPhoto}
    <figure class="primary-photo">
      <RefreshablePlaceImage
        placeId={place.placeId}
        mediaId={place.primaryPhoto.mediaId}
        url={place.primaryPhoto.url}
        urlExpiresAt={place.primaryPhoto.urlExpiresAt}
        alt={lang === 'is' ? place.primaryPhoto.altTextIs : place.primaryPhoto.altTextEn}
        width={place.primaryPhoto.widthPx}
        height={place.primaryPhoto.heightPx}
      />
      <figcaption>
        <PhotoCredit
          attributionText={place.primaryPhoto.attributionText}
          attributionUrl={place.primaryPhoto.attributionUrl}
          sourceUrl={place.primaryPhoto.sourceUrl}
          licenseReference={place.primaryPhoto.licenseReference}
          licenseUrl={place.primaryPhoto.licenseUrl}
        />
      </figcaption>
    </figure>
  {/if}
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
      {#if place.accessArea}
        <span class="access-sign hv-status" data-status="verified">
          <strong>{copy['status.verified']}</strong>
          <span>· {copy[accessAreaMessageKeys[place.accessArea]]}</span>
        </span>
      {/if}
    </button>
  {:else}
    <div class="place-summary">
      <strong>{place.name}</strong>
      <span>{copy[categoryKeys[place.category]]} · {place.locality}</span>
      {#if place.accessArea}
        <span class="access-sign hv-status" data-status="verified">
          <strong>{copy['status.verified']}</strong>
          <span>· {copy[accessAreaMessageKeys[place.accessArea]]}</span>
        </span>
      {/if}
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
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: none;
  }

  article.has-photo {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .primary-photo {
    width: 4.75rem;
    margin: 0;
    overflow: hidden;
  }

  .primary-photo :global(img) {
    display: block;
    width: 4.75rem;
    height: 4.75rem;
    border-radius: var(--hv-radius-control);
    object-fit: cover;
  }

  .primary-photo figcaption {
    margin-top: 0.25rem;
  }

  article.selected {
    border-color: var(--hv-color-basalt);
    box-shadow: inset 0.3rem 0 0 var(--hv-color-signal);
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
    font-family: var(--hv-font-display);
    font-size: 1.25rem;
    font-weight: 650;
  }

  .access-sign {
    display: flex;
    width: fit-content;
    gap: 0.3rem;
    margin-top: 0.25rem;
    font-family: var(--hv-font-ui);
  }

  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  @media (max-width: 32rem) {
    article {
      grid-template-columns: 1fr;
    }

    article.has-photo {
      grid-template-columns: auto minmax(0, 1fr);
    }

    article > :global(.favourite-control) {
      grid-column: 1 / -1;
    }
  }
</style>
