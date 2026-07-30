<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';

  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
  import { subscribeToDeferredFavouriteRecognition } from '$lib/member-activity/client';
  import type { FavouriteRecognition } from '$lib/member-activity/types';
  import AccessSymbols from '$lib/discovery/AccessSymbols.svelte';
  import WheelchairAccessibilityBadge from '$lib/discovery/WheelchairAccessibilityBadge.svelte';
  import { LUCIDE_CATEGORY_PATHS, PHOSPHOR_PAW_PRINT_FILL } from '$lib/map/marker-icons';
  import { launchCategoryFor } from './filter';
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
  let recognition = $state<FavouriteRecognition | null>(null);
  let recognitionTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (recognitionTimer) clearTimeout(recognitionTimer);
  });
  onMount(() =>
    subscribeToDeferredFavouriteRecognition(acknowledgeFavourite, place.placeId, 'list')
  );

  function acknowledgeFavourite(nextRecognition: FavouriteRecognition): void {
    recognition = nextRecognition;
    if (recognitionTimer) clearTimeout(recognitionTimer);
    recognitionTimer = setTimeout(() => {
      recognition = null;
      recognitionTimer = undefined;
    }, 5_000);
  }

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
  /* The band symbol follows the map pins: the place's discovery group picks the glyph, and
     the brand paw stands in only for places outside every group (service, other). */
  const bandGlyphPaths = $derived.by(() => {
    const group = launchCategoryFor(place.category);
    return group ? LUCIDE_CATEGORY_PATHS[group] : null;
  });
</script>

<article data-place-card data-interactive={interactive} class:selected aria-label={place.name}>
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
    {:else if bandGlyphPaths}
      <svg class="band-symbol band-symbol-stroke" viewBox="0 0 24 24" aria-hidden="true">
        {#each bandGlyphPaths as d (d)}
          <path {d} />
        {/each}
      </svg>
    {:else}
      <svg class="band-symbol" viewBox="0 0 256 256" aria-hidden="true">
        <path fill="currentColor" d={PHOSPHOR_PAW_PRINT_FILL} />
      </svg>
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
          onRecognized={acknowledgeFavourite}
        />
      {:else}
        <div class="place-target static-summary">
          <strong>{place.name}</strong>
          <span>{place.locality}</span>
        </div>
      {/if}
    </div>
    {#if recognition}
      <WeeklyRhythmAcknowledgement subjectName={place.name} {recognition} {copy} />
    {/if}
    <div class="place-facts">
      <AccessSymbols
        placeName={place.name}
        conditions={place.accessConditions}
        {copy}
        onOpenDetails={() => selectButton && onSelect(place.placeId, selectButton, true)}
      />
      {#if place.wheelchairAccessibility !== 'unknown'}
        <WheelchairAccessibilityBadge state={place.wheelchairAccessibility} {copy} />
      {/if}
    </div>
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
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  /* Transform only, never box-shadow: the card is one of many in a scrolling list, and an
     animated shadow repaints the whole column on every hover. The flat bordered card carries
     a lift perfectly well without one. */
  article[data-interactive='true']:hover {
    transform: translateY(-2px);
  }

  /* The press belongs to the card's own target. Pressing the Favourite heart is the heart's
     gesture, and the card must not answer on its behalf. */
  article[data-interactive='true']:has(.place-target:active) {
    transform: translateY(0) scale(0.99);
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
    transition: transform var(--hv-motion-considered) var(--hv-ease-settle);
  }

  /* The photo pushes gently past its frame on hover. The article clips it, so the growth reads
     as depth in the card rather than as the image escaping it. */
  article[data-interactive='true']:hover .primary-photo :global(img) {
    transform: scale(1.04);
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
    background: linear-gradient(
      145deg,
      var(--hv-color-moss-soft) 0 40%,
      var(--hv-color-fjord-soft) 100%
    );
  }

  .band-symbol {
    position: absolute;
    top: 50%;
    right: 1rem;
    width: 2.6rem;
    height: 2.6rem;
    color: color-mix(in srgb, var(--hv-color-basalt) 18%, transparent);
    transform: translateY(-50%) rotate(-12deg);
  }

  /* Same stroke treatment as the map pins' category glyphs, so the band and the pin read as
     one symbol family. */
  .band-symbol-stroke {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.1;
    stroke-linecap: round;
    stroke-linejoin: round;
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

  /* The selection bar was an inset box-shadow, which cannot move without repainting the card.
     As a pseudo-element it wipes down the edge on a transform instead. It also runs the full
     height now rather than disappearing behind the media, so the selected card reads as
     selected from across the list. The article's own overflow rounds its corners. */
  article::before {
    position: absolute;
    z-index: 2;
    top: 0;
    bottom: 0;
    left: 0;
    width: 0.3rem;
    background: var(--hv-color-signal);
    content: '';
    pointer-events: none;
    transform: scaleY(0);
    transform-origin: top;
    transition: transform var(--hv-motion-considered) var(--hv-ease-settle);
  }

  article.selected::before {
    transform: scaleY(1);
  }

  article.selected {
    border-color: var(--hv-color-basalt);
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

  .place-facts {
    display: grid;
    gap: 0.55rem;
    justify-items: start;
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
