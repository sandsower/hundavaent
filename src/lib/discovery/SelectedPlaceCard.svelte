<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import { formatDogAmenities, formatOpeningHoursRows } from '$i18n/structured-place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';
  import { explainAccessCondition } from '$domain/access-explanation';
  import type { AccessSymbolDimension } from '$domain/access-symbols';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import PawMark from '$lib/member-activity/PawMark.svelte';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
  import { subscribeToDeferredFavouriteRecognition } from '$lib/member-activity/client';
  import type { FavouriteRecognition } from '$lib/member-activity/types';
  import CheckInControl from '$lib/check-ins/CheckInControl.svelte';
  import InlineRating from '$lib/discovery/InlineRating.svelte';
  import PlacePhotos from '$lib/discovery/PlacePhotos.svelte';
  import AccessSymbols from '$lib/discovery/AccessSymbols.svelte';
  import AccessConditionCorrection from '$lib/discovery/AccessConditionCorrection.svelte';
  import AccessEligibilityCorrection from '$lib/discovery/AccessEligibilityCorrection.svelte';
  import ContributionReveal from '$lib/discovery/ContributionReveal.svelte';
  import {
    hasPendingAccessCondition,
    type AccessConditionDimension,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import { fetchPendingCorrections } from '$lib/contributions/correction-client';
  import { correctConditionHref } from '$lib/discovery/correct-link';
  import WheelchairAccessibilityBadge from '$lib/discovery/WheelchairAccessibilityBadge.svelte';
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
    onFavouriteChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
    checkInSignInHref?: string;
    proximityAssistEnabled?: boolean;
    initialCheckedInAt?: string | null;
    openDetails?: boolean;
    onDetailsOpened?: () => void;
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
    checkInSignInHref = '',
    proximityAssistEnabled = false,
    initialCheckedInAt = null,
    openDetails = false,
    onDetailsOpened = () => undefined
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
  let recognition = $state<FavouriteRecognition | null>(null);
  let recognitionTimer: ReturnType<typeof setTimeout> | undefined;
  let pending = $state<PendingPlaceFlag[]>([]);
  // Deliberately not reactive: it is the guard that stops the effect below from re-requesting on
  // its own write, and it must never be a dependency of the effect that sets it.
  let pendingRequestedFor: string | null = null;

  onDestroy(() => {
    if (recognitionTimer) clearTimeout(recognitionTimer);
  });

  onMount(() =>
    subscribeToDeferredFavouriteRecognition(acknowledgeFavourite, place.placeId, 'selected')
  );

  function acknowledgeFavourite(nextRecognition: FavouriteRecognition): void {
    recognition = nextRecognition;
    if (recognitionTimer) clearTimeout(recognitionTimer);
    recognitionTimer = setTimeout(() => {
      recognition = null;
      recognitionTimer = undefined;
    }, 5_000);
  }

  function openCompleteDetails(): void {
    if (completeDetails) completeDetails.open = true;
  }

  $effect(() => {
    if (!openDetails || !profile || !completeDetails || completeDetails.open) return;
    completeDetails.open = true;
    queueMicrotask(onDetailsOpened);
  });

  /**
   * A Correction targets `access_condition_id`, which only the loaded profile carries, so the
   * affordance cannot exist before the profile arrives. Multi-condition Places render a single
   * "different conditions" chip with no per-dimension symbol to attach an editor to, so their
   * Conditions are reached through the reveal's per-condition links instead.
   */
  const correctableCondition = $derived(
    profile?.accessConditions.length === 1 ? profile.accessConditions[0] : null
  );

  /**
   * The chip dimensions that have an inline editor, and the Correction dimension each one names.
   * A chip without an entry renders exactly as it always has. `timing` is absent on purpose: an
   * availability window is a schedule, not a choice, so it links to the form rather than pretending
   * to be a radio group.
   */
  const editableDimensions: Partial<Record<AccessSymbolDimension, AccessConditionDimension>> = {
    restraint: 'restraint',
    area: 'area',
    permission: 'permission',
    dogs: 'eligibility'
  };

  /**
   * What the Member already has open on this Place. Fetched only when signed in, because a signed
   * out reader has nothing pending and the request would be a member-scoped read nobody asked for.
   */
  const conditionPending = $derived(
    correctableCondition ? hasPendingAccessCondition(pending, correctableCondition.id) : false
  );

  $effect(() => {
    if (!signedIn) {
      pending = [];
      pendingRequestedFor = null;
      return;
    }
    const loadedPlaceId = profile?.placeId;
    if (!loadedPlaceId || pendingRequestedFor === loadedPlaceId) return;
    pendingRequestedFor = loadedPlaceId;
    void loadPending(loadedPlaceId);
  });

  async function loadPending(placeId: string): Promise<void> {
    const result = await fetchPendingCorrections(placeId);
    // A different Place may have been selected while the request was in flight.
    if (pendingRequestedFor !== placeId) return;
    pending = result.status === 'loaded' ? [...result.pending] : [];
  }

  /**
   * The pending markers are the card's own state, so a Correction it just sent belongs in them
   * immediately. Suppression on an Access Condition covers all four of its editors, and the three
   * the Member did not touch have to say pending the moment the fourth is sent: leaving them armed
   * until a refetch would invite a second edit that proposes reverting the first.
   *
   * There is nothing to re-read, either. Everything the markers need is addressing the editor
   * already had, so a round trip would ask the server to confirm what the client just did.
   */
  function recordSubmitted(flag: PendingPlaceFlag): void {
    pending = [...pending, flag];
    // Only the chip panel's editors are this component's to clean up after. The reveal owns focus
    // for the affordances it renders, and it also routes its submissions through here.
    if (flag.targetKind === 'access_condition') focusConditionPending = true;
  }

  /**
   * A Correction sent from a chip panel removes every editor in that panel, including the one the
   * Member was standing on, so there is no trigger left for the shell to hand focus back to. The
   * panel is this component's, so the move is too: focus lands on the pending line that replaced
   * the editors, which says what happened and keeps the next Tab inside the card.
   */
  let focusConditionPending = $state(false);
  let welcomeAnswer = $state<HTMLElement>();

  $effect(() => {
    // `conditionPending` is read so this re-runs once the panel has swapped in the pending line.
    void conditionPending;
    if (!focusConditionPending || !welcomeAnswer) return;
    const line = welcomeAnswer.querySelector<HTMLElement>('[data-correction-pending]');
    if (!line) return;
    line.focus();
    focusConditionPending = false;
  });
</script>

{#snippet accessConditionEditor({
  dimension,
  announce
}: {
  dimension: AccessSymbolDimension;
  announce: (message: string) => void;
})}
  {@const editable = editableDimensions[dimension]}
  {#if correctableCondition && (editable || dimension === 'timing')}
    {#if conditionPending}
      <!-- A flag on an Access Condition proposes the whole Condition object, so a second edit
           raised beside it would build from the stored value and propose reverting the first.
           Every affordance on that Condition says pending, not just the one already sent. -->
      <p class="pending-correction" data-correction-pending tabindex="-1">
        {copy['inlineCorrection.pending']}
      </p>
    {:else if dimension === 'timing'}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- correctConditionHref builds the path with $app/paths resolve() -->
      <a
        href={correctConditionHref(lang, place.placeId, correctableCondition.id)}
        class="timing-link"
        aria-label={copy['inlineCorrection.timingLinkLabel'].replace('{name}', place.name)}
      >
        {copy['inlineCorrection.timingLink']}
      </a>
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {:else if editable === 'eligibility'}
      <AccessEligibilityCorrection
        placeId={place.placeId}
        placeName={place.name}
        {lang}
        {copy}
        {signedIn}
        condition={correctableCondition}
        {announce}
        onSubmitted={recordSubmitted}
      />
    {:else if editable}
      <AccessConditionCorrection
        placeId={place.placeId}
        placeName={place.name}
        {lang}
        {copy}
        {signedIn}
        condition={correctableCondition}
        dimension={editable}
        {announce}
        onSubmitted={recordSubmitted}
      />
    {/if}
  {/if}
{/snippet}

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
        onRecognized={acknowledgeFavourite}
      />
      <SharePlaceControl placeId={place.placeId} placeName={place.name} {lang} {copy} />
      <button
        data-selected-place-close
        class="hv-control close"
        type="button"
        aria-label={copy['directory.closeSelectedPlace']}
        onclick={onClose}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  </div>

  {#if recognition}
    <WeeklyRhythmAcknowledgement subjectName={place.name} {recognition} {copy} />
  {/if}

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

    <section
      bind:this={welcomeAnswer}
      class="welcome-answer"
      aria-labelledby={`welcome-${place.placeId}`}
    >
      <h3 id={`welcome-${place.placeId}`}>{copy['place.welcomeQuestion']}</h3>
      <AccessSymbols
        placeName={place.name}
        conditions={profile?.accessConditions ?? place.accessConditions}
        {copy}
        onOpenDetails={openCompleteDetails}
        editor={correctableCondition ? accessConditionEditor : undefined}
      />
    </section>

    <section class="mobility-access" aria-labelledby={`mobility-${place.placeId}`}>
      <h3 id={`mobility-${place.placeId}`}>{copy['wheelchairAccessibility.heading']}</h3>
      <WheelchairAccessibilityBadge
        state={profile?.wheelchairAccessibility ?? place.wheelchairAccessibility}
        {copy}
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

    <InlineRating
      placeId={place.placeId}
      placeName={place.name}
      {copy}
      {signedIn}
      summary={profile?.dogFriendlinessSummary ?? null}
    />

    {#if loading && !profile}
      <p class="hv-notice details-status loading-status" data-tone="info" role="status">
        <span class="paw-trail" data-paw-trail aria-hidden="true">
          <PawMark />
          <PawMark />
          <PawMark />
        </span>
        {copy['place.loadingDetails']}
      </p>
    {:else if loadFailed && !profile}
      <div class="hv-notice details-status" data-tone="error" role="alert">
        <p>{copy['place.detailsUnavailable']}</p>
        <button class="hv-control" type="button" onclick={onRetry}>{copy['common.retry']}</button>
      </div>
    {:else if profile}
      <details class="hv-disclosure" bind:this={completeDetails}>
        <summary>{copy['place.showPracticalDetails']}</summary>
        <div class="complete-details">
          <section aria-labelledby={`access-${place.placeId}`}>
            <h3 id={`access-${place.placeId}`}>{copy['place.accessHeading']}</h3>
            <ol class:single={profile.accessConditions.length === 1} class="conditions">
              {#each profile.accessConditions as condition, index (condition.id)}
                <li class="condition-card">
                  {#if profile.accessConditions.length > 1}
                    <strong
                      >{copy['place.conditionLabel'].replace('{number}', String(index + 1))}</strong
                    >
                  {/if}
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
            {#if Object.keys(profile.openingHours).length > 0}
              <ul class="opening-hours">
                {#each formatOpeningHoursRows(profile.openingHours, copy) as row (row.key)}
                  <li>{row.text}</li>
                {/each}
              </ul>
            {:else}
              <p>{copy['common.notAvailable']}</p>
            {/if}
          </section>
          <section>
            <h3>{copy['place.amenities']}</h3>
            <p>
              {profile.dogAmenities.length > 0
                ? formatDogAmenities(profile.dogAmenities, copy)
                : copy['place.amenitiesUnknown']}
            </p>
          </section>
          <p class="place-address">
            {profile.location.addressLine}, {profile.location.postalCode}
            {profile.location.locality}
          </p>
          {#if profile.websiteUrl || profile.phone}
            <nav class="place-links" aria-label={copy['place.usefulLinks']}>
              {#if profile.websiteUrl}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external place URL -->
                <a href={profile.websiteUrl} rel="noreferrer">{copy['place.website']}</a>
              {/if}
              {#if profile.phone}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external tel URL -->
                <a href={`tel:${profile.phone.replaceAll(' ', '')}`}>
                  {copy['place.phone']} · {profile.phone}
                </a>
              {/if}
            </nav>
          {/if}

          <!-- One quiet line, and nothing else, until a Member asks. The practical details are
               what a reader came for, so the affordances stay behind a disclosure rather than
               competing with the facts. -->
          <ContributionReveal
            placeName={place.name}
            {lang}
            {copy}
            {signedIn}
            {profile}
            {pending}
            onSubmitted={recordSubmitted}
          />
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

  .selected-place > :global([data-weekly-rhythm-acknowledgement]) {
    width: calc(100% - (2 * var(--hv-space-panel)));
    flex: 0 0 auto;
    margin: 0.7rem var(--hv-space-panel) 0;
  }

  .card-body > * {
    animation: detail-content-enter var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  @keyframes detail-content-enter {
    from {
      transform: translateY(0.25rem);
    }

    to {
      transform: translateY(0);
    }
  }

  .details-status {
    margin: 0.45rem 0 0;
    font-weight: 700;
  }

  .loading-status {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }

  /* A trail of paw prints filling one after another while the details load. The fill rides the
     fade family, so the trail keeps padding along for Members who prefer reduced motion: colour
     changes in place, nothing travels. The tilts are static. */
  .paw-trail {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 0.25rem;
    color: var(--hv-color-brand-paw);
  }

  .paw-trail :global(.paw-mark) {
    width: 1.05rem;
    animation: paw-trail-fills calc(var(--hv-fade-considered) * 4) var(--hv-ease-settle) infinite
      both;
  }

  .paw-trail :global(.paw-mark:nth-child(1)) {
    transform: rotate(-10deg);
  }

  .paw-trail :global(.paw-mark:nth-child(2)) {
    transform: translateY(0.14rem) rotate(8deg);
    animation-delay: var(--hv-fade-considered);
  }

  .paw-trail :global(.paw-mark:nth-child(3)) {
    transform: rotate(-6deg);
    animation-delay: calc(var(--hv-fade-considered) * 2);
  }

  @keyframes paw-trail-fills {
    0%,
    70%,
    100% {
      fill: transparent;
    }

    30% {
      fill: currentColor;
    }
  }

  .pending-correction {
    margin: 0.45rem 0 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.35;
  }

  /* Focusable only so this card can land the Member on the line that replaced the editor they just
     sent from; it is never in the tab order. */
  .pending-correction:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .timing-link {
    display: inline-flex;
    min-height: 1.5rem;
    align-items: center;
    margin-top: 0.45rem;
    padding: 0.15rem 0.4rem;
    border-radius: var(--hv-radius-control);
    color: var(--hv-color-fjord);
    font-size: 0.72rem;
    font-weight: 800;
    text-decoration: underline;
  }

  .timing-link:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .member-actions {
    display: grid;
    gap: 0.45rem;
    margin-block: 0.65rem;
  }

  .mobility-access {
    display: grid;
    gap: 0.45rem;
    margin-block: 0.65rem;
    justify-items: start;
  }

  .mobility-access h3 {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
    height: 5.2rem;
    object-fit: cover;
  }

  .summary-photo figcaption {
    padding: 0.35rem 0.5rem;
  }

  /* basalt-muted is not a readable pair with fjord-soft: at this caption's 0.68rem the credit
     measured 4.34:1 against the 4.5:1 minimum, which Axe caught intermittently. Full basalt
     takes the same text to 10:1 on the same background. */
  .summary-photo figcaption :global(.photo-credit) {
    color: var(--hv-color-basalt);
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

  .conditions.single > li {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .conditions p {
    margin: 0.3rem 0;
    line-height: 1.4;
  }

  .opening-hours {
    display: grid;
    gap: 0.2rem;
    margin: 0.3rem 0;
    padding: 0;
    list-style: none;
    line-height: 1.4;
  }

  .place-address {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .place-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .place-links a {
    color: var(--hv-color-fjord);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .place-links a:focus-visible {
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
    width: 2.5rem;
    height: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    border-radius: 999px;
    place-items: center;
  }

  .close svg {
    width: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-width: 1.9;
  }

  .details-status p {
    margin-block: 0 0.65rem;
  }
</style>
