<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type { MemberPlacePhoto } from '$lib/contributions/photo';
  import type { PublishedPlacePhoto } from '$server/discovery/public-places';
  import { createLiveAnnouncer } from '$lib/discovery/live-announcement';
  import PlacePhotoContribution from './PlacePhotoContribution.svelte';
  import RefreshablePlaceImage from './RefreshablePlaceImage.svelte';

  interface Props {
    photos: PublishedPlacePhoto[];
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    featured?: boolean;
    /**
     * Whether this surface offers "Add a photo". Off by default, so a surface that has not been
     * given the Member's own photos never grows an affordance whose result it could not show.
     */
    contributable?: boolean;
    signedIn?: boolean;
    /** The caller's own photos on this Place, in every state the server returned. */
    memberPhotos?: readonly MemberPlacePhoto[];
    onSubmitted?: (photo: MemberPlacePhoto) => void;
  }

  let {
    photos,
    placeId,
    placeName,
    lang,
    copy,
    featured = false,
    contributable = false,
    signedIn = false,
    memberPhotos = [],
    onSubmitted = () => undefined
  }: Props = $props();

  let announcement = $state('');
  const announce = createLiveAnnouncer((message) => (announcement = message));

  let visiblePhotos = $derived(selectVisiblePhotos(photos, featured));

  /**
   * The Member's own tiles, beside the published ones.
   *
   * A rejected photo leaves the strip without a word: the Member was never told it was under
   * review by anyone in particular, and a rejection notice on a gift is a conversation this
   * release does not open. An approved photo that the public projection already carries is the
   * same photo twice, so the published copy - which has its alt text and its credit - wins.
   */
  const publishedIds = $derived(new Set(photos.map((photo) => photo.mediaId)));
  const memberTiles = $derived(
    memberPhotos.filter(
      (photo) => photo.approvalState !== 'rejected' && !publishedIds.has(photo.mediaId)
    )
  );

  const tileCount = $derived(visiblePhotos.length + memberTiles.length);
  // The featured treatment is one image filling the card. The moment the Member has a tile of
  // their own beside it, it is a strip again, and a strip has to be able to scroll.
  const strip = $derived(featured && tileCount > 1);

  function selectVisiblePhotos(
    candidatePhotos: PublishedPlacePhoto[],
    useFeaturedPhoto: boolean
  ): PublishedPlacePhoto[] {
    if (!useFeaturedPhoto) return candidatePhotos;
    const featuredPhoto = candidatePhotos.find((photo) => photo.isPrimary) ?? candidatePhotos[0];
    return featuredPhoto ? [featuredPhoto] : [];
  }

  function altText(photo: PublishedPlacePhoto): string {
    const localized = lang === 'is' ? photo.altTextIs : photo.altTextEn;
    return localized || copy['place.photos.imageAlt'].replace('{name}', placeName);
  }
</script>

{#if photos.length > 0 || contributable}
  <section
    class="place-photos hv-panel"
    class:featured
    class:strip
    class:tileless={tileCount === 0}
    aria-labelledby="place-photos-heading"
    data-photos-section
    data-surface={featured ? 'featured-media' : 'media-gallery'}
  >
    <h3 id="place-photos-heading" class:visually-hidden={featured}>{copy['place.photos.title']}</h3>
    <!-- A photo can have no provenance links, so the horizontal scroll container itself must stay
         keyboard-focusable for arrow-key scrolling (WCAG 2.1.1,
         axe scrollable-region-focusable). Svelte's blanket warning does not model this
         established exception for scrollable regions, hence the targeted ignore. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    {#if tileCount > 0}
      <div
        class="scroller"
        role={featured && !strip ? undefined : 'region'}
        aria-labelledby="place-photos-heading"
        tabindex={featured && !strip ? undefined : 0}
      >
        <ul>
          {#each visiblePhotos as photo (photo.mediaId)}
            <li>
              <figure data-primary-photo={photo.isPrimary || undefined}>
                <div class="photo-frame" data-photo-frame="image-led">
                  <RefreshablePlaceImage
                    {placeId}
                    mediaId={photo.mediaId}
                    url={photo.url}
                    urlExpiresAt={photo.urlExpiresAt}
                    alt={altText(photo)}
                    width={photo.widthPx}
                    height={photo.heightPx}
                  />
                </div>
                <figcaption data-photo-provenance>
                  <span class="attribution">{photo.attributionText}</span>
                  <!-- eslint-disable svelte/no-navigation-without-resolve -- external photo provenance and license URLs -->
                  {#if photo.attributionUrl || photo.sourceUrl}
                    <a
                      href={photo.attributionUrl ?? photo.sourceUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer">{copy['place.photos.source']}</a
                    >
                  {/if}
                  {#if photo.licenseUrl}
                    <a href={photo.licenseUrl} target="_blank" rel="noreferrer"
                      >{photo.licenseReference}</a
                    >
                  {:else}
                    <span>{photo.licenseReference}</span>
                  {/if}
                  <!-- eslint-enable svelte/no-navigation-without-resolve -->
                </figcaption>
              </figure>
            </li>
          {/each}
          {#each memberTiles as photo (photo.mediaId)}
            <li>
              <figure data-member-photo data-approval-state={photo.approvalState}>
                <div class="photo-frame" data-photo-frame="image-led">
                  {#if photo.url}
                    <!-- Signed through the uploader's own gateway and never refreshed in place: the
                         tile is transient, and a Member who leaves it standing for five minutes
                         gets a fresh URL from the next fetch rather than a broken image. -->
                    <img
                      src={photo.url}
                      alt={copy['place.photos.memberImageAlt'].replace('{name}', placeName)}
                      width={photo.widthPx > 0 ? photo.widthPx : undefined}
                      height={photo.heightPx > 0 ? photo.heightPx : undefined}
                      loading="lazy"
                    />
                  {:else}
                    <p class="unavailable" data-photo-preview-missing>
                      {copy['place.photos.previewUnavailable']}
                    </p>
                  {/if}
                </div>
                <figcaption data-photo-provenance>
                  <span class="badge" data-photo-badge>
                    {photo.approvalState === 'pending'
                      ? copy['place.photos.pendingBadge']
                      : copy['place.photos.publishedBadge']}
                  </span>
                </figcaption>
              </figure>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if contributable}
      <PlacePhotoContribution {placeId} {placeName} {copy} {signedIn} {announce} {onSubmitted} />
    {/if}
  </section>

  {#if contributable}
    <p class="visually-hidden" role="status" aria-live="polite" data-photo-announcement>
      {announcement}
    </p>
  {/if}
{/if}

<style>
  .place-photos {
    margin: 0.85rem 0 0;
    padding: var(--hv-space-panel);
  }

  .place-photos h3 {
    margin: 0 0 0.65rem;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: 1.05rem;
    line-height: 1.15;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .scroller {
    overflow-x: auto;
    padding: 0.15rem 0.15rem 0.4rem;
    scroll-padding-inline: 0.15rem;
  }

  .scroller:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  ul {
    display: flex;
    gap: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
    scroll-snap-type: x proximity;
  }

  li {
    flex: none;
    scroll-snap-align: start;
  }

  figure {
    width: min(20rem, 76vw);
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
  }

  .photo-frame {
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-bottom: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow);
  }

  .photo-frame :global(img),
  .photo-frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .unavailable {
    display: grid;
    height: 100%;
    margin: 0;
    padding: 0.5rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 700;
    place-items: center;
    text-align: center;
  }

  figcaption {
    display: grid;
    gap: 0.28rem;
    padding: 0.65rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .attribution {
    color: var(--hv-color-basalt);
    font-weight: 700;
  }

  .badge {
    width: fit-content;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-fjord-soft);
    padding: 0.16rem 0.45rem;
    color: var(--hv-color-basalt);
    font-size: 0.72rem;
    font-weight: 850;
  }

  figcaption a {
    width: fit-content;
    color: var(--hv-color-fjord);
    font-weight: 750;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.15em;
  }

  figcaption a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .place-photos :global([data-photo-contribution]) {
    margin-top: 0.5rem;
  }

  .featured {
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .featured .scroller {
    overflow: hidden;
    padding: 0;
  }

  .featured ul,
  .featured li,
  .featured figure {
    width: 100%;
  }

  .featured figure {
    border: 0;
    border-radius: 0;
  }

  .featured .photo-frame {
    aspect-ratio: 16 / 9;
  }

  .featured figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.65rem;
    padding: 0.45rem 0.75rem;
    font-size: 0.7rem;
  }

  /* One image filling the card is the featured treatment; two or more tiles is a strip, and it
     scrolls like every other strip rather than clipping whatever comes second. */
  .featured.strip .scroller {
    overflow-x: auto;
    padding: 0.15rem 0.15rem 0.4rem;
  }

  .featured.strip ul,
  .featured.strip li,
  .featured.strip figure {
    width: auto;
  }

  .featured.strip figure {
    width: min(15rem, 62vw);
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
  }

  .featured.strip .photo-frame {
    aspect-ratio: 4 / 3;
  }

  .featured :global([data-photo-contribution]) {
    margin-top: 0.4rem;
  }

  /* The empty state carries no image, so the featured treatment's edge-to-edge padding would
     leave the affordance touching the frame the card draws around this surface. */
  .featured.tileless {
    padding: 0.5rem 0.65rem;
  }

  .featured.tileless :global([data-photo-contribution]) {
    margin-top: 0;
  }
</style>
