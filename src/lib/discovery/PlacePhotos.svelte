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

  // The featured treatment is one image filling the card, and a Place with several published
  // photos still gets it: the card shows the best one. The moment the Member has a tile of their
  // own beside it, it is a strip again, and a strip has to be able to scroll.
  const strip = $derived(
    featured && memberTiles.length > 0 && photos.length + memberTiles.length > 1
  );
  // Once it is a strip, every published photo belongs in it. Collapsing to the primary one here
  // would show the Member's pending tile beside a single published photo while the rest of the
  // Place's photos went missing from a surface that is scrolling anyway.
  const visiblePhotos = $derived(selectVisiblePhotos(photos, featured && !strip));

  const tileCount = $derived(visiblePhotos.length + memberTiles.length);

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
  <!-- Panel.svelte's exact utility recipe (base), not the Panel component: this root also
       carries class:featured/class:strip/class:tileless plus scoped .place-photos rules below
       that must keep matching a locally-authored <section>. -->
  <!-- The empty state carries no image, so the featured treatment's edge-to-edge padding would
       leave the invite touching the frame the card draws around this surface. -->
  <section
    class="place-photos group/photos m-[0.85rem_0_0] p-panel border border-border-subtle rounded-panel bg-snow-raised shadow-raised data-[surface=featured-media]:m-0 data-[surface=featured-media]:p-0 data-[surface=featured-media]:overflow-hidden data-[surface=featured-media]:border-0 data-[surface=featured-media]:rounded-none data-[surface=featured-media]:shadow-none data-[surface=featured-media]:data-[tileless=true]:p-[0.65rem]"
    class:featured
    class:strip
    class:tileless={tileCount === 0}
    aria-labelledby="place-photos-heading"
    data-photos-section
    data-surface={featured ? 'featured-media' : 'media-gallery'}
    data-tileless={tileCount === 0}
  >
    <!-- The visually-hidden rule's margin: -1px was dead on this h3: the original
         .place-photos h3 selector had higher specificity and kept its own margin. -->
    <h3
      id="place-photos-heading"
      class="m-[0_0_0.65rem] font-display text-[1.05rem] leading-[1.15] text-basalt data-[visually-hidden=true]:absolute data-[visually-hidden=true]:size-px data-[visually-hidden=true]:overflow-hidden data-[visually-hidden=true]:p-0 data-[visually-hidden=true]:[clip:rect(0,0,0,0)] data-[visually-hidden=true]:whitespace-nowrap data-[visually-hidden=true]:border-0"
      class:visually-hidden={featured}
      data-visually-hidden={featured}
    >
      {copy['place.photos.title']}
    </h3>
    <!-- A photo can have no provenance links, so the horizontal scroll container itself must stay
         keyboard-focusable for arrow-key scrolling (WCAG 2.1.1,
         axe scrollable-region-focusable). Svelte's blanket warning does not model this
         established exception for scrollable regions, hence the targeted ignore. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    {#if tileCount > 0}
      <!-- One image filling the card is the featured treatment; two or more tiles is a strip, and it
           scrolls like every other strip rather than clipping whatever comes second. -->
      <div
        class="scroller overflow-x-auto p-[0.15rem_0.15rem_0.4rem] [scroll-padding-inline:0.15rem] focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] group-[.featured:not(.strip)]/photos:overflow-hidden group-[.featured:not(.strip)]/photos:p-0 group-[.featured.strip]/photos:overflow-y-hidden"
        role={featured && !strip ? undefined : 'region'}
        aria-labelledby={featured && !strip ? undefined : 'place-photos-heading'}
        tabindex={featured && !strip ? undefined : 0}
      >
        <ul
          class="flex gap-[0.8rem] m-0 p-0 list-none snap-x snap-proximity group-[.featured:not(.strip)]/photos:w-full"
        >
          {#each visiblePhotos as photo (photo.mediaId)}
            <li class="flex-none snap-start group-[.featured:not(.strip)]/photos:w-full">
              <figure
                class="w-[min(20rem,76vw)] m-0 overflow-hidden border border-border-subtle rounded-panel bg-snow-raised group-[.featured:not(.strip)]/photos:w-full group-[.featured:not(.strip)]/photos:border-0 group-[.featured:not(.strip)]/photos:rounded-none group-[.featured.strip]/photos:w-[min(15rem,62vw)]"
                data-primary-photo={photo.isPrimary || undefined}
              >
                <div
                  class="photo-frame aspect-[4/3] overflow-hidden border-b border-border-subtle bg-snow group-[.featured:not(.strip)]/photos:aspect-video"
                  data-photo-frame="image-led"
                >
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
                <figcaption
                  class="grid gap-[0.28rem] p-[0.65rem] text-[0.78rem] leading-[1.35] text-basalt-muted group-[.featured]/photos:flex group-[.featured]/photos:flex-wrap group-[.featured]/photos:gap-[0.2rem_0.65rem] group-[.featured]/photos:py-[0.45rem] group-[.featured]/photos:px-3 group-[.featured]/photos:text-[0.7rem]"
                  data-photo-provenance
                >
                  <span class="attribution font-[700] text-basalt">{photo.attributionText}</span>
                  <!-- eslint-disable svelte/no-navigation-without-resolve -- external photo provenance and license URLs -->
                  {#if photo.attributionUrl || photo.sourceUrl}
                    <a
                      class="w-fit font-[750] text-fjord [text-decoration-thickness:1px] [text-underline-offset:0.15em] focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
                      href={photo.attributionUrl ?? photo.sourceUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer">{copy['place.photos.source']}</a
                    >
                  {/if}
                  {#if photo.licenseUrl}
                    <a
                      class="w-fit font-[750] text-fjord [text-decoration-thickness:1px] [text-underline-offset:0.15em] focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
                      href={photo.licenseUrl}
                      target="_blank"
                      rel="noreferrer">{photo.licenseReference}</a
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
            <li class="flex-none snap-start group-[.featured:not(.strip)]/photos:w-full">
              <figure
                class="w-[min(20rem,76vw)] m-0 overflow-hidden border border-border-subtle rounded-panel bg-snow-raised group-[.featured:not(.strip)]/photos:w-full group-[.featured:not(.strip)]/photos:border-0 group-[.featured:not(.strip)]/photos:rounded-none group-[.featured.strip]/photos:w-[min(15rem,62vw)]"
                data-member-photo
                data-approval-state={photo.approvalState}
              >
                <div
                  class="photo-frame aspect-[4/3] overflow-hidden border-b border-border-subtle bg-snow group-[.featured:not(.strip)]/photos:aspect-video"
                  data-photo-frame="image-led"
                >
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
                    <p
                      class="unavailable grid h-full place-items-center m-0 p-2 text-center text-[0.75rem] font-[700] text-basalt-muted"
                      data-photo-preview-missing
                    >
                      {copy['place.photos.previewUnavailable']}
                    </p>
                  {/if}
                </div>
                <figcaption
                  class="grid gap-[0.28rem] p-[0.65rem] text-[0.78rem] leading-[1.35] text-basalt-muted group-[.featured]/photos:flex group-[.featured]/photos:flex-wrap group-[.featured]/photos:gap-[0.2rem_0.65rem] group-[.featured]/photos:py-[0.45rem] group-[.featured]/photos:px-3 group-[.featured]/photos:text-[0.7rem]"
                  data-photo-provenance
                >
                  <span
                    class="badge w-fit py-[0.16rem] px-[0.45rem] rounded-control bg-fjord-soft text-[0.72rem] font-[850] text-basalt"
                    data-photo-badge
                  >
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

    {#if contributable && tileCount === 0}
      <!-- With no tile to stand beside, the affordance alone reads as a control that lost its
           subject. The dashed frame says what belongs here and invites the first one. -->
      <!-- One tight row: on the compact answer card this surface sits above the map, so the invite
           cannot afford the height of a stacked empty state. -->
      <div
        class="empty-invite flex flex-wrap items-center gap-x-[0.6rem] gap-y-[0.4rem] py-[0.55rem] px-3 border-[1.5px] border-dashed border-border-subtle rounded-panel"
        data-photo-empty-invite
      >
        <svg
          class="size-[1.3rem] flex-none fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round] text-basalt-muted"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
          />
          <circle cx="12" cy="13" r="3" />
        </svg>
        <p class="m-0 flex-[1_1_8rem] text-[0.78rem] font-[700] text-basalt-muted">
          {copy['place.photos.emptyInvite']}
        </p>
        <PlacePhotoContribution {placeId} {placeName} {copy} {signedIn} {announce} {onSubmitted} />
      </div>
    {:else if contributable}
      <PlacePhotoContribution {placeId} {placeName} {copy} {signedIn} {announce} {onSubmitted} />
    {/if}
  </section>

  {#if contributable}
    <p
      class="visually-hidden absolute size-px overflow-hidden p-0 m-[-1px] [clip:rect(0,0,0,0)] whitespace-nowrap border-0"
      role="status"
      aria-live="polite"
      data-photo-announcement
    >
      {announcement}
    </p>
  {/if}
{/if}

<style>
  .photo-frame :global(img),
  .photo-frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .place-photos :global([data-photo-contribution]) {
    margin-top: 0.5rem;
  }

  .empty-invite :global([data-photo-contribution]) {
    margin-top: 0;
  }

  /* The featured surface is edge-to-edge for its image only. The affordance below it is a
     control, and a control pressed against the panel border reads as clipped. */
  .featured :global([data-photo-contribution]) {
    margin: 0.65rem;
  }

  /* Inside the invite frame the row's own gap does the spacing. */
  .featured.tileless :global([data-photo-contribution]) {
    margin: 0;
  }
</style>
