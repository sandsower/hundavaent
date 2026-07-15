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
  const summaryVerified = $derived(
    profile !== null &&
      !reconfirmationDue &&
      place.simpleAccessSummary &&
      place.permissionRequirement === 'standing_permission'
  );
  const welcomeTone = $derived(
    reconfirmationDue ? 'attention' : summaryVerified ? 'verified' : 'info'
  );
  const welcomeAccessState = $derived(
    reconfirmationDue ? 'attention' : summaryVerified ? 'verified' : 'conditional'
  );
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

  <div class="card-body" data-card-scroll-body>
    {#if profile}
      <PlacePhotos photos={profile.photos} placeName={place.name} {lang} {copy} featured />
    {/if}

    <section
      class="hv-notice welcome-answer"
      data-tone={welcomeTone}
      data-access-state={welcomeAccessState}
      aria-labelledby={`welcome-${place.placeId}`}
    >
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

    <div class="trust-summary">
      <span class="hv-status" data-status={reconfirmationDue ? 'attention' : 'verified'}>
        {reconfirmationDue ? copy['status.reconfirmationDue'] : copy['status.verified']}
      </span>
      <span>
        {copy['place.lastVerified']}
        <time datetime={place.verifiedAt}>{formatLocalizedDate(place.verifiedAt, lang)}</time>
      </span>
    </div>

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
      <p class="hv-notice freshness-warning" data-tone="attention">
        {copy['status.reconfirmationDue']}
      </p>
    {/if}

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
      <details class="hv-disclosure">
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
                        permissionRequirement: condition.permissionRequirement,
                        supersededAt: null
                      },
                      lang
                    )}
                  </p>
                  <div class="trust-row">
                    <span
                      class="hv-status"
                      data-status={isReconfirmationDue(condition.freshnessUntil)
                        ? 'attention'
                        : 'verified'}
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
                      <li class="evidence-card">
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

  .complex-summary,
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
    border-color: var(--hv-color-basalt);
    border-inline-start: 0.35rem solid var(--hv-color-fjord);
    border-radius: var(--hv-radius-control);
  }

  .welcome-answer[data-access-state='verified'] {
    border-inline-start-color: var(--hv-color-signal);
  }

  .welcome-answer h3,
  .welcome-verdict {
    margin: 0;
  }

  .welcome-answer h3 {
    color: var(--hv-color-basalt);
    font-size: 0.78rem;
    font-weight: 850;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .welcome-verdict {
    margin-top: 0.3rem;
    font-family: var(--hv-font-display);
    font-size: 1.5rem;
    font-weight: 650;
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
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.25rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .trust-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px dashed var(--hv-border-subtle);
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 750;
  }

  .freshness-warning {
    margin: 0.65rem 0 0;
    padding: 0.65rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 850;
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

  .conditions,
  .sources {
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

  .trust-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 750;
  }

  .sources li {
    display: grid;
    gap: 0.2rem;
    padding: 0.65rem;
    border-inline-start: 0.2rem solid var(--hv-color-fjord);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-fjord-soft);
    font-size: 0.8rem;
  }

  .sources a {
    color: var(--hv-color-basalt);
    font-weight: 800;
  }

  .source-reference {
    overflow-wrap: anywhere;
    color: var(--hv-color-basalt-muted);
  }

  .source-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.55rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
  }

  .access-note {
    margin: 0;
    font-size: 0.78rem;
    color: var(--hv-color-basalt-muted);
  }

  .report-link {
    margin: 0.5rem 0 0;
  }

  .report-link a {
    color: var(--hv-color-fjord);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .condition-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }

  .condition-actions a {
    color: var(--hv-color-fjord);
    font-size: 0.75rem;
    font-weight: 800;
  }

  .report-link a:focus-visible,
  .sources a:focus-visible,
  .condition-actions a:focus-visible {
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

  time {
    font-size: 0.82rem;
    font-weight: 800;
  }

  .details-status p {
    margin-block: 0 0.65rem;
  }
</style>
