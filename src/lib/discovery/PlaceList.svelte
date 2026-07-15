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
    onSelect?: (placeId: string, trigger: HTMLButtonElement) => void;
    signedIn?: boolean;
    favouritePlaceIds?: string[];
    pendingFavouritePlaceId?: string | null;
    signInHref?: (placeId: string) => string;
    onFavouriteChange?: (placeId: string, favourite: boolean) => void;
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
    pendingFavouritePlaceId = null,
    signInHref = () => '',
    onFavouriteChange = () => undefined
  }: Props = $props();
</script>

<ul aria-label={copy['directory.listLabel']}>
  {#each places as place (place.placeId)}
    <li>
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
        pendingConfirmation={pendingFavouritePlaceId === place.placeId}
        signInHref={signInHref(place.placeId)}
        {onFavouriteChange}
      />
    </li>
  {/each}
</ul>

<style>
  ul {
    display: grid;
    gap: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
