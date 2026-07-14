<script lang="ts">
  import type { Catalogue } from '$i18n';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { publishFavouriteInvalidation } from './sync';

  interface Props {
    placeId: string;
    placeName: string;
    signedIn: boolean;
    favourite: boolean;
    copy: Catalogue;
    signInHref: string;
    pendingConfirmation?: boolean;
    onChange?: (placeId: string, favourite: boolean, trigger: HTMLButtonElement) => void;
  }

  let {
    placeId,
    placeName,
    signedIn,
    favourite,
    copy,
    signInHref,
    pendingConfirmation = false,
    onChange = () => undefined
  }: Props = $props();
  let submitting = $state(false);
  let failed = $state(false);

  const actionLabel = $derived(
    pendingConfirmation && !favourite
      ? copy['favourite.confirmSave']
      : favourite
        ? copy['favourite.remove']
        : copy['favourite.save']
  );
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
</script>

<div class="favourite-action" data-favourite-place={placeId}>
  {#if pendingConfirmation && signedIn && !favourite}
    <p class="confirmation" role="status">{copy['favourite.confirmationIntro']}</p>
  {/if}
  {#if signedIn}
    <button
      type="button"
      class:active={favourite}
      aria-label={accessibleLabel}
      aria-pressed={favourite}
      disabled={submitting}
      onclick={(event) => applyDesiredState(event.currentTarget)}
    >
      <span aria-hidden="true">{favourite ? '♥' : '♡'}</span>
      <span>{submitting ? copy['favourite.saving'] : actionLabel.replace(' {name}', '')}</span>
    </button>
  {:else}
    <!-- Exact local return context is assembled by the discovery owner. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href={signInHref} aria-label={copy['favourite.signInToSave'].replace('{name}', placeName)}>
      <span aria-hidden="true">♡</span>
      <span>{copy['favourite.signIn']}</span>
    </a>
  {/if}
  {#if failed}
    <span class="error" role="alert">{copy['favourite.failed']}</span>
  {/if}
</div>

<style>
  .favourite-action {
    display: grid;
    gap: 0.3rem;
  }
  button,
  a {
    display: inline-flex;
    min-height: 2.75rem;
    padding: 0.45rem 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 900;
    text-decoration: none;
    cursor: pointer;
  }
  button.active {
    background: var(--coral);
    color: white;
  }
  button:focus-visible,
  a:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
  button:disabled {
    cursor: wait;
    opacity: 0.72;
  }
  .error {
    max-width: 18rem;
    color: var(--danger);
    font-size: 0.78rem;
    font-weight: 800;
  }
  .confirmation {
    max-width: 24rem;
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.82rem;
    font-weight: 800;
  }
</style>
