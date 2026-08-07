<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';

  import PlaceCard from './PlaceCard.svelte';

  interface Props {
    places: PublishedPlaceSummary[];
    selectedPlaceId: string | null;
    lang: Locale;
    focusSelected?: boolean;
    interactive?: boolean;
    copy: Catalogue;
    onSelect?: (placeId: string, trigger: HTMLButtonElement, openDetails?: boolean) => void;
    signedIn?: boolean;
    favouritePlaceIds?: string[];
    signInHref?: (placeId: string) => string;
    onFavouriteChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
  }

  let {
    places,
    selectedPlaceId,
    lang,
    focusSelected = false,
    interactive = true,
    copy,
    onSelect = () => undefined,
    signedIn = false,
    favouritePlaceIds = [],
    signInHref = () => '',
    onFavouriteChange = () => undefined
  }: Props = $props();
</script>

<ul class="grid gap-[0.8rem] m-0 p-0 list-none" aria-label={copy['directory.listLabel']}>
  {#each places as place, index (place.placeId)}
    <li style:--enter-index={Math.min(index, 8)}>
      <PlaceCard
        {place}
        {lang}
        selected={place.placeId === selectedPlaceId}
        focusSelected={focusSelected && place.placeId === selectedPlaceId}
        {interactive}
        {copy}
        {onSelect}
        {signedIn}
        favourite={favouritePlaceIds.includes(place.placeId)}
        signInHref={signInHref(place.placeId)}
        {onFavouriteChange}
      />
    </li>
  {/each}
</ul>

<style>
  /* Arrival cascade: transform-only (cards are text-bearing, so words arrive at full contrast
     and move into place) with the delay riding the stagger token. The index caps at 8 so a
     large result set arrives as one batch after the first eight rather than crawling. A keyed
     each means only genuinely new cards replay on filter changes. */
  li {
    animation: list-item-enter var(--hv-motion-considered) var(--hv-ease-settle)
      calc(var(--enter-index, 0) * var(--hv-motion-stagger)) both;
  }

  @keyframes list-item-enter {
    from {
      transform: translateY(0.4rem);
    }

    to {
      transform: translateY(0);
    }
  }
</style>
