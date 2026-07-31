<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLDetailsAttributes } from 'svelte/elements';

  interface DisclosureOwnProps {
    /** Bound to the underlying <details> via bind:this. There is deliberately no bindable `open`
        prop alongside it: SelectedPlaceCard's shipped usage (the sole real-world .hv-disclosure
        call site) runs an $effect that reads `completeDetails.open` as its own guard before ever
        writing to it - collapsing the panel closed on an unrelated profile change only when it
        isn't already open. A bindable `open` prop would make that guard's read a reactive
        dependency of the very effect that writes it, a footgun this component has no business
        creating. Exposing the raw element instead keeps the DOM the one source of truth for
        open/closed, exactly as native <details> already is, and lets a consumer read or write
        `.open` on it directly - the same shape SelectedPlaceCard used before this codification
        existed. */
    element?: HTMLDetailsElement;
    /** The summary row's own content. Disclosure renders its own chevron after this snippet (see
        the chevron note below), so callers supply only the label, never the affordance - and
        never copy, per the components-carry-no-copy rule. */
    summary: Snippet;
    /** The disclosure's body content, shown while open. */
    children: Snippet;
    /** Call-site hooks and non-conflicting utilities only - overriding the border/summary
        treatment through this is unsupported; extend the component instead. */
    class?: string;
  }

  type Props = DisclosureOwnProps & Omit<HTMLDetailsAttributes, keyof DisclosureOwnProps>;

  let {
    element = $bindable(undefined),
    summary,
    children,
    class: className = '',
    ...rest
  }: Props = $props();

  // The exact utility codification of the retired legacy .hv-disclosure primitive's own rule: a
  // single 1px top border in the subtle border colour, nothing else on the root. Known
  // asterisk: the source rule used the logical border-block-start; border-t is physical. They
  // are identical for every writing mode this product ships - revisit if an RTL or vertical
  // locale ever lands.
  const base = 'border-t border-border-subtle';

  // The exact utility codification of the retired legacy .hv-disclosure > summary primitive plus
  // SelectedPlaceCard's own hand-rolled `summary` rule (SelectedPlaceCard.svelte ~884-894): the
  // full-width flex row (no width utility needed - a flex-display block-level box already fills
  // its container), its gap and block-only padding, fjord colour, the 850 weight (font-[850] -
  // the same arbitrary-value idiom Eyebrow.svelte already uses for this exact non-standard
  // weight), pointer cursor, and marker suppression via list-none (list-style-type only - the
  // ::-webkit-details-marker half needs the scoped style block below, since Tailwind's utility
  // layer has no selector for that pseudo-element). The ring itself is not declared here - it
  // comes from theme.css's global `@layer base` rule. Only the focus radius shaping, a real local
  // delta from that shared ring, is declared below.
  const summaryClasses =
    'flex items-center justify-between gap-2 py-[0.85rem] px-0 text-fjord font-[850] cursor-pointer list-none focus-visible:rounded-control';

  // The exact utility codification of SelectedPlaceCard's .summary-chevron (~899-909): a fixed
  // 1.05rem square that never shrinks in the flex row, an outlined (not filled) stroke path, the
  // round cap/join and 2.1 stroke-width the source hand-rolled, and the same quick-tempo/settle-
  // eased transform transition every other motion primitive in this package rides (Button's
  // hover-lift, Dialog's arrival animation). stroke-linecap/linejoin and the 2.1 stroke-width have
  // no Tailwind core utility, hence the arbitrary-property syntax. The 180deg rotation on open is
  // in the scoped style block below, keyed off `details[open] > summary` exactly like the source
  // rule - Tailwind's utility layer has no `details[open]` state variant to reach for.
  const chevronClasses =
    'disclosure-chevron flex-none w-[1.05rem] h-[1.05rem] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.1] transition-transform duration-[var(--hv-motion-quick)] ease-settle';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<details bind:this={element} class={classes} {...rest}>
  <summary class={summaryClasses}>
    {@render summary()}
    <svg class={chevronClasses} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </summary>
  {@render children()}
</details>

<style>
  /* Marker suppression's Chrome/Safari half - the list-none utility above only resets
     list-style-type (the Firefox/standards half); the disclosure triangle Chromium renders is a
     distinct pseudo-element Tailwind's utility layer cannot reach. Mirrors SelectedPlaceCard's own
     `summary::-webkit-details-marker` rule verbatim. */
  summary::-webkit-details-marker {
    display: none;
  }

  /* Mirrors SelectedPlaceCard's `details[open] > summary .summary-chevron` rule verbatim -
     Tailwind has no `details[open]` state variant to express this as a utility. */
  details[open] > summary .disclosure-chevron {
    transform: rotate(180deg);
  }
</style>
