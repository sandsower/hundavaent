<script lang="ts">
  import type { Catalogue } from '$i18n';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { requestAuthentication } from '$lib/auth/controller';
  import { publishFavouriteInvalidation } from './sync';

  interface Props {
    placeId: string;
    placeName: string;
    signedIn: boolean;
    favourite: boolean;
    copy: Catalogue;
    signInHref: string;
    onChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
  }

  let {
    placeId,
    placeName,
    signedIn,
    favourite,
    copy,
    signInHref,
    onChange = () => undefined
  }: Props = $props();
  let submitting = $state(false);
  let failed = $state(false);

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
      const result = (await response.json()) as { placeId?: unknown; isFavourite?: unknown };
      if (result.placeId !== placeId || result.isFavourite !== desiredState) {
        throw new Error('Favourite response mismatch');
      }
      postHogAnalytics.capture('place saved', {
        place_id: placeId,
        saved: desiredState
      });
      onChange(placeId, desiredState, trigger);
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
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    border-radius: 999px;
    cursor: pointer;
    place-items: center;
  }

  .hv-control svg {
    width: 1.2rem;
    fill: transparent;
    stroke: currentColor;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .hv-control[aria-pressed='true'] svg {
    fill: currentColor;
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
