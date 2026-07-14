<script module lang="ts">
  function formatCheckInTime(value: string, lang: Locale): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat(lang === 'is' ? 'is-IS' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
</script>

<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { decideProximity, type ProximityPlace } from '$lib/check-ins/proximity';
  import { requestOneTimeLocation } from '$lib/check-ins/geolocation';
  import {
    markCheckInLocationDenied,
    wasCheckInLocationDenied
  } from '$lib/check-ins/permission-memory';

  interface Props {
    placeId: string;
    placeName: string;
    place: ProximityPlace;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    signInHref: string;
    proximityAssistEnabled: boolean;
    initialCheckedInAt?: string | null;
  }

  let {
    placeId,
    placeName,
    place,
    lang,
    copy,
    signedIn,
    signInHref,
    proximityAssistEnabled,
    initialCheckedInAt = null
  }: Props = $props();

  type Phase =
    'idle' | 'locating' | 'submitting' | 'success' | 'duplicate' | 'place_unavailable' | 'failed';

  // phase/checkedInAt track only what THIS component instance has itself submitted; the
  // server-loaded initialCheckedInAt folds in through the derived values below. Terminal phases
  // are only meaningful for the Place this instance was created for, so every render site must
  // recreate the component when the selected Place changes - MapListShell wraps both of its
  // SelectedPlaceCard sites in {#key selectedPlace.placeId} for exactly this reason.
  let phase = $state<Phase>('idle');
  let checkedInAt = $state<string | null>(null);
  let effectivePhase = $derived<Phase>(
    phase === 'idle' && initialCheckedInAt ? 'duplicate' : phase
  );
  let effectiveCheckedInAt = $derived(checkedInAt ?? initialCheckedInAt);
  let locationOutcomeMessage = $state<string | null>(null);
  let locationDeniedThisSession = $state(
    typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
      ? wasCheckInLocationDenied(sessionStorage)
      : false
  );

  const showLocationAssist = $derived(
    proximityAssistEnabled &&
      effectivePhase !== 'success' &&
      effectivePhase !== 'duplicate' &&
      !locationDeniedThisSession
  );
  const semanticState = $derived(
    effectivePhase === 'success' || effectivePhase === 'duplicate'
      ? 'committed'
      : effectivePhase === 'locating' || effectivePhase === 'submitting'
        ? 'busy'
        : effectivePhase === 'failed' || effectivePhase === 'place_unavailable'
          ? 'error'
          : 'idle'
  );

  async function checkInWithoutLocation(): Promise<void> {
    await submitCheckIn('unknown');
  }

  async function checkInWithLocationAssist(): Promise<void> {
    phase = 'locating';
    locationOutcomeMessage = null;
    const outcome = await requestOneTimeLocation();

    if (outcome.status === 'denied') {
      postHogAnalytics.capture('location permission resolved', {
        context: 'check_in',
        outcome: 'denied'
      });
      locationDeniedThisSession = true;
      if (typeof sessionStorage !== 'undefined') markCheckInLocationDenied(sessionStorage);
      locationOutcomeMessage = copy['checkIn.locationDenied'];
      phase = 'idle';
      return;
    }
    if (outcome.status === 'timeout') {
      postHogAnalytics.capture('location permission resolved', {
        context: 'check_in',
        outcome: 'timeout'
      });
      locationOutcomeMessage = copy['checkIn.locationTimedOut'];
      phase = 'idle';
      return;
    }
    if (outcome.status === 'unavailable') {
      postHogAnalytics.capture('location permission resolved', {
        context: 'check_in',
        outcome: 'unavailable'
      });
      locationOutcomeMessage = copy['checkIn.locationUnavailable'];
      phase = 'idle';
      return;
    }

    postHogAnalytics.capture('location permission resolved', {
      context: 'check_in',
      outcome: 'granted'
    });
    const decision = decideProximity(place, outcome.reading);
    await submitCheckIn(decision);
  }

  async function submitCheckIn(
    proximityDecision: 'confirmed' | 'not_confirmed' | 'unknown'
  ): Promise<void> {
    phase = 'submitting';
    try {
      const response = await fetch(`/api/check-ins/${encodeURIComponent(placeId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proximityDecision })
      });
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        phase = body?.error === 'place_unavailable' ? 'place_unavailable' : 'failed';
        return;
      }
      if (!response.ok) {
        phase = 'failed';
        return;
      }
      const result = (await response.json()) as {
        checkedInAt?: unknown;
        alreadyCheckedIn?: unknown;
      };
      if (typeof result.checkedInAt !== 'string') {
        phase = 'failed';
        return;
      }
      checkedInAt = result.checkedInAt;
      const duplicate = result.alreadyCheckedIn === true;
      phase = duplicate ? 'duplicate' : 'success';
      postHogAnalytics.capture('check in completed', {
        place_id: placeId,
        outcome: duplicate ? 'duplicate' : 'created',
        proximity: proximityDecision
      });
    } catch {
      phase = 'failed';
    }
  }
</script>

<section
  class="check-in"
  data-state={semanticState}
  aria-busy={semanticState === 'busy'}
  aria-label={copy['checkIn.title'].replace('{name}', placeName)}
>
  {#if !signedIn}
    <!-- Exact local return context is assembled by the discovery owner. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a
      class="hv-control"
      data-intent="secondary"
      data-state="signed-out"
      href={signInHref}
      aria-label={copy['checkIn.signInAccessible'].replace('{name}', placeName)}
    >
      {copy['checkIn.signIn']}
    </a>
  {:else if effectivePhase === 'success' || effectivePhase === 'duplicate'}
    <p role="status" class="result hv-status" data-status="success">
      {effectivePhase === 'duplicate'
        ? copy['checkIn.duplicate']
        : copy['checkIn.success'].replace('{name}', placeName)}
    </p>
    {#if effectiveCheckedInAt}
      <p class="result-time">
        {copy['checkIn.successAt'].replace('{time}', formatCheckInTime(effectiveCheckedInAt, lang))}
      </p>
    {/if}
  {:else if effectivePhase === 'place_unavailable'}
    <p role="alert" class="hv-status" data-status="error">
      {copy['checkIn.placeUnavailable']}
    </p>
  {:else}
    <p class="explanation">{copy['checkIn.timeExplanation']}</p>
    <p class="explanation">{copy['checkIn.privacyExplanation']}</p>

    {#if locationOutcomeMessage}
      <p role="status" class="location-outcome hv-status" data-status="info">
        {locationOutcomeMessage}
      </p>
    {/if}

    {#if effectivePhase === 'failed'}
      <p role="alert" class="hv-status" data-status="error">{copy['checkIn.failed']}</p>
    {/if}

    <div class="actions">
      <button
        type="button"
        class="hv-control"
        data-intent="primary"
        data-state={effectivePhase === 'submitting' ? 'busy' : 'idle'}
        aria-busy={effectivePhase === 'submitting'}
        disabled={effectivePhase === 'submitting' || effectivePhase === 'locating'}
        aria-label={copy['checkIn.actionAccessible'].replace('{name}', placeName)}
        onclick={() => void checkInWithoutLocation()}
      >
        {effectivePhase === 'submitting' ? copy['checkIn.submitting'] : copy['checkIn.action']}
      </button>

      {#if showLocationAssist}
        <button
          type="button"
          class="hv-control"
          data-intent="secondary"
          data-state={effectivePhase === 'locating' ? 'busy' : 'idle'}
          aria-busy={effectivePhase === 'locating'}
          disabled={effectivePhase === 'submitting' || effectivePhase === 'locating'}
          onclick={() => void checkInWithLocationAssist()}
        >
          {effectivePhase === 'locating'
            ? copy['checkIn.locationRequesting']
            : copy['checkIn.locationAssistAction']}
        </button>
        <p class="location-explanation">{copy['checkIn.locationAssistExplanation']}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .check-in {
    display: grid;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--hv-border-subtle);
    gap: 0.5rem;
  }

  .explanation {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
  }

  .actions {
    display: grid;
    margin-top: 0.25rem;
    gap: 0.5rem;
  }

  .hv-control {
    font-size: 0.85rem;
    cursor: pointer;
  }

  .hv-control:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .location-explanation {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
  }

  .location-outcome {
    margin: 0;
  }

  .check-in > .hv-status {
    width: fit-content;
    margin: 0;
  }

  .result {
    font-weight: 900;
  }

  .result-time {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
  }

  a.hv-control {
    width: fit-content;
  }
</style>
