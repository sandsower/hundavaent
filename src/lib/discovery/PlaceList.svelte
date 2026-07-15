<script lang="ts">
  import type { Catalogue } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';

  import PlaceCard from './PlaceCard.svelte';

  interface Props {
    places: PublishedPlaceSummary[];
    selectedPlaceId: string | null;
    focusSelected?: boolean;
    interactive?: boolean;
    copy: Catalogue;
    onSelect?: (placeId: string, trigger: HTMLButtonElement) => void;
    signedIn?: boolean;
    favouritePlaceIds?: string[];
    signInHref?: (placeId: string) => string;
    onFavouriteChange?: (placeId: string, favourite: boolean) => void;
  }

  let {
    places,
    selectedPlaceId,
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

<ul aria-label={copy['directory.listLabel']}>
  {#each places as place (place.placeId)}
    <li>
      <PlaceCard
        {place}
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
  ul {
    display: grid;
    gap: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
