<script lang="ts">
  import type { Catalogue } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';

  import PlaceList from './PlaceList.svelte';

  interface Props {
    places: PublishedPlaceSummary[];
    selectedPlaceId: string | null;
    copy: Catalogue;
    onSelect: (placeId: string, trigger: HTMLButtonElement) => void;
    onClose?: () => void;
    closable?: boolean;
    signedIn?: boolean;
    favouritePlaceIds?: string[];
    pendingFavouritePlaceId?: string | null;
    signInHref?: (placeId: string) => string;
    onFavouriteChange?: (placeId: string, favourite: boolean) => void;
  }

  let {
    places,
    selectedPlaceId,
    copy,
    onSelect,
    onClose = () => undefined,
    closable = true,
    signedIn = false,
    favouritePlaceIds = [],
    pendingFavouritePlaceId = null,
    signInHref = () => '',
    onFavouriteChange = () => undefined
  }: Props = $props();
</script>

<section id="discovery-results" class="results-tray" aria-labelledby="discovery-results-heading">
  <div class="tray-heading">
    <div>
      <h3 id="discovery-results-heading">{copy['directory.resultsTitle']}</h3>
      <p>
        {places.length === 1
          ? copy['directory.resultCountOne']
          : copy['directory.resultCountMany'].replace('{count}', String(places.length))}
      </p>
    </div>
    {#if closable}
      <button
        id="discovery-results-close"
        type="button"
        aria-label={copy['directory.closeResults']}
        onclick={onClose}>×</button
      >
    {/if}
  </div>

  {#if places.length > 0}
    <PlaceList
      {places}
      {selectedPlaceId}
      {copy}
      {onSelect}
      {signedIn}
      {favouritePlaceIds}
      {pendingFavouritePlaceId}
      {signInHref}
      {onFavouriteChange}
    />
  {:else}
    <div class="empty">
      <strong>{copy['directory.noResultsTitle']}</strong>
      <span>{copy['directory.noResultsBody']}</span>
    </div>
  {/if}
</section>

<style>
  .results-tray {
    max-height: min(30rem, 55dvh);
    overflow: auto;
    padding: 0.85rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: rgb(255 250 239 / 97%);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--coral);
    backdrop-filter: blur(10px);
  }

  .tray-heading {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
    margin-bottom: 0.7rem;
  }

  h3,
  p {
    margin: 0;
  }

  p {
    margin-top: 0.15rem;
    color: var(--ink-soft);
    font-size: 0.82rem;
    font-weight: 750;
  }

  button {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 1.4rem;
    font-weight: 900;
    place-items: center;
  }

  button:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }

  .empty {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem 0;
  }
</style>
