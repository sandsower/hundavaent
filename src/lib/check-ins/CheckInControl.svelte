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
  import { Button, Status } from '@hundavaent/design-system';
  import type { Catalogue, Locale } from '$i18n';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { decideProximity, type ProximityPlace } from '$lib/check-ins/proximity';
  import { requestOneTimeLocation } from '$lib/check-ins/geolocation';
  import {
    markCheckInLocationDenied,
    wasCheckInLocationDenied
  } from '$lib/check-ins/permission-memory';
  import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
  import {
    parseWeeklyRhythmRecognition,
    type WeeklyRhythmRecognition
  } from '$lib/member-activity/types';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';

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
  // A check-in loaded with the page is a fact; only the Member's own submission is a moment.
  // Without this, revisiting a Place already checked into would replay the arrival every load.
  let justCommitted = $state(false);
  let effectivePhase = $derived<Phase>(
    phase === 'idle' && initialCheckedInAt ? 'duplicate' : phase
  );
  let effectiveCheckedInAt = $derived(checkedInAt ?? initialCheckedInAt);
  let locationOutcomeMessage = $state<string | null>(null);
  let recognition = $state<WeeklyRhythmRecognition | null>(null);
  let pendingCommandId = $state<string | null>(null);
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
    pendingCommandId ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/check-ins/${encodeURIComponent(placeId)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': pendingCommandId
        },
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
        recognition?: unknown;
      };
      const parsedRecognition = parseWeeklyRhythmRecognition(result.recognition, 'check_in');
      if (
        typeof result.checkedInAt !== 'string' ||
        !parsedRecognition ||
        (result.alreadyCheckedIn === true && parsedRecognition.recognized)
      ) {
        phase = 'failed';
        return;
      }
      pendingCommandId = null;
      applyWeeklyRhythmRecognition(parsedRecognition);
      recognition = parsedRecognition.recognized ? parsedRecognition : null;
      checkedInAt = result.checkedInAt;
      const duplicate = result.alreadyCheckedIn === true;
      phase = duplicate ? 'duplicate' : 'success';
      justCommitted = true;
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
  class="check-in grid mt-3 gap-2 pt-3 border-t border-border-subtle"
  data-state={semanticState}
  aria-busy={semanticState === 'busy'}
  aria-label={copy['checkIn.title'].replace('{name}', placeName)}
>
  {#if !signedIn}
    <!-- Exact local return context is assembled by the discovery owner. -->
    <Button
      href={signInHref}
      class="check-in-control"
      data-state="signed-out"
      aria-label={copy['checkIn.signInAccessible'].replace('{name}', placeName)}
    >
      {copy['checkIn.signIn']}
    </Button>
  {:else if effectivePhase === 'success' || effectivePhase === 'duplicate'}
    {#if recognition}
      <WeeklyRhythmAcknowledgement {recognition} subjectName={placeName} {copy} />
    {/if}
    <Status
      role="status"
      tone="success"
      data-status="success"
      class={justCommitted ? 'result check-in-status arrived' : 'result check-in-status'}
    >
      {effectivePhase === 'duplicate'
        ? copy['checkIn.duplicate']
        : copy['checkIn.success'].replace('{name}', placeName)}
    </Status>
    {#if effectiveCheckedInAt}
      <p
        class="result-time m-0 text-[0.82rem] text-basalt-muted"
        class:arrived={justCommitted}
      >
        {copy['checkIn.successAt'].replace('{time}', formatCheckInTime(effectiveCheckedInAt, lang))}
      </p>
    {/if}
  {:else if effectivePhase === 'place_unavailable'}
    <Status role="alert" tone="error" data-status="error" class="check-in-status">
      {copy['checkIn.placeUnavailable']}
    </Status>
  {:else}
    <p class="explanation m-0 text-[0.82rem] text-basalt-muted">
      {copy['checkIn.timeExplanation']}
    </p>
    <p class="explanation m-0 text-[0.82rem] text-basalt-muted">
      {copy['checkIn.privacyExplanation']}
    </p>

    {#if locationOutcomeMessage}
      <Status role="status" data-status="info" class="check-in-status">
        {locationOutcomeMessage}
      </Status>
    {/if}

    {#if effectivePhase === 'failed'}
      <Status role="alert" tone="error" data-status="error" class="check-in-status">
        {copy['checkIn.failed']}
      </Status>
    {/if}

    <div class="actions mt-1 grid gap-2">
      <Button
        intent="primary"
        class="check-in-control"
        data-state={effectivePhase === 'submitting' ? 'busy' : 'idle'}
        aria-busy={effectivePhase === 'submitting'}
        disabled={effectivePhase === 'submitting' || effectivePhase === 'locating'}
        aria-label={copy['checkIn.actionAccessible'].replace('{name}', placeName)}
        onclick={() => void checkInWithoutLocation()}
      >
        {effectivePhase === 'submitting' ? copy['checkIn.submitting'] : copy['checkIn.action']}
      </Button>

      {#if showLocationAssist}
        <Button
          class="check-in-control"
          data-state={effectivePhase === 'locating' ? 'busy' : 'idle'}
          aria-busy={effectivePhase === 'locating'}
          disabled={effectivePhase === 'submitting' || effectivePhase === 'locating'}
          onclick={() => void checkInWithLocationAssist()}
        >
          {effectivePhase === 'locating'
            ? copy['checkIn.locationRequesting']
            : copy['checkIn.locationAssistAction']}
        </Button>
        <p class="location-explanation m-0 text-[0.75rem] text-basalt-muted">
          {copy['checkIn.locationAssistExplanation']}
        </p>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Button and Status each render their own element inside a child component, so this
     component's scoped CSS cannot reach them directly - the actual target selectors are wrapped
     in :global() and anchored through .check-in, the idiom FavouriteControl.svelte uses for its
     own Button/Status call sites. Button owns cursor/hover-lift/active-squish/transition/focus-
     ring itself now; only the call-site-specific font size and the busy cursor survive here. */
  .check-in :global(.check-in-control) {
    font-size: 0.85rem;
  }

  .check-in :global(.check-in-control:disabled) {
    cursor: wait;
    opacity: 0.72;
  }

  /* The committed state settles into place rather than appearing.
     Movement only, deliberately no fade. An opacity fade starts text at a 1:1 contrast ratio
     and climbs, so for the length of the fade the confirmation is unreadable: Axe measured
     this exact element at 1.66:1 against the required 4.5:1. Anything that carries state in
     words arrives at full contrast and moves into place, never the other way round.
     Under reduced motion this collapses to nothing and the text simply appears, which is the
     right outcome - the words are the announcement, and role="status" carries it either way.
     Anchored through :global() the same way as .check-in-control above: this class lands both on
     the native .result-time paragraph and on Status's child-component-rendered span. */
  .check-in :global(.arrived) {
    animation: committed-rise var(--hv-motion-considered) var(--hv-ease-settle);
  }

  @keyframes committed-rise {
    from {
      transform: translateY(0.35rem);
    }

    to {
      transform: translateY(0);
    }
  }

  /* Anchors the old .check-in > .hv-status rule to the hook class every Status usage in this
     component now carries. */
  .check-in > :global(.check-in-status) {
    width: fit-content;
    margin: 0;
  }

  .check-in :global(.result) {
    font-weight: 900;
  }

  .check-in :global(a.check-in-control) {
    width: fit-content;
  }
</style>
