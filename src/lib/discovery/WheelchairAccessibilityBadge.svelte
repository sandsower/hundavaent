<script lang="ts">
  import type { WheelchairAccessibility } from '$domain/place';
  import type { Catalogue, MessageKey } from '$i18n';

  interface Props {
    state: WheelchairAccessibility;
    copy: Catalogue;
  }

  let { state, copy }: Props = $props();

  const labelKeys: Record<WheelchairAccessibility, MessageKey> = {
    accessible: 'wheelchairAccessibility.accessible',
    not_accessible: 'wheelchairAccessibility.notAccessible',
    unknown: 'wheelchairAccessibility.unknown'
  };
  const label = $derived(copy[labelKeys[state]]);
</script>

<span class="badge {state}" data-wheelchair-accessibility={state}>
  <span class="icon" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="4.5" r="2.1" />
      <path d="M10 7h3.2l.8 5H18v2h-5.7l-.6-3.4a5 5 0 1 0 4.9 5.9l2 .4A7 7 0 1 1 10 8Z" />
    </svg>
    {#if state === 'not_accessible'}
      <span class="prohibition" data-wheelchair-modifier="not_accessible"></span>
    {:else if state === 'unknown'}
      <span class="modifier" data-wheelchair-modifier="unknown">?</span>
    {/if}
  </span>
  <span>{label}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    width: fit-content;
    min-height: 2rem;
    gap: 0.42rem;
    align-items: center;
    padding: 0.24rem 0.55rem 0.24rem 0.3rem;
    border: 1px solid var(--hv-color-basalt, #1e2d31);
    border-radius: 999px;
    background: var(--hv-access-unknown, #e4e7e5);
    color: var(--hv-color-basalt, #1e2d31);
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.05;
  }

  .badge.accessible {
    background: var(--hv-color-moss-soft, #e2e9e2);
  }

  .badge.not_accessible {
    background: var(--hv-color-danger-soft, #f6e1dc);
  }

  .badge.unknown {
    color: var(--hv-color-basalt, #1e2d31);
  }

  .icon {
    position: relative;
    display: grid;
    width: 1.45rem;
    height: 1.45rem;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--hv-color-snow-raised, #ffffff);
    place-items: center;
  }

  svg {
    width: 1.02rem;
    height: 1.02rem;
    fill: currentColor;
  }

  .modifier {
    position: absolute;
    right: -0.16rem;
    bottom: -0.18rem;
    display: grid;
    width: 0.72rem;
    height: 0.72rem;
    border: 1px solid var(--hv-color-basalt, #1e2d31);
    border-radius: 50%;
    background: var(--hv-color-snow-raised, #ffffff);
    color: var(--hv-color-basalt, #1e2d31);
    font-size: 0.55rem;
    font-weight: 950;
    line-height: 1;
    place-items: center;
  }

  .prohibition {
    position: absolute;
    width: 1.15rem;
    height: 0.13rem;
    border-radius: 999px;
    background: var(--hv-color-danger, #a53f2b);
    transform: rotate(-42deg);
  }
</style>
