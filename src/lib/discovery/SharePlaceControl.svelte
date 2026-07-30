<script lang="ts">
  import { onDestroy } from 'svelte';

  import { Button } from '@hundavaent/design-system';
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
  <Button
    type="button"
    shape="round"
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
  </Button>
  <span class:visible={status !== 'idle'} class="share-status" role="status" aria-live="polite">
    {status === 'copied' ? copy['share.copied'] : status === 'failed' ? copy['share.failed'] : ''}
  </span>
</div>

<style>
  .share-control {
    position: relative;
    display: inline-flex;
  }

  /* Button renders its own <button> in a child component, so scoped CSS cannot reach it directly
     - anchored through .share-control (locally authored) with :global() on the Button-rendered
     class, per the ancestor-scoped-:global pattern (FavouriteControl.svelte). Only the svg sizing
     survives as a call-site override; border/bg/radius/size/cursor now come from Button's
     shape="round" + neutral intent. This control previously had no hover/active motion and a 2px
     focus offset - it now adopts Button's standard motion and 3px focus treatment (recorded veto
     item, not a regression to fix). */
  .share-control :global(.icon-control svg) {
    width: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
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
    /* The status is text: opacity snaps between the hidden and shown states while only the
       transform takes time, so the words never pass through low contrast (see the fade-family
       limit in tokens.css). */
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  .share-status.visible {
    opacity: 1;
    transform: translateY(0);
  }
</style>
