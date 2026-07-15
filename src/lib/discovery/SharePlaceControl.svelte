<script lang="ts">
  import { onDestroy } from 'svelte';

  import type { Catalogue, Locale } from '$i18n';
  import { buildPlaceShareUrl } from './share-url';

  interface Props {
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
  }

  let { placeId, placeName, lang, copy }: Props = $props();
  let status = $state<'idle' | 'copied' | 'failed'>('idle');
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (clearTimer) clearTimeout(clearTimer);
  });

  async function share(): Promise<void> {
    if (clearTimer) clearTimeout(clearTimer);
    try {
      await navigator.clipboard.writeText(
        buildPlaceShareUrl(window.location.origin, lang, placeId)
      );
      status = 'copied';
    } catch {
      status = 'failed';
    }
    clearTimer = setTimeout(() => (status = 'idle'), 2500);
  }
</script>

<div class="share-control">
  <button
    type="button"
    class="icon-control"
    aria-label={copy['share.place'].replace('{name}', placeName)}
    onclick={share}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  </button>
  <span class:visible={status !== 'idle'} class="share-status" role="status" aria-live="polite">
    {status === 'copied' ? copy['share.copied'] : status === 'failed' ? copy['share.failed'] : ''}
  </span>
</div>

<style>
  .share-control {
    position: relative;
    display: inline-flex;
  }

  .icon-control {
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 999px;
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    cursor: pointer;
    place-items: center;
  }

  .icon-control svg {
    width: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .icon-control:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .share-status {
    position: absolute;
    z-index: 3;
    top: calc(100% + 0.35rem);
    right: 0;
    width: max-content;
    max-width: 12rem;
    padding: 0.35rem 0.55rem;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    font-size: 0.76rem;
    font-weight: 760;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.2rem);
    transition:
      opacity 160ms ease,
      transform 160ms ease;
  }

  .share-status.visible {
    opacity: 1;
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .share-status {
      transition: none;
    }
  }
</style>
