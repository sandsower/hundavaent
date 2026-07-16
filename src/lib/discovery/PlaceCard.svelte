<script lang="ts">
  import { tick } from 'svelte';

  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import AccessSymbols from '$lib/discovery/AccessSymbols.svelte';
  import PhotoCredit from './PhotoCredit.svelte';
  import RefreshablePlaceImage from './RefreshablePlaceImage.svelte';

  interface Props {
    place: PublishedPlaceSummary;
    lang: Locale;
    selected: boolean;
    focusSelected?: boolean;
    interactive?: boolean;
    copy: Catalogue;
    onSelect?: (placeId: string, trigger: HTMLButtonElement, openDetails?: boolean) => void;
    signedIn?: boolean;
    favourite?: boolean;
    signInHref?: string;
    onFavouriteChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
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
    signInHref = '',
    onFavouriteChange = () => undefined
  }: Props = $props();
  let selectButton = $state<HTMLButtonElement>();
  let photoUnavailable = $state(false);

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
  const accessContext = $derived.by(() => {
    if (place.accessConditions.length !== 1) return null;
    const area = place.accessConditions[0]?.accessArea;
    if (area === 'indoors') return copy['category.indoorPlace'];
    if (area === 'outdoors' || area === 'designated_area') {
      return copy['category.outdoorPlace'];
    }
    return null;
  });
  const categoryLabel = $derived(
    place.category === 'park' ? copy['category.parkShort'] : copy[categoryKeys[place.category]]
  );
  const categoryBadge = $derived(
    accessContext ? `${accessContext} · ${categoryLabel}` : categoryLabel
  );
  const displayPhoto = $derived(
    place.primaryPhoto && !photoUnavailable ? place.primaryPhoto : null
  );
</script>

<article data-place-card class:selected aria-label={place.name}>
  <div
    class:photo={displayPhoto !== null}
    class:category-band={displayPhoto === null}
    class="card-media"
    data-place-card-media={displayPhoto ? 'photo' : 'category-band'}
  >
    {#if displayPhoto}
      <figure class="primary-photo">
        <RefreshablePlaceImage
          placeId={place.placeId}
          mediaId={displayPhoto.mediaId}
          url={displayPhoto.url}
          urlExpiresAt={displayPhoto.urlExpiresAt}
          alt={lang === 'is' ? displayPhoto.altTextIs : displayPhoto.altTextEn}
          width={displayPhoto.widthPx}
          height={displayPhoto.heightPx}
          onUnavailable={() => (photoUnavailable = true)}
        />
        <figcaption>
          <PhotoCredit
            attributionText={displayPhoto.attributionText}
            attributionUrl={displayPhoto.attributionUrl}
            sourceUrl={displayPhoto.sourceUrl}
            licenseReference={displayPhoto.licenseReference}
            licenseUrl={displayPhoto.licenseUrl}
          />
        </figcaption>
      </figure>
    {/if}
    <span class="category-badge">{categoryBadge}</span>
  </div>

  <div class="card-body">
    <div class="headline-row">
      {#if interactive}
        <button
          type="button"
          class="place-target"
          data-place-id={place.placeId}
          aria-label={copy['directory.selectPlace'].replace('{name}', place.name)}
          aria-pressed={selected}
          bind:this={selectButton}
          onclick={(event) => onSelect(place.placeId, event.currentTarget)}
        >
          <strong>{place.name}</strong>
          <span>{place.locality}</span>
        </button>
        <FavouriteControl
          placeId={place.placeId}
          placeName={place.name}
          {signedIn}
          {favourite}
          {copy}
          {signInHref}
          onChange={onFavouriteChange}
        />
      {:else}
        <div class="place-target static-summary">
          <strong>{place.name}</strong>
          <span>{place.locality}</span>
        </div>
      {/if}
    </div>
    <AccessSymbols
      placeName={place.name}
      conditions={place.accessConditions}
      {copy}
      onOpenDetails={() => selectButton && onSelect(place.placeId, selectButton, true)}
    />
  </div>
</article>

<style>
  article {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: none;
  }

  .card-media {
    position: relative;
    width: 100%;
    min-height: 5.2rem;
  }

  .primary-photo {
    position: relative;
    margin: 0;
  }

  .primary-photo :global(img) {
    display: block;
    width: 100%;
    height: 5.2rem;
    object-fit: cover;
  }

  .primary-photo figcaption {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    max-width: 58%;
    overflow: hidden;
    padding: 0.18rem 0.35rem;
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--hv-color-snow-raised) 92%, transparent);
    font-size: 0.58rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-band {
    background:
      linear-gradient(90deg, rgb(30 45 49 / 28%), transparent 70%),
      linear-gradient(145deg, #8ba9a0 0 36%, #b6cbc4 36% 62%, #d9e2dd 62%);
  }

  .category-badge {
    position: absolute;
    bottom: 0.65rem;
    left: 0.65rem;
    padding: 0.25rem 0.45rem;
    border-radius: 0.2rem;
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1;
    text-transform: uppercase;
  }

  article.selected {
    border-color: var(--hv-color-basalt, #1e2d31);
    box-shadow: inset 0.3rem 0 0 var(--hv-color-signal, #f2c94c);
  }

  .card-body {
    display: grid;
    gap: 0.65rem;
    padding: 0.75rem;
  }

  .headline-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.65rem;
    align-items: start;
  }

  .place-target {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .place-target strong {
    font-family: var(--hv-font-display);
    font-size: 1.25rem;
    font-weight: 650;
    line-height: 1.05;
  }

  .place-target span {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 700;
  }

  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
</style>
