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
  <span
    class="icon relative grid size-[1.45rem] flex-none place-items-center rounded-[50%] bg-snow-raised"
    aria-hidden="true"
  >
    <svg class="size-[1.02rem] fill-current" viewBox="0 0 24 24">
      <circle cx="12" cy="4.5" r="2.1" />
      <path d="M10 7h3.2l.8 5H18v2h-5.7l-.6-3.4a5 5 0 1 0 4.9 5.9l2 .4A7 7 0 1 1 10 8Z" />
    </svg>
    {#if accessibility === 'not_accessible'}
      <span
        class="prohibition absolute w-[1.15rem] h-[0.13rem] rounded-[999px] bg-danger transform-[rotate(-42deg)]"
        data-wheelchair-modifier="not_accessible"
      ></span>
    {:else if accessibility === 'partially_accessible'}
      <span
        class="modifier absolute right-[-0.16rem] bottom-[-0.18rem] grid size-[0.72rem] place-items-center border border-basalt rounded-[50%] bg-snow-raised text-[0.55rem] leading-none [font-weight:950] text-basalt"
        data-wheelchair-modifier="partially_accessible">½</span
      >
    {:else if accessibility === 'unknown'}
      <span
        class="modifier absolute right-[-0.16rem] bottom-[-0.18rem] grid size-[0.72rem] place-items-center border border-basalt rounded-[50%] bg-snow-raised text-[0.55rem] leading-none [font-weight:950] text-basalt"
        data-wheelchair-modifier="unknown">?</span
      >
    {/if}
  </span>
  <span>{label}</span>
{/snippet}

{#if expandable}
  <div class="disclosure grid justify-items-start gap-[0.55rem]">
    <!-- The same face, standing as a button. It follows the access chips' manner: a lift on hover
         and while open, so the badge reads as the same family of expandable fact. -->
    <!-- .badge's line-height: 1.05 was overridden by .chip's later font: inherit. -->
    <button
      type="button"
      class="badge chip {accessibility} inline-flex w-fit min-h-8 cursor-pointer items-center gap-[0.42rem] py-[0.24rem] pr-[0.55rem] pl-[0.3rem] border border-basalt rounded-[999px] bg-access-unknown [font-family:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] text-[0.72rem] font-extrabold text-basalt [transition:border-color_var(--hv-fade-quick)_var(--hv-ease-settle),transform_var(--hv-motion-quick)_var(--hv-ease-settle),box-shadow_var(--hv-fade-quick)_var(--hv-ease-settle)] data-[wheelchair-accessibility=accessible]:bg-moss-soft data-[wheelchair-accessibility=partially\_accessible]:bg-access-special data-[wheelchair-accessibility=not\_accessible]:bg-danger-soft hover:border-fjord hover:shadow-[0_0.35rem_0.9rem_rgb(20_41_39_/_14%)] hover:transform-[translateY(-2px)] focus-visible:border-fjord focus-visible:shadow-[0_0.35rem_0.9rem_rgb(20_41_39_/_14%)] focus-visible:transform-[translateY(-2px)] focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] aria-[expanded=true]:border-fjord aria-[expanded=true]:shadow-[0_0.35rem_0.9rem_rgb(20_41_39_/_14%)] aria-[expanded=true]:transform-[translateY(-2px)]"
      data-wheelchair-accessibility={accessibility}
      aria-expanded={open}
      aria-controls={open ? detailId : undefined}
      onclick={toggle}
    >
      {@render badgeFace()}
    </button>
    {#if open}
      <div
        id={detailId}
        class="persistent-detail m-0 py-[0.6rem] px-[0.7rem] border-s-[0.3rem] border-s-access-detail-accent rounded-[0.4rem] bg-snow-raised text-[0.78rem] leading-[1.4]"
        data-wheelchair-detail
      >
        <p class="m-0">
          <strong class="block">{label}</strong>
          {detail}
        </p>
        {@render editor?.({ announce })}
      </div>
    {/if}
  </div>
  <p
    class="visually-hidden absolute size-px -m-px overflow-hidden p-0 border-0 [clip-path:inset(50%)] whitespace-nowrap"
    role="status"
    aria-live="polite"
    data-wheelchair-announcement
  >
    {announcement}
  </p>
{:else}
  <span
    class="badge {accessibility} inline-flex w-fit min-h-8 items-center gap-[0.42rem] py-[0.24rem] pr-[0.55rem] pl-[0.3rem] border border-basalt rounded-[999px] bg-access-unknown text-[0.72rem] leading-[1.05] font-extrabold text-basalt data-[wheelchair-accessibility=accessible]:bg-moss-soft data-[wheelchair-accessibility=partially\_accessible]:bg-access-special data-[wheelchair-accessibility=not\_accessible]:bg-danger-soft"
    data-wheelchair-accessibility={accessibility}
  >
    {@render badgeFace()}
  </span>
{/if}

<style>
  .persistent-detail {
    /* The detail carries text, so the reveal is transform-only: words arrive at full contrast
       and move into place (see the fade-family limit in tokens.css). */
    animation: reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
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
