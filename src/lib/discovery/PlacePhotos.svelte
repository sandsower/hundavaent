<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlacePhoto } from '$server/discovery/public-places';

  interface Props {
    photos: PublishedPlacePhoto[];
    placeName: string;
    lang: Locale;
    copy: Catalogue;
  }

  let { photos, placeName, lang, copy }: Props = $props();

  function altText(photo: PublishedPlacePhoto): string {
    const localized = lang === 'is' ? photo.altTextIs : photo.altTextEn;
    return localized || copy['place.photos.imageAlt'].replace('{name}', placeName);
  }
</script>

{#if photos.length > 0}
  <section class="place-photos" aria-labelledby="place-photos-heading" data-photos-section>
    <h3 id="place-photos-heading">{copy['place.photos.title']}</h3>
    <!-- The gallery scrolls horizontally and contains nothing focusable (plain images), so the
         scroll container itself must be keyboard-focusable for arrow-key scrolling
         (WCAG 2.1.1, axe scrollable-region-focusable). Svelte's blanket warning does not model
         this established exception for scrollable regions, hence the targeted ignore. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="scroller" role="region" aria-labelledby="place-photos-heading" tabindex="0">
      <ul>
        {#each photos as photo (photo.mediaId)}
          <li>
            <figure data-primary-photo={photo.isPrimary || undefined}>
              <img
                src={photo.url}
                alt={altText(photo)}
                width={photo.widthPx}
                height={photo.heightPx}
                loading="lazy"
              />
              <figcaption>
                <span>{photo.attributionText}</span>
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
    margin: 0.75rem 0 0;
  }

  .place-photos h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  .scroller {
    overflow-x: auto;
  }

  .scroller:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }

  ul {
    display: flex;
    gap: 0.6rem;
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
    width: 9rem;
    margin: 0;
  }

  img {
    display: block;
    width: 9rem;
    height: 6.75rem;
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    object-fit: cover;
  }

  figcaption {
    display: grid;
    gap: 0.15rem;
    margin-top: 0.35rem;
    font-size: 0.72rem;
    line-height: 1.25;
  }

  figcaption a {
    color: var(--ink);
    text-decoration-thickness: 2px;
    text-underline-offset: 0.15em;
  }
</style>
