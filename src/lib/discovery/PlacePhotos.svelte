<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlacePhoto } from '$server/discovery/public-places';
  import RefreshablePlaceImage from './RefreshablePlaceImage.svelte';

  interface Props {
    photos: PublishedPlacePhoto[];
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    featured?: boolean;
  }

  let { photos, placeId, placeName, lang, copy, featured = false }: Props = $props();
  let visiblePhotos = $derived(selectVisiblePhotos(photos, featured));

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

{#if photos.length > 0}
  <section
    class="place-photos hv-panel"
    class:featured
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
    <div
      class="scroller"
      role={featured ? undefined : 'region'}
      aria-labelledby="place-photos-heading"
      tabindex={featured ? undefined : 0}
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
      </ul>
    </div>
  </section>
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

  .photo-frame :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
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
</style>
