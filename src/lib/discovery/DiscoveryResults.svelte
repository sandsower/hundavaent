<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';

  import PlaceList from './PlaceList.svelte';

  interface Props {
    places: PublishedPlaceSummary[];
    selectedPlaceId: string | null;
    sliceLabel?: string | null;
    lang: Locale;
    copy: Catalogue;
    onSelect: (placeId: string, trigger: HTMLButtonElement, openDetails?: boolean) => void;
    onClose?: () => void;
    closable?: boolean;
    closeLabel?: string;
    closeGlyph?: string;
    signedIn?: boolean;
    favouritePlaceIds?: string[];
    signInHref?: (placeId: string) => string;
    onFavouriteChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
  }

  let {
    places,
    selectedPlaceId,
    sliceLabel = null,
    lang,
    copy,
    onSelect,
    onClose = () => undefined,
    closable = true,
    closeLabel = undefined,
    closeGlyph = undefined,
    signedIn = false,
    favouritePlaceIds = [],
    signInHref = () => '',
    onFavouriteChange = () => undefined
  }: Props = $props();
</script>

<section
  id="discovery-results"
  class="results-tray hv-panel"
  aria-labelledby="discovery-results-heading"
>
  <div class="tray-heading">
    <h3 id="discovery-results-heading">{sliceLabel ?? copy['directory.resultsTitle']}</h3>
    <p>
      {places.length === 1
        ? copy['directory.resultCountOne']
        : copy['directory.resultCountMany'].replace('{count}', String(places.length))}
    </p>
    {#if closable}
      <button
        id="discovery-results-close"
        type="button"
        aria-label={closeLabel ?? copy['directory.closeResults']}
        onclick={onClose}>{closeGlyph ?? '×'}</button
      >
    {/if}
  </div>

  {#if places.length > 0}
    <PlaceList
      {places}
      {selectedPlaceId}
      {lang}
      {copy}
      {onSelect}
      {signedIn}
      {favouritePlaceIds}
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
    min-height: 100%;
    padding: 1rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .tray-heading {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.7rem;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    flex: 1;
    min-width: 0;
    font-family: var(--hv-font-display);
    font-size: 1.15rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  p {
    color: var(--hv-color-fjord);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tray-heading button {
    align-self: center;
  }

  button {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow);
    color: var(--hv-color-basalt);
    font: inherit;
    font-size: 1.4rem;
    font-weight: 900;
    place-items: center;
  }

  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .empty {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem 0;
  }
</style>
