<script module lang="ts">
  function isReconfirmationDue(freshnessUntil: string): boolean {
    return Date.parse(freshnessUntil) <= Date.now();
  }
</script>

<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import type { PlaceCategory } from '$domain/place';
  import {
    accessAreaMessageKeys,
    evidenceMessageKeys,
    formatDogAmenities,
    formatOpeningHours,
    permissionMessageKeys,
    restraintMessageKeys
  } from '$i18n/structured-place';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';
  import { explainAccessCondition } from '$domain/access-explanation';
  import FavouriteControl from '$lib/favourites/FavouriteControl.svelte';
  import CheckInControl from '$lib/check-ins/CheckInControl.svelte';
  import RatingSummary from '$lib/discovery/RatingSummary.svelte';
  import PlacePhotos from '$lib/discovery/PlacePhotos.svelte';

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
    pendingConfirmation?: boolean;
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
    pendingConfirmation = false,
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
  const reconfirmationDue = $derived(
    profile?.accessConditions.some((condition) => isReconfirmationDue(condition.freshnessUntil)) ??
      false
  );
</script>

<aside aria-label={copy['directory.selectedPlace']} data-overlay="place">
  <div class="card-heading">
    <div class="summary">
      <strong>{place.name}</strong>
      <span>{copy[categoryKeys[place.category]]} · {place.locality}</span>
    </div>
    <button
      data-selected-place-close
      class="close"
      type="button"
      aria-label={copy['directory.closeSelectedPlace']}
      onclick={onClose}
    >
      <span aria-hidden="true">×</span>
    </button>
  </div>

  <div class="card-body" data-card-scroll-body>
    <section class="welcome-answer" aria-labelledby={`welcome-${place.placeId}`}>
      <h3 id={`welcome-${place.placeId}`}>{copy['place.welcomeQuestion']}</h3>
      {#if place.accessConditionCount > 1}
        <p class="complex-summary">
          {copy['place.multipleConditions'].replace('{count}', String(place.accessConditionCount))}
        </p>
      {:else if place.simpleAccessSummary && place.accessArea && place.restraintCondition && place.permissionRequirement}
        <p class="welcome-verdict">
          {place.permissionRequirement === 'standing_permission'
            ? copy['place.welcomeYes']
            : copy[permissionMessageKeys[place.permissionRequirement]]}
        </p>
        <ul class="access-facts" aria-label={copy['place.welcomeQuestion']}>
          <li>{copy[accessAreaMessageKeys[place.accessArea]]}</li>
          <li>{copy[restraintMessageKeys[place.restraintCondition]]}</li>
        </ul>
      {:else}
        <p class="complex-summary">{copy['place.restrictedCondition']}</p>
      {/if}
    </section>

    {#if signedIn}
      <div class="member-actions">
        <FavouriteControl
          placeId={place.placeId}
          placeName={place.name}
          {signedIn}
          {favourite}
          {copy}
          {signInHref}
          {pendingConfirmation}
          onChange={onFavouriteChange}
        />
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
      </div>
    {/if}

    {#if reconfirmationDue}
      <p class="freshness-warning">{copy['status.reconfirmationDue']}</p>
    {/if}

    {#if profile?.dogFriendlinessSummary.visible && correctionHref}
      <RatingSummary
        summary={profile.dogFriendlinessSummary}
        {copy}
        {signedIn}
        rateHref={correctionHref(place.placeId, 'rate')}
      />
    {/if}

    {#if profile}
      <PlacePhotos photos={profile.photos} placeName={place.name} {lang} {copy} />
    {/if}

    {#if loading && !profile}
      <p class="details-status" role="status">{copy['place.loadingDetails']}</p>
    {:else if loadFailed && !profile}
      <div class="details-status" role="alert">
        <p>{copy['place.detailsUnavailable']}</p>
        <button type="button" onclick={onRetry}>{copy['common.retry']}</button>
      </div>
    {:else if profile}
      <details>
        <summary>{copy['place.showCompleteAccess']}</summary>
        <div class="complete-details">
          <section aria-labelledby={`access-${place.placeId}`}>
            <h3 id={`access-${place.placeId}`}>{copy['place.accessHeading']}</h3>
            <ol class="conditions">
              {#each profile.accessConditions as condition, index (condition.id)}
                <li>
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
                        permissionRequirement: condition.permissionRequirement,
                        supersededAt: null
                      },
                      lang
                    )}
                  </p>
                  <div class="trust-row">
                    <span
                      >{isReconfirmationDue(condition.freshnessUntil)
                        ? copy['status.reconfirmationDue']
                        : copy['status.verified']}</span
                    >
                    <span
                      >{copy['place.lastVerified']}
                      <time datetime={condition.verifiedAt}
                        >{formatLocalizedDate(condition.verifiedAt, lang)}</time
                      ></span
                    >
                  </div>
                  <ul class="sources" aria-label={copy['place.evidenceSource']}>
                    {#each condition.evidenceSources as source, sourceIndex (`${source.kind}-${source.sourceLabel}-${source.sourceUrl ?? ''}-${source.sourceCitation ?? ''}-${source.observedAt}-${sourceIndex}`)}
                      <li>
                        {#if source.sourceUrl}
                          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external Evidence URL -->
                          <a href={source.sourceUrl} rel="noreferrer">{source.sourceLabel}</a>
                        {:else}
                          <span>{source.sourceLabel}</span>
                        {/if}
                        <span class="source-meta">
                          <small>{copy[evidenceMessageKeys[source.kind]]}</small>
                          <time datetime={source.observedAt}
                            >{formatLocalizedDate(source.observedAt, lang)}</time
                          >
                        </span>
                        {#if source.sourceUrl}
                          <small class="source-reference">{source.sourceUrl}</small>
                        {/if}
                        {#if source.sourceCitation}
                          <small class="source-reference">{source.sourceCitation}</small>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                  {#if correctionHref}
                    <!-- Exact local return context is assembled by the discovery owner. -->
                    <!-- eslint-disable svelte/no-navigation-without-resolve -->
                    <div class="condition-actions">
                      <a
                        href={correctionHref(profile.placeId, 'correct', {
                          conditionId: condition.id
                        })}>{copy['correction.startLink']}</a
                      >
                      <a
                        href={correctionHref(profile.placeId, 'report', {
                          conditionId: condition.id
                        })}>{copy['report.startLink']}</a
                      >
                    </div>
                    <!-- eslint-enable svelte/no-navigation-without-resolve -->
                  {/if}
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
          <p class="access-note">{copy['place.accessExplanation']}</p>
          {#if correctionHref}
            <p class="report-link">
              <!-- Exact local return context is assembled by the discovery owner. -->
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={correctionHref(place.placeId, 'report')}>{copy['report.startLink']}</a>
            </p>
          {/if}
        </div>
      </details>
    {/if}
  </div>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    max-height: min(78vh, 42rem);
    overflow: hidden;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: var(--paper-light);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--amber);
  }

  .card-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 1rem 0.85rem;
  }

  .complex-summary,
  .details-status {
    margin: 0.4rem 0 0;
    font-weight: 750;
  }

  .member-actions {
    display: grid;
    gap: 0.6rem;
    margin-bottom: 0.85rem;
  }

  .welcome-answer {
    padding: 0.85rem;
    border-radius: 0.9rem;
    background: var(--mint);
  }

  .welcome-answer h3,
  .welcome-verdict {
    margin: 0;
  }

  .welcome-answer h3 {
    color: var(--ink-soft);
    font-size: 0.78rem;
    font-weight: 850;
  }

  .welcome-verdict {
    margin-top: 0.2rem;
    font-size: 1.35rem;
    font-weight: 950;
  }

  .access-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.55rem 0 0;
    padding: 0;
    list-style: none;
  }

  .access-facts li {
    border: 1px solid rgb(25 59 69 / 28%);
    border-radius: 999px;
    background: var(--paper-light);
    padding: 0.25rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .freshness-warning {
    margin: 0.65rem 0 0;
    border-radius: 0.65rem;
    background: var(--coral-soft);
    padding: 0.55rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 850;
  }

  details {
    margin-top: 0.75rem;
    border-top: 1px solid rgb(25 59 69 / 28%);
  }

  summary {
    padding: 0.75rem 0 0.15rem;
    color: var(--coral-dark);
    font-weight: 900;
    cursor: pointer;
  }

  .complete-details {
    display: grid;
    gap: 0.8rem;
    padding: 0.6rem 0 0.2rem;
  }

  .complete-details h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .conditions,
  .sources {
    display: grid;
    gap: 0.55rem;
    margin: 0.45rem 0 0;
    padding: 0;
    list-style: none;
  }

  .conditions > li {
    padding: 0.65rem;
    border-radius: 0.7rem;
    background: var(--mint);
  }

  .conditions p {
    margin: 0.3rem 0;
    line-height: 1.4;
  }

  .trust-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 750;
  }

  .sources li {
    display: grid;
    font-size: 0.8rem;
  }

  .source-reference {
    overflow-wrap: anywhere;
    color: var(--ink-soft);
  }

  .source-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.55rem;
    color: var(--ink-soft);
    font-size: 0.75rem;
  }

  .access-note {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }

  .report-link {
    margin: 0.5rem 0 0;
  }

  .report-link a {
    color: var(--coral-dark);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .condition-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }

  .condition-actions a {
    color: var(--coral-dark);
    font-size: 0.75rem;
    font-weight: 800;
  }

  .report-link a:focus-visible,
  .condition-actions a:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }

  .card-heading {
    position: sticky;
    z-index: 1;
    top: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: start;
    padding: 0.85rem 1rem;
    background: var(--paper-light);
  }

  .summary {
    display: grid;
    gap: 0.2rem;
  }

  .summary strong {
    font-size: 1.15rem;
    line-height: 1.1;
  }

  .close {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink);
    font-size: 1.5rem;
    font-weight: 900;
    line-height: 1;
    place-items: center;
  }

  time {
    font-size: 0.82rem;
    font-weight: 800;
  }

  .close:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 3px;
  }
</style>
