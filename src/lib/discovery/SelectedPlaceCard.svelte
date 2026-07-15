<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import { formatDogAmenities, formatOpeningHours } from '$i18n/structured-place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';
  import { explainAccessCondition } from '$domain/access-explanation';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import CheckInControl from '$lib/check-ins/CheckInControl.svelte';
  import RatingSummary from '$lib/discovery/RatingSummary.svelte';
  import PlacePhotos from '$lib/discovery/PlacePhotos.svelte';
  import AccessSymbols from '$lib/discovery/AccessSymbols.svelte';
  import PhotoCredit from '$lib/discovery/PhotoCredit.svelte';
  import RefreshablePlaceImage from '$lib/discovery/RefreshablePlaceImage.svelte';
  import SharePlaceControl from '$lib/discovery/SharePlaceControl.svelte';

  interface Props {
    place: PublishedPlaceSummary;
    lang: Locale;
    copy: Catalogue;
    profile: PublishedPlaceProfile | null;
    loading: boolean;
    loadFailed: boolean;
    onClose: () => void;
    onRetry: () => void;
    signedIn?: boolean;
    favourite?: boolean;
    signInHref?: string;
    onFavouriteChange?: (placeId: string, favourite: boolean) => void;
    correctionHref?: (
      placeId: string,
      kind: 'correct' | 'report' | 'rate',
      target?: { field?: string; conditionId?: string }
    ) => string;
    checkInSignInHref?: string;
    proximityAssistEnabled?: boolean;
    initialCheckedInAt?: string | null;
  }

  let {
    place,
    lang,
    copy,
    profile,
    loading,
    loadFailed,
    onClose,
    onRetry,
    signedIn = false,
    favourite = false,
    signInHref = '',
    onFavouriteChange = () => undefined,
    correctionHref,
    checkInSignInHref = '',
    proximityAssistEnabled = false,
    initialCheckedInAt = null
  }: Props = $props();
  const categoryKeys: Record<PlaceCategory, MessageKey> = {
    restaurant: 'category.restaurant',
    cafe: 'category.cafe',
    bar: 'category.bar',
    shop: 'category.shop',
    shopping_centre: 'category.shoppingCentre',
    accommodation: 'category.accommodation',
    park: 'category.park',
    recreation: 'category.recreation',
    culture: 'category.culture',
    service: 'category.service',
    other: 'category.other'
  };
  let completeDetails = $state<HTMLDetailsElement>();

  function openCompleteDetails(): void {
    if (completeDetails) completeDetails.open = true;
  }
</script>

<aside
  class="hv-panel selected-place"
  aria-label={copy['directory.selectedPlace']}
  data-overlay="place"
>
  <div class="card-heading">
    <div class="summary">
      <h2>{place.name}</h2>
      <span>{copy[categoryKeys[place.category]]} · {place.locality}</span>
    </div>
    <div class="heading-actions">
      <FavouriteControl
        placeId={place.placeId}
        placeName={place.name}
        {signedIn}
        {favourite}
        {copy}
        {signInHref}
        onChange={onFavouriteChange}
      />
      <SharePlaceControl placeId={place.placeId} placeName={place.name} {lang} {copy} />
      <button
        data-selected-place-close
        class="hv-control close"
        type="button"
        aria-label={copy['directory.closeSelectedPlace']}
        onclick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </div>

  <div class="card-body" data-card-scroll-body>
    {#if profile?.photos.length}
      <PlacePhotos
        photos={profile.photos}
        placeId={profile.placeId}
        placeName={place.name}
        {lang}
        {copy}
        featured
      />
    {:else if place.primaryPhoto}
      <figure class="summary-photo" data-summary-photo>
        <RefreshablePlaceImage
          placeId={place.placeId}
          mediaId={place.primaryPhoto.mediaId}
          url={place.primaryPhoto.url}
          urlExpiresAt={place.primaryPhoto.urlExpiresAt}
          alt={lang === 'is' ? place.primaryPhoto.altTextIs : place.primaryPhoto.altTextEn}
          width={place.primaryPhoto.widthPx}
          height={place.primaryPhoto.heightPx}
        />
        <figcaption>
          <PhotoCredit
            attributionText={place.primaryPhoto.attributionText}
            attributionUrl={place.primaryPhoto.attributionUrl}
            sourceUrl={place.primaryPhoto.sourceUrl}
            licenseReference={place.primaryPhoto.licenseReference}
            licenseUrl={place.primaryPhoto.licenseUrl}
          />
        </figcaption>
      </figure>
    {/if}

    <section class="welcome-answer" aria-labelledby={`welcome-${place.placeId}`}>
      <h3 id={`welcome-${place.placeId}`}>{copy['place.welcomeQuestion']}</h3>
      <AccessSymbols
        placeName={place.name}
        conditions={profile?.accessConditions ?? place.accessConditions}
        {copy}
        onOpenDetails={openCompleteDetails}
      />
    </section>

    <div class="member-actions">
      {#if signedIn}
        <CheckInControl
          placeId={place.placeId}
          placeName={place.name}
          place={{
            category: place.category,
            location: { latitude: place.latitude, longitude: place.longitude }
          }}
          {lang}
          {copy}
          {signedIn}
          signInHref={checkInSignInHref}
          {proximityAssistEnabled}
          {initialCheckedInAt}
        />
      {/if}
    </div>

    {#if loading && !profile}
      <p class="hv-notice details-status" data-tone="info" role="status">
        {copy['place.loadingDetails']}
      </p>
    {:else if loadFailed && !profile}
      <div class="hv-notice details-status" data-tone="error" role="alert">
        <p>{copy['place.detailsUnavailable']}</p>
        <button class="hv-control" type="button" onclick={onRetry}>{copy['common.retry']}</button>
      </div>
    {:else if profile}
      <details class="hv-disclosure" bind:this={completeDetails}>
        <summary>{copy['place.showCompleteAccess']}</summary>
        <div class="complete-details">
          {#if profile.dogFriendlinessSummary.visible && correctionHref}
            <RatingSummary
              summary={profile.dogFriendlinessSummary}
              {copy}
              {signedIn}
              rateHref={correctionHref(place.placeId, 'rate')}
            />
          {/if}

          <section aria-labelledby={`access-${place.placeId}`}>
            <h3 id={`access-${place.placeId}`}>{copy['place.accessHeading']}</h3>
            <ol class="conditions">
              {#each profile.accessConditions as condition, index (condition.id)}
                <li class="condition-card">
                  <strong
                    >{copy['place.conditionLabel'].replace('{number}', String(index + 1))}</strong
                  >
                  <p>
                    {explainAccessCondition(
                      {
                        id: condition.id,
                        placeId: profile.placeId,
                        revision: 1,
                        accessArea: condition.accessArea,
                        accessAreaNote: condition.accessAreaNote ?? undefined,
                        restraintCondition: condition.restraintCondition,
                        restraintNote: condition.restraintNote ?? undefined,
                        dogEligibility: condition.dogEligibility,
                        availabilityWindow: condition.availabilityWindow,
                        availabilityState: condition.availabilityState,
                        permissionRequirement: condition.permissionRequirement,
                        supersededAt: null
                      },
                      lang
                    )}
                  </p>
                </li>
              {/each}
            </ol>
          </section>

          <section>
            <h3>{copy['place.openingHours']}</h3>
            <p>{formatOpeningHours(profile.openingHours, copy, copy['common.notAvailable'])}</p>
          </section>
          <section>
            <h3>{copy['place.amenities']}</h3>
            <p>
              {profile.dogAmenities.length > 0
                ? formatDogAmenities(profile.dogAmenities, copy)
                : copy['place.amenitiesUnknown']}
            </p>
          </section>
          {#if profile.websiteUrl || (profile.accessInformationUrls?.length ?? 0) > 0}
            <nav class="place-links" aria-label={copy['place.usefulLinks']}>
              {#if profile.websiteUrl}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external place URL -->
                <a href={profile.websiteUrl} rel="noreferrer">{copy['place.website']}</a>
              {/if}
              {#each profile.accessInformationUrls ?? [] as url, index (url)}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external access-information URL -->
                <a href={url} rel="noreferrer">
                  {profile.accessInformationUrls?.length === 1
                    ? copy['place.accessInformation']
                    : `${copy['place.accessInformation']} ${index + 1}`}
                </a>
              {/each}
            </nav>
          {/if}
          {#if correctionHref}
            <details class="correction-links">
              <summary>{copy['place.somethingWrong']}</summary>
              <div>
                <!-- Exact local return context is assembled by the discovery owner. -->
                <!-- eslint-disable svelte/no-navigation-without-resolve -->
                <a href={correctionHref(place.placeId, 'correct')}>{copy['correction.startLink']}</a
                >
                <a href={correctionHref(place.placeId, 'report')}>{copy['report.startLink']}</a>
              </div>
            </details>
          {/if}
        </div>
      </details>
    {/if}
  </div>
</aside>

<style>
  .selected-place {
    display: flex;
    height: 100%;
    flex-direction: column;
    max-height: none;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .card-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 var(--hv-space-panel) var(--hv-space-panel);
  }

  .card-body > * {
    animation: detail-content-enter 180ms ease-out both;
  }

  @keyframes detail-content-enter {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .details-status {
    margin: 0.45rem 0 0;
    font-weight: 700;
  }

  .member-actions {
    display: grid;
    gap: 0.45rem;
    margin-block: 0.65rem;
  }

  .card-body > :global(.place-photos) {
    margin-block: 0 0.8rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
  }

  .summary-photo {
    margin: 0 0 0.8rem;
    overflow: hidden;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-fjord-soft);
  }

  .summary-photo :global(img) {
    display: block;
    width: 100%;
    max-height: 14rem;
    object-fit: cover;
    aspect-ratio: 16 / 9;
  }

  .summary-photo figcaption {
    padding: 0.35rem 0.5rem;
  }

  .member-actions :global(.check-in) {
    margin-top: 0;
    padding-top: 0.6rem;
  }

  .member-actions :global(.explanation),
  .member-actions :global(.location-explanation) {
    font-size: 0.75rem;
    line-height: 1.35;
  }

  .member-actions :global(.actions) {
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }

  .welcome-answer {
    display: grid;
    gap: 0.55rem;
    padding-block: 0.35rem;
  }

  .welcome-answer h3,
  .welcome-answer h3 {
    color: var(--hv-color-basalt);
    font-size: 0.78rem;
    font-weight: 850;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  details {
    margin-top: 0.75rem;
  }

  summary {
    padding: 0.85rem 0 0.35rem;
  }

  .complete-details {
    display: grid;
    gap: 0.8rem;
    padding: 0.6rem 0 0.2rem;
  }

  .complete-details h3 {
    margin: 0;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: 1.05rem;
    font-weight: 650;
  }

  .conditions {
    display: grid;
    gap: 0.55rem;
    margin: 0.45rem 0 0;
    padding: 0;
    list-style: none;
  }

  .conditions > li {
    padding: 0.8rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
  }

  .conditions p {
    margin: 0.3rem 0;
    line-height: 1.4;
  }

  .place-links,
  .correction-links div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .place-links a,
  .correction-links a {
    color: var(--hv-color-fjord);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .place-links a:focus-visible,
  .correction-links a:focus-visible {
    border-radius: var(--hv-radius-control);
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .card-heading {
    position: sticky;
    z-index: 1;
    top: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: start;
    padding: var(--hv-space-panel);
    border-bottom: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
  }

  .heading-actions {
    display: flex;
    gap: 0.4rem;
    align-items: start;
  }

  .summary {
    display: grid;
    gap: 0.2rem;
  }

  .summary h2 {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: clamp(1.35rem, 4vw, 1.75rem);
    font-weight: 650;
    line-height: 1.1;
  }

  .summary span {
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .close {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    min-height: 2.25rem;
    padding: 0;
    font-size: 1.5rem;
    font-weight: 750;
    line-height: 1;
    place-items: center;
  }

  .details-status p {
    margin-block: 0 0.65rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .card-body > * {
      animation: none;
    }
  }
</style>
