<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { WheelchairAccessibility } from '$domain/place';
  import type { Catalogue, MessageKey } from '$i18n';
  import { createLiveAnnouncer } from '$lib/discovery/live-announcement';

  /**
   * The mobility-access fact, in two postures. On the list card it is the quiet read-only badge it
   * has always been. On the selected card it follows the access chips: the badge is a disclosure
   * that opens into the state's full explanation, and whoever owns the panel may hand in an
   * `editor` snippet so the fact can be corrected where it is read.
   */
  interface Props {
    state: WheelchairAccessibility;
    copy: Catalogue;
    /** Renders the badge as a button that expands into the explanation panel. */
    expandable?: boolean;
    /**
     * Optional contribution affordance rendered inside the open panel. A snippet, so this
     * component stays presentational; it receives the announcer because the live region belongs
     * to whoever owns the panel.
     */
    editor?: Snippet<[{ announce: (message: string) => void }]>;
  }

  // Renamed on arrival: a local binding called `state` would collide with the `$state` rune.
  let { state: accessibility, copy, expandable = false, editor }: Props = $props();
  const componentId = $props.id();
  const detailId = `${componentId}-detail`;

  const labelKeys: Record<WheelchairAccessibility, MessageKey> = {
    accessible: 'wheelchairAccessibility.accessible',
    partially_accessible: 'wheelchairAccessibility.partiallyAccessible',
    not_accessible: 'wheelchairAccessibility.notAccessible',
    unknown: 'wheelchairAccessibility.unknown'
  };
  const detailKeys: Record<WheelchairAccessibility, MessageKey> = {
    accessible: 'wheelchairAccessibility.accessibleDetail',
    partially_accessible: 'wheelchairAccessibility.partiallyAccessibleDetail',
    not_accessible: 'wheelchairAccessibility.notAccessibleDetail',
    unknown: 'wheelchairAccessibility.unknownDetail'
  };
  const label = $derived(copy[labelKeys[accessibility]]);
  const detail = $derived(copy[detailKeys[accessibility]]);

  let open = $state(false);
  let announcement = $state('');
  const announce = createLiveAnnouncer((message) => (announcement = message));

  function toggle(): void {
    open = !open;
    announce(open ? `${label} ${detail}` : '');
  }
</script>

{#snippet badgeFace()}
  <span class="icon" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="4.5" r="2.1" />
      <path d="M10 7h3.2l.8 5H18v2h-5.7l-.6-3.4a5 5 0 1 0 4.9 5.9l2 .4A7 7 0 1 1 10 8Z" />
    </svg>
    {#if accessibility === 'not_accessible'}
      <span class="prohibition" data-wheelchair-modifier="not_accessible"></span>
    {:else if accessibility === 'partially_accessible'}
      <span class="modifier" data-wheelchair-modifier="partially_accessible">½</span>
    {:else if accessibility === 'unknown'}
      <span class="modifier" data-wheelchair-modifier="unknown">?</span>
    {/if}
  </span>
  <span>{label}</span>
{/snippet}

{#if expandable}
  <div class="disclosure">
    <button
      type="button"
      class="badge chip {accessibility}"
      data-wheelchair-accessibility={accessibility}
      aria-expanded={open}
      aria-controls={open ? detailId : undefined}
      onclick={toggle}
    >
      {@render badgeFace()}
    </button>
    {#if open}
      <div id={detailId} class="persistent-detail" data-wheelchair-detail>
        <p>
          <strong>{label}</strong>
          {detail}
        </p>
        {@render editor?.({ announce })}
      </div>
    {/if}
  </div>
  <p class="visually-hidden" role="status" aria-live="polite" data-wheelchair-announcement>
    {announcement}
  </p>
{:else}
  <span class="badge {accessibility}" data-wheelchair-accessibility={accessibility}>
    {@render badgeFace()}
  </span>
{/if}

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

  .badge.partially_accessible {
    background: var(--hv-access-special, #f1d7bd);
  }

  .badge.not_accessible {
    background: var(--hv-color-danger-soft, #f6e1dc);
  }

  .badge.unknown {
    color: var(--hv-color-basalt, #1e2d31);
  }

  /* The same face, standing as a button. It follows the access chips' manner: a lift on hover
     and while open, so the badge reads as the same family of expandable fact. */
  .chip {
    font: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
    transition:
      border-color var(--hv-fade-quick) var(--hv-ease-settle),
      transform var(--hv-motion-quick) var(--hv-ease-settle),
      box-shadow var(--hv-fade-quick) var(--hv-ease-settle);
  }

  .chip:hover,
  .chip:focus-visible,
  .chip[aria-expanded='true'] {
    border-color: var(--hv-color-fjord);
    box-shadow: 0 0.35rem 0.9rem rgb(20 41 39 / 14%);
    transform: translateY(-2px);
  }

  .chip:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }

  .disclosure {
    display: grid;
    gap: 0.55rem;
    justify-items: start;
  }

  .persistent-detail {
    margin: 0;
    padding: 0.6rem 0.7rem;
    border-inline-start: 0.3rem solid
      var(--hv-access-detail-accent, var(--hv-color-signal, #f2c94c));
    border-radius: 0.4rem;
    background: var(--hv-color-snow-raised, #fbfcf9);
    font-size: 0.78rem;
    line-height: 1.4;
    /* The detail carries text, so the reveal is transform-only: words arrive at full contrast
       and move into place (see the fade-family limit in tokens.css). */
    animation: reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  .persistent-detail p {
    margin: 0;
  }

  .persistent-detail strong {
    display: block;
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    border: 0;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes reveal {
    from {
      transform: translateY(-0.2rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
