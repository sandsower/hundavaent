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

<!-- Transform only, never box-shadow: the card is one of many in a scrolling list, and an
     animated shadow repaints the whole column on every hover. The flat bordered card carries
     a lift perfectly well without one. -->
<!-- The press belongs to the card's own target. Pressing the Favourite heart is the heart's
     gesture, and the card must not answer on its behalf. -->
<!-- The selection bar was an inset box-shadow, which cannot move without repainting the card.
     As a pseudo-element it wipes down the edge on a transform instead. It also runs the full
     height now rather than disappearing behind the media, so the selected card reads as
     selected from across the list. The article's own overflow rounds its corners. -->
<article
  data-place-card
  data-interactive={interactive}
  class="relative overflow-hidden border border-border-subtle rounded-panel bg-snow-raised shadow-none transition-transform duration-[var(--hv-motion-quick)] ease-settle before:absolute before:z-2 before:inset-y-0 before:left-0 before:w-[0.3rem] before:bg-signal before:content-[''] before:pointer-events-none before:origin-top before:transform-[scaleY(0)] before:transition-transform before:duration-[var(--hv-motion-considered)] before:ease-settle [&.selected]:border-basalt [&.selected]:before:transform-[scaleY(1)] data-[interactive=true]:hover:transform-[translateY(-2px)] data-[interactive=true]:has-[.place-target:active]:transform-[translateY(0)_scale(0.99)]"
  class:selected
  aria-label={place.name}
>
  <div
    class:photo={displayPhoto !== null}
    class:category-band={displayPhoto === null}
    class="card-media relative w-full min-h-[5.2rem] [&.category-band]:bg-[linear-gradient(145deg,var(--hv-color-moss-soft)_0_40%,var(--hv-color-fjord-soft)_100%)]"
    data-place-card-media={displayPhoto ? 'photo' : 'category-band'}
  >
    {#if displayPhoto}
      <figure class="primary-photo relative m-0">
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
        <figcaption class="absolute top-[0.4rem] right-[0.4rem] max-w-[58%] overflow-hidden py-[0.18rem] px-[0.35rem] rounded-[0.25rem] bg-[color-mix(in_srgb,var(--hv-color-snow-raised)_92%,transparent)] text-[0.58rem] text-ellipsis whitespace-nowrap">
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
      <!-- Same stroke treatment as the map pins' category glyphs, so the band and the pin read as
           one symbol family. -->
      <svg
        class="band-symbol band-symbol-stroke absolute top-1/2 right-4 size-[2.6rem] transform-[translateY(-50%)_rotate(-12deg)] fill-none stroke-current stroke-[2.1] [stroke-linecap:round] [stroke-linejoin:round] text-[color-mix(in_srgb,var(--hv-color-basalt)_18%,transparent)]"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {#each bandGlyphPaths as d (d)}
          <path {d} />
        {/each}
      </svg>
    {:else}
      <svg
        class="band-symbol absolute top-1/2 right-4 size-[2.6rem] transform-[translateY(-50%)_rotate(-12deg)] text-[color-mix(in_srgb,var(--hv-color-basalt)_18%,transparent)]"
        viewBox="0 0 256 256"
        aria-hidden="true"
      >
        <path fill="currentColor" d={PHOSPHOR_PAW_PRINT_FILL} />
      </svg>
    {/if}
    <span class="category-badge absolute bottom-[0.65rem] left-[0.65rem] py-1 px-[0.45rem] rounded-[0.2rem] bg-snow-raised text-[0.68rem] font-[800] leading-none tracking-[0.06em] uppercase text-basalt">{categoryBadge}</span>
  </div>

  <div class="card-body grid gap-[0.65rem] p-3">
    <div class="headline-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[0.65rem]">
      {#if interactive}
        <button
          type="button"
          class="place-target grid min-w-0 gap-[0.2rem] p-0 border-0 bg-transparent [font:inherit] text-left text-inherit focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
          data-place-id={place.placeId}
          aria-label={copy['directory.selectPlace'].replace('{name}', place.name)}
          aria-pressed={selected}
          bind:this={selectButton}
          onclick={(event) => onSelect(place.placeId, event.currentTarget)}
        >
          <strong class="font-display text-[1.25rem] font-[650] leading-[1.05]">{place.name}</strong>
          <span class="text-[0.78rem] font-[700] text-basalt-muted">{place.locality}</span>
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
        <div class="place-target static-summary grid min-w-0 gap-[0.2rem] p-0 border-0 bg-transparent [font:inherit] text-left text-inherit">
          <strong class="font-display text-[1.25rem] font-[650] leading-[1.05]">{place.name}</strong>
          <span class="text-[0.78rem] font-[700] text-basalt-muted">{place.locality}</span>
        </div>
      {/if}
    </div>
    {#if recognition}
      <WeeklyRhythmAcknowledgement subjectName={place.name} {recognition} {copy} />
    {/if}
    <div class="place-facts grid justify-items-start gap-[0.55rem]">
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
</style>
