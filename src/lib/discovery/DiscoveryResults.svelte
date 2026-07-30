<script lang="ts">
  import { Button } from '@hundavaent/design-system';
  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';

  import PawMark from '$lib/member-activity/PawMark.svelte';
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

<section id="discovery-results" class="results-tray" aria-labelledby="discovery-results-heading">
  <div class="tray-heading">
    <h3 id="discovery-results-heading">{sliceLabel ?? copy['directory.resultsTitle']}</h3>
    <p>
      {places.length === 1
        ? copy['directory.resultCountOne']
        : copy['directory.resultCountMany'].replace('{count}', String(places.length))}
    </p>
    {#if closable}
      <Button
        id="discovery-results-close"
        type="button"
        shape="round"
        aria-label={closeLabel ?? copy['directory.closeResults']}
        onclick={onClose}>{closeGlyph ?? '×'}</Button
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
      <span class="empty-paw" aria-hidden="true"><PawMark /></span>
      <strong>{copy['directory.noResultsTitle']}</strong>
      <span>{copy['directory.noResultsBody']}</span>
    </div>
  {/if}
</section>

<style>
  .results-tray {
    min-height: 100%;
    padding: 1rem;
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

  /* Button renders its own <button> in a child component, so scoped CSS cannot reach it directly
     - anchored through .tray-heading (locally authored) with :global() on the tag, per the
     ancestor-scoped-:global pattern (FavouriteControl.svelte). Geometry (size, border, bg,
     radius, focus ring) now comes from Button's shape="round" + neutral intent - deliberately
     larger and softer than the old 2.25rem/basalt-strong-border/radius-control square (recorded
     veto item, not a regression to fix). Only the heading's own alignment and the × glyph's
     typography (1.4rem/900 - the character's legibility, not the control's tone) survive as
     call-site overrides. */
  .tray-heading :global(button) {
    align-self: center;
    font-size: 1.4rem;
    font-weight: 900;
  }

  .empty {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem 0;
  }

  /* An unfilled paw settling in: no place matched, but the trail is still open. The words
     stay still; only the decoration arrives. */
  .empty-paw {
    width: 1.5rem;
    margin-bottom: 0.2rem;
    color: var(--hv-color-basalt-muted);
    animation: empty-paw-settles var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  @keyframes empty-paw-settles {
    from {
      transform: scale(0.78) rotate(-8deg);
    }

    to {
      transform: scale(1) rotate(0);
    }
  }
</style>
