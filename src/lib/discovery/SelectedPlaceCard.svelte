<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { Button, Disclosure, Notice } from '@hundavaent/design-system';
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import { formatDogAmenities, formatOpeningHoursRows } from '$i18n/structured-place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import type { PublishedPlacePhoto, PublishedPlaceProfile } from '$server/discovery/public-places';
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
    hasPendingPlaceField,
    type AccessConditionDimension,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import { fetchPendingCorrections } from '$lib/contributions/correction-client';
  import type { MemberPlacePhoto } from '$lib/contributions/photo';
  import { fetchMyPlacePhotos } from '$lib/contributions/photo-client';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { correctConditionHref } from '$lib/discovery/correct-link';
  import { googleMapsDirectionsUrl } from '$lib/discovery/directions';
  import WheelchairAccessibilityBadge from '$lib/discovery/WheelchairAccessibilityBadge.svelte';
  import WheelchairAccessibilityCorrection from '$lib/discovery/WheelchairAccessibilityCorrection.svelte';
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
   * The Member's own photos on this Place, on the same terms as their pending Corrections: only
   * when signed in, only once the profile has named the Place, and never re-requested on the
   * component's own write.
   */
  let memberPhotos = $state<MemberPlacePhoto[]>([]);
  let photosRequestedFor: string | null = null;

  $effect(() => {
    if (!signedIn) {
      memberPhotos = [];
      photosRequestedFor = null;
      return;
    }
    const loadedPlaceId = profile?.placeId;
    if (!loadedPlaceId || photosRequestedFor === loadedPlaceId) return;
    photosRequestedFor = loadedPlaceId;
    void loadMyPhotos(loadedPlaceId);
  });

  async function loadMyPhotos(placeId: string): Promise<void> {
    const result = await fetchMyPlacePhotos(placeId);
    if (photosRequestedFor !== placeId) return;
    // A signed-out reader has nothing pending, and a failed read is not something to say out loud
    // on a surface whose whole point is the photos that did load.
    if (result.status === 'loaded') memberPhotos = [...result.photos];
  }

  /**
   * A photo the Member just sent is theirs to see immediately, so the tile is placed from the
   * upload's own answer rather than waited for. The refresh that follows replaces it with the
   * server's copy, which is the one carrying dimensions and a signed URL.
   */
  function recordSubmittedPhoto(photo: MemberPlacePhoto): void {
    memberPhotos = [photo, ...memberPhotos.filter((held) => held.mediaId !== photo.mediaId)];
    const loadedPlaceId = profile?.placeId;
    if (loadedPlaceId) void loadMyPhotos(loadedPlaceId);
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
    // The accessibility badge's panel is this component's too, on the same terms as the chips'.
    if (flag.targetKind === 'place_field' && flag.targetField === 'wheelchair_accessibility') {
      focusMobilityPending = true;
    }
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

  /**
   * The accessibility badge's panel on the same terms: sending removes the editor, so focus moves
   * to the pending line that replaced it.
   */
  const mobilityPending = $derived(hasPendingPlaceField(pending, 'wheelchair_accessibility'));
  let focusMobilityPending = $state(false);
  let mobilitySection = $state<HTMLElement>();

  $effect(() => {
    // `mobilityPending` is read so this re-runs once the panel has swapped in the pending line.
    void mobilityPending;
    if (!focusMobilityPending || !mobilitySection) return;
    const line = mobilitySection.querySelector<HTMLElement>('[data-correction-pending]');
    if (!line) return;
    line.focus();
    focusMobilityPending = false;
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
      <!-- Focusable only so this card can land the Member on the line that replaced the editor they just
           sent from; it is never in the tab order. -->
      <p
        class="pending-correction m-[0.45rem_0_0] text-[0.75rem] font-[750] leading-[1.35] text-basalt-muted focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
        data-correction-pending
        tabindex="-1"
      >
        {copy['inlineCorrection.pending']}
      </p>
    {:else if dimension === 'timing'}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- correctConditionHref builds the path with $app/paths resolve() -->
      <a
        href={correctConditionHref(lang, place.placeId, correctableCondition.id)}
        class="timing-link inline-flex min-h-6 items-center mt-[0.45rem] py-[0.15rem] px-[0.4rem] rounded-control text-[0.72rem] font-[800] text-fjord underline focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
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

{#snippet mobilityEditor({ announce }: { announce: (message: string) => void })}
  {#if mobilityPending}
    <!-- A pending wheelchair Correction proposes the whole fact, so the one affordance the panel
         holds says pending rather than inviting a second claim beside the first. -->
    <p
      class="pending-correction m-[0.45rem_0_0] text-[0.75rem] font-[750] leading-[1.35] text-basalt-muted focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
      data-correction-pending
      tabindex="-1"
    >
      {copy['inlineCorrection.pending']}
    </p>
  {:else}
    <WheelchairAccessibilityCorrection
      placeId={place.placeId}
      placeName={place.name}
      {lang}
      {copy}
      {signedIn}
      state={profile?.wheelchairAccessibility ?? place.wheelchairAccessibility}
      {announce}
      onSubmitted={recordSubmitted}
    />
  {/if}
{/snippet}

{#snippet photoSurface(published: PublishedPlacePhoto[])}
  <PlacePhotos
    photos={published}
    placeId={place.placeId}
    placeName={place.name}
    {lang}
    {copy}
    featured
    contributable
    {signedIn}
    {memberPhotos}
    onSubmitted={recordSubmittedPhoto}
  />
{/snippet}

<!-- Of Panel.svelte's surface set this full-bleed card keeps only the raised background - the
     old hv-panel pairing neutralized its border/radius/shadow in the .selected-place rule below,
     so those utilities would be dead weight here (the DiscoveryResults treatment: carry only what
     renders). The one live utility rides directly on the locally-authored element rather than a
     <Panel> wrapper so the scoped root rules keep matching. -->
<aside
  class="selected-place flex h-full max-h-none flex-col overflow-hidden bg-snow-raised"
  aria-label={copy['directory.selectedPlace']}
  data-overlay="place"
>
  <div
    class="card-heading sticky z-1 top-0 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-panel border-b border-border-subtle bg-snow-raised"
  >
    <div class="summary grid gap-[0.2rem]">
      <h2 class="m-0 font-display text-[clamp(1.35rem,4vw,1.75rem)] font-[650] leading-[1.1]">
        {place.name}
      </h2>
      <span class="text-[0.82rem] font-[700] text-basalt-muted"
        >{copy[categoryKeys[place.category]]} · {place.locality}</span
      >
    </div>
    <div class="heading-actions flex items-start gap-[0.4rem]">
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
      <!-- Getting there is the one action every visitor shares, so it stands in the heading
           beside Share rather than waiting in the body. The summary already carries the
           coordinates, so the link works before the profile arrives. -->
      <Button
        shape="round"
        class="icon-action directions"
        data-directions
        href={googleMapsDirectionsUrl({ latitude: place.latitude, longitude: place.longitude })}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={copy['place.directionsLabel'].replace('{name}', place.name)}
        onclick={() =>
          postHogAnalytics.capture('directions opened', {
            place_id: place.placeId,
            category: place.category,
            language: lang
          })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m3 11 19-9-9 19-2-8-8-2z" />
        </svg>
      </Button>
      <SharePlaceControl placeId={place.placeId} placeName={place.name} {lang} {copy} />
      <Button
        data-selected-place-close
        class="close"
        type="button"
        aria-label={copy['directory.closeSelectedPlace']}
        onclick={onClose}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </Button>
    </div>
  </div>

  {#if recognition}
    <WeeklyRhythmAcknowledgement subjectName={place.name} {recognition} {copy} />
  {/if}

  <div
    class="card-body min-h-0 overflow-y-auto overscroll-contain pt-0 px-panel pb-panel"
    data-card-scroll-body
  >
    <!-- The published photos and the affordance are one surface, so the strip renders whenever the
         profile has photos. When it has none, the list's own summary photo still stands (it is
         what a reader saw a moment ago in the results) and the surface renders beside it holding
         the affordance and whatever the Member has waiting - which is the empty state. Before the
         profile arrives there is nothing to add to and nothing to hold. -->
    {#if profile?.photos.length}
      {@render photoSurface(profile.photos)}
    {:else}
      {#if place.primaryPhoto}
        <figure
          class="summary-photo overflow-hidden m-[0_0_0.8rem] border border-border-subtle rounded-panel bg-fjord-soft"
          data-summary-photo
        >
          <RefreshablePlaceImage
            placeId={place.placeId}
            mediaId={place.primaryPhoto.mediaId}
            url={place.primaryPhoto.url}
            urlExpiresAt={place.primaryPhoto.urlExpiresAt}
            alt={lang === 'is' ? place.primaryPhoto.altTextIs : place.primaryPhoto.altTextEn}
            width={place.primaryPhoto.widthPx}
            height={place.primaryPhoto.heightPx}
          />
          <figcaption class="py-[0.35rem] px-2">
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
      {#if profile}
        {@render photoSurface([])}
      {/if}
    {/if}

    <section
      bind:this={welcomeAnswer}
      class="welcome-answer grid gap-[0.55rem] py-[0.35rem]"
      aria-labelledby={`welcome-${place.placeId}`}
    >
      <h3
        class="text-[0.78rem] font-[850] tracking-[0.06em] uppercase text-basalt"
        id={`welcome-${place.placeId}`}
      >
        {copy['place.welcomeQuestion']}
      </h3>
      <AccessSymbols
        placeName={place.name}
        conditions={profile?.accessConditions ?? place.accessConditions}
        {copy}
        onOpenDetails={openCompleteDetails}
        editor={correctableCondition ? accessConditionEditor : undefined}
      />
    </section>

    <section
      bind:this={mobilitySection}
      class="mobility-access grid justify-items-start gap-[0.45rem] my-[0.65rem]"
      aria-labelledby={`mobility-${place.placeId}`}
    >
      <h3 class="m-0 text-[0.78rem] tracking-[0.06em] uppercase" id={`mobility-${place.placeId}`}>
        {copy['wheelchairAccessibility.heading']}
      </h3>
      <WheelchairAccessibilityBadge
        state={profile?.wheelchairAccessibility ?? place.wheelchairAccessibility}
        {copy}
        expandable
        editor={mobilityEditor}
      />
    </section>

    <div class="member-actions grid gap-[0.45rem] my-[0.65rem]">
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
      <Notice as="p" tone="info" class="details-status loading-status" role="status">
        <!-- A trail of paw prints filling one after another while the details load. The fill rides the
             fade family, so the trail keeps padding along for Members who prefer reduced motion: colour
             changes in place, nothing travels. The tilts are static. -->
        <span
          class="paw-trail inline-flex flex-none gap-1 text-brand-paw"
          data-paw-trail
          aria-hidden="true"
        >
          <PawMark />
          <PawMark />
          <PawMark />
        </span>
        {copy['place.loadingDetails']}
      </Notice>
    {:else if loadFailed && !profile}
      <Notice tone="error" class="details-status" role="alert">
        <p>{copy['place.detailsUnavailable']}</p>
        <Button type="button" onclick={onRetry}>{copy['common.retry']}</Button>
      </Notice>
    {:else if profile}
      <Disclosure bind:element={completeDetails} data-complete-details>
        {#snippet summary()}
          <span>{copy['place.showPracticalDetails']}</span>
        {/snippet}
        <div class="complete-details grid gap-[0.8rem] py-[0.2rem] px-0">
          <section aria-labelledby={`access-${place.placeId}`}>
            <!-- The details sections carry the same quiet uppercase labels as the card's own sections
                 (the welcome answer, the mobility badge), so the disclosure reads as more of the card
                 rather than a different document. -->
            <h3
              class="m-0 text-[0.78rem] font-[850] tracking-[0.06em] uppercase text-basalt"
              id={`access-${place.placeId}`}
            >
              {copy['place.accessHeading']}
            </h3>
            <ol
              class:single={profile.accessConditions.length === 1}
              class="conditions group/conditions grid list-none gap-[0.55rem] m-[0.45rem_0_0] p-0"
            >
              {#each profile.accessConditions as condition, index (condition.id)}
                <li
                  class="condition-card p-[0.8rem] border border-border-subtle rounded-panel bg-snow-raised group-[.single]/conditions:p-0 group-[.single]/conditions:border-0 group-[.single]/conditions:bg-transparent"
                >
                  {#if profile.accessConditions.length > 1}
                    <strong
                      >{copy['place.conditionLabel'].replace('{number}', String(index + 1))}</strong
                    >
                  {/if}
                  <p class="my-[0.3rem] leading-[1.4]">
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

          <section class="pt-[0.8rem] border-t border-border-subtle">
            <h3 class="m-0 text-[0.78rem] font-[850] tracking-[0.06em] uppercase text-basalt">
              {copy['place.openingHours']}
            </h3>
            {#if Object.keys(profile.openingHours).length > 0}
              <ul class="opening-hours grid list-none gap-[0.2rem] my-[0.3rem] p-0 leading-[1.4]">
                {#each formatOpeningHoursRows(profile.openingHours, copy) as row (row.key)}
                  <li>{row.text}</li>
                {/each}
              </ul>
            {:else}
              <p>{copy['common.notAvailable']}</p>
            {/if}
          </section>
          <section class="pt-[0.8rem] border-t border-border-subtle">
            <h3 class="m-0 text-[0.78rem] font-[850] tracking-[0.06em] uppercase text-basalt">
              {copy['place.amenities']}
            </h3>
            <p>
              {profile.dogAmenities.length > 0
                ? formatDogAmenities(profile.dogAmenities, copy)
                : copy['place.amenitiesUnknown']}
            </p>
          </section>
          <div class="place-contact grid gap-[0.45rem] pt-[0.8rem] border-t border-border-subtle">
            <p class="place-address m-0 text-[0.85rem] font-[700] text-basalt">
              {profile.location.addressLine}, {profile.location.postalCode}
              {profile.location.locality}
            </p>
            {#if profile.websiteUrl || profile.phone}
              <nav class="place-links flex flex-wrap gap-3" aria-label={copy['place.usefulLinks']}>
                {#if profile.websiteUrl}
                  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external place URL -->
                  <a
                    class="text-[0.82rem] font-[800] text-fjord focus-visible:rounded-control focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
                    href={profile.websiteUrl}
                    rel="noreferrer">{copy['place.website']}</a
                  >
                {/if}
                {#if profile.phone}
                  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external tel URL -->
                  <a
                    class="text-[0.82rem] font-[800] text-fjord focus-visible:rounded-control focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
                    href={`tel:${profile.phone.replaceAll(' ', '')}`}
                  >
                    {copy['place.phone']} · {profile.phone}
                  </a>
                {/if}
              </nav>
            {/if}
          </div>

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
      </Disclosure>
    {/if}
  </div>
</aside>

<style>
  .selected-place > :global([data-weekly-rhythm-acknowledgement]) {
    width: calc(100% - (2 * var(--hv-space-panel)));
    flex: 0 0 auto;
    margin: 0.7rem var(--hv-space-panel) 0;
  }

  /* Svelte scopes a bare universal selector the same as any other compound selector segment: an
     unqualified `.card-body > *` compiles to require ITS OWN hash class on the child too, which
     the Notice- and Disclosure-rendered root elements never carry (they carry their own
     component's hash instead of this one), so the entry animation silently stopped reaching the
     notices and the disclosure once those migrated onto package primitives. The two package-
     rendered roots are enumerated rather than swept up with a `> :global(*)` because that
     wildcard would also newly animate the PlacePhotos and InlineRating roots, which never
     matched the scoped `> *` on main either - restoring the baseline means restoring exactly
     the set that animated before, nothing more. */
  .card-body > *,
  .card-body > :global(.details-status),
  .card-body > :global([data-complete-details]) {
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

  /* Notice renders its element (the `as="p"`/default div) in a child component, so the
     details-status/loading-status classes passed through its `class` prop land on a node scoped
     CSS cannot reach directly - anchored through .card-body (locally authored) with :global() on
     the Notice-rendered class, per the ancestor-scoped-:global pattern (FavouriteControl.svelte). */
  .card-body :global(.details-status) {
    margin: 0.45rem 0 0;
    font-weight: 700;
  }

  .card-body :global(.loading-status) {
    display: flex;
    gap: 0.6rem;
    align-items: center;
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

  .card-body > :global(.place-photos) {
    margin-block: 0 0.8rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
  }

  .summary-photo :global(img) {
    display: block;
    width: 100%;
    height: 5.2rem;
    object-fit: cover;
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

  /* The same round icon control the Share button draws, so the heading's actions read as one
     family. Button renders its own <a> in a child component (href is set, so it navigates), so
     scoped CSS cannot reach it directly - anchored through .heading-actions (locally authored)
     with :global() on the Button-rendered class, per the ancestor-scoped-:global pattern
     (FavouriteControl.svelte, and .close below). Border/bg/radius/size/transition/hover/focus now
     come from Button's shape="round" + neutral intent; only the svg sizing and the deliberately
     stronger active squish survive as call-site overrides. */
  .heading-actions :global(.icon-action svg) {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  /* Smaller round pills using a stronger squish than Button's default 0.97 is deliberate call-site
     character (Button.svelte's own comment on its active-squish), not a deviation to fix -
     restated here as the independent `scale` property (never `transform`) so it wins over
     Button's `active:scale-[0.97]` utility without killing the hover lift's `translate`. */
  .heading-actions :global(.icon-action:active) {
    scale: 0.94;
  }

  /* Card-local spacing above the disclosure, not something Disclosure.svelte owns - re-anchored
     through .card-body (locally authored) with :global() on the data-complete-details marker,
     since Disclosure now renders the <details> element itself. The summary/chevron rules that
     used to live here (summary, summary::-webkit-details-marker, .summary-chevron,
     details[open] > summary .summary-chevron) are retired: Disclosure.svelte codifies all four
     verbatim (see its own comments) and renders its own chevron. */
  .card-body :global([data-complete-details]) {
    margin-top: 0.75rem;
  }

  /* Button renders its own <button> element in a child component, so scoped CSS cannot reach it
     directly - anchored through .heading-actions (locally authored) with :global() on the
     Button-rendered class, per the ancestor-scoped-:global pattern (FavouriteControl.svelte). No
     transform/transition override here: Button now owns this control's hover lift and active
     squish (phase 5 sanctioned change). */
  .heading-actions :global(.close) {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    border-radius: 999px;
    place-items: center;
  }

  .heading-actions :global(.close svg) {
    width: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-width: 1.9;
  }

  /* Svelte only allows :global() as the leading or trailing segment of a selector, not the
     middle, so the whole ".details-status p" chain sits inside one :global() (the same shape as
     FavouriteControl's `:global(.favourite-toggle[aria-pressed='true'] svg)`) rather than keeping
     a hash on the trailing `p` - even though that `p` is itself locally authored inside Notice's
     children. */
  .card-body :global(.details-status p) {
    margin-block: 0 0.65rem;
  }
</style>
