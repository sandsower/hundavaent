<script lang="ts">
  import { onDestroy } from 'svelte';

  import type { Catalogue } from '$i18n';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { requestAuthentication } from '$lib/auth/controller';
  import { motionDurationsMs } from '$lib/design-system/motion';
  import {
    publishWeeklyRhythmActivation,
    publishWeeklyRhythmInvalidation
  } from '$lib/member-activity/client';
  import {
    parseFavouriteMutationPayload,
    type FavouriteRecognition
  } from '$lib/member-activity/types';
  import { publishFavouriteInvalidation } from './sync';

  interface Props {
    placeId: string;
    placeName: string;
    signedIn: boolean;
    favourite: boolean;
    copy: Catalogue;
    signInHref: string;
    onChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
    onRecognized?: (recognition: FavouriteRecognition) => void;
  }

  let {
    placeId,
    placeName,
    signedIn,
    favourite,
    copy,
    signInHref,
    onChange = () => undefined,
    onRecognized = () => undefined
  }: Props = $props();
  let submitting = $state(false);
  let failed = $state(false);
  // Only a Member's own act of saving earns the flourish. A Place that arrives already
  // favourited, or one being unsaved, must not animate: recognition belongs to the moment.
  let justSaved = $state(false);
  let justSavedTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (justSavedTimer) clearTimeout(justSavedTimer);
  });

  function markJustSaved(): void {
    justSaved = true;
    if (justSavedTimer) clearTimeout(justSavedTimer);
    // A timer rather than animationend: under reduced motion the moving half of the flourish
    // resolves to a zero duration, and its event is not something to hang state on.
    justSavedTimer = setTimeout(() => {
      justSaved = false;
      justSavedTimer = undefined;
    }, motionDurationsMs.considered);
  }

  const actionLabel = $derived(favourite ? copy['favourite.remove'] : copy['favourite.save']);
  const accessibleLabel = $derived(actionLabel.replace('{name}', placeName));

  async function applyDesiredState(trigger: HTMLButtonElement): Promise<void> {
    if (submitting) return;
    submitting = true;
    failed = false;
    const desiredState = !favourite;
    try {
      const response = await fetch(`/api/favourites/${encodeURIComponent(placeId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ desiredState })
      });
      if (!response.ok) throw new Error('Favourite request failed');
      const result = parseFavouriteMutationPayload(await response.json(), placeId, desiredState);
      if (!result) throw new Error('Favourite response mismatch');
      postHogAnalytics.capture('place saved', {
        place_id: placeId,
        saved: desiredState
      });
      onChange(placeId, desiredState, trigger);
      if (desiredState) markJustSaved();
      if (desiredState && result.recognition.firstTimeForPlace) {
        onRecognized(result.recognition);
      }
      publishWeeklyRhythmActivation(result.recognition.currentWeek);
      if (result.recognition.activatedCurrentWeek) {
        publishWeeklyRhythmInvalidation();
      }
      publishFavouriteInvalidation();
    } catch {
      failed = true;
    } finally {
      submitting = false;
    }
  }

  function openSignIn(event: MouseEvent): void {
    event.preventDefault();
    requestAuthentication({
      origin: 'favourite',
      intent: { action: 'favourite', placeId, placeName }
    });
  }
</script>

<div
  class="favourite-action"
  data-ui-mode="place"
  data-favourite-place={placeId}
  data-state={failed ? 'error' : submitting ? 'busy' : favourite ? 'selected' : 'idle'}
>
  {#if signedIn}
    <button
      type="button"
      class="hv-control"
      data-intent={favourite ? 'selected' : 'secondary'}
      data-state={favourite ? 'selected' : 'idle'}
      aria-label={accessibleLabel}
      aria-pressed={favourite}
      aria-busy={submitting}
      disabled={submitting}
      class:just-saved={justSaved}
      onclick={(event) => applyDesiredState(event.currentTarget)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        />
      </svg>
    </button>
  {:else}
    <!-- Exact local return context is assembled by the discovery owner. -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      class="hv-control"
      data-intent="secondary"
      data-state="signed-out"
      href={signInHref}
      onclick={openSignIn}
      aria-label={copy['favourite.signInToSave'].replace('{name}', placeName)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        />
      </svg>
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
  {#if failed}
    <span class="error hv-status" data-status="error" role="alert">
      {copy['favourite.failed']}
    </span>
  {/if}
</div>

<style>
  .favourite-action {
    display: grid;
    gap: 0.4rem;
  }

  .hv-control {
    position: relative;
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    border-radius: 999px;
    cursor: pointer;
    place-items: center;
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  /* The outline state invites; the saved state is already settled, so it stays put. The
     signed-out anchor carries no aria-pressed and is treated as unsaved. */
  .hv-control:not([aria-pressed='true']):hover {
    transform: translateY(-1px);
  }

  .hv-control:active {
    transform: scale(0.92);
  }

  .hv-control svg {
    position: relative;
    z-index: 1;
    width: 1.2rem;
    fill: transparent;
    stroke: currentColor;
    stroke-linejoin: round;
    stroke-width: 1.8;
    transition: fill var(--hv-fade-quick) linear;
  }

  .hv-control[aria-pressed='true'] svg {
    fill: currentColor;
  }

  /* The bloom sits behind the heart and reads as warmth spreading out from it. It is capped at
     1.35x because PlaceCard clips its own overflow, and a wider bloom would be cut at the card
     edge rather than fading out. */
  .hv-control::after {
    position: absolute;
    z-index: 0;
    border-radius: 999px;
    background: var(--hv-color-danger-soft);
    content: '';
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  /* Two entries, not one: a single @keyframes cannot hold both the motion duration and the
     fade duration, and reduced motion has to be able to drop the growth while keeping the glow. */
  .hv-control.just-saved::after {
    animation:
      bloom-grow var(--hv-motion-considered) var(--hv-ease-exit),
      bloom-fade var(--hv-fade-considered) var(--hv-ease-exit);
  }

  .hv-control.just-saved svg {
    animation: heart-punch var(--hv-motion-quick) var(--hv-ease-overshoot);
  }

  @keyframes heart-punch {
    0% {
      transform: scale(1);
    }

    45% {
      transform: scale(1.22);
    }

    100% {
      transform: scale(1);
    }
  }

  @keyframes bloom-grow {
    from {
      transform: scale(0.7);
    }

    to {
      transform: scale(1.35);
    }
  }

  @keyframes bloom-fade {
    from {
      opacity: 0.45;
    }

    to {
      opacity: 0;
    }
  }

  .hv-control[data-state='selected'] {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }

  .hv-control:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .error {
    max-width: 18rem;
  }
</style>
