<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

  type Intent = 'neutral' | 'primary' | 'committed';

  interface ButtonOwnProps {
    intent?: Intent;
    /** Present at all when this Button is a toggle; true renders the same look as `committed`. */
    pressed?: boolean;
    href?: string;
    type?: HTMLButtonAttributes['type'];
    class?: string;
    children: Snippet;
    // Declared here, rather than left to the intersection below, because HTMLAnchorAttributes and
    // HTMLButtonAttributes each carry their own onclick signature with a different `currentTarget`
    // element type. Intersecting two functions with incompatible parameter types collapses them
    // into unusable overloads - a caller whose handler accepts the union of both elements (as every
    // interactive Story's `args.onclick` does) fails to satisfy either overload. Naming onclick here
    // with a single signature over the *union* element type sidesteps that: it is `Omit`-ted out of
    // the intersection below, so this is the only onclick signature Props exposes, and it is
    // satisfied both by handlers written for the union and by handlers written for one element that
    // narrow via a cast - see FavouriteControl.svelte's `event.currentTarget as HTMLButtonElement`.
    onclick?: (
      event: MouseEvent & { currentTarget: EventTarget & (HTMLAnchorElement | HTMLButtonElement) }
    ) => void;
  }

  // href decides the rendered element, so the two native attribute sets are intersected rather
  // than kept as a discriminated union: callers pass one Button and let the markup pick <a> or
  // <button>, and every prop not owned above (aria-*, data-*, disabled, ...) spreads through
  // untouched regardless of which element it lands on. onclick is the one native handler pulled
  // out into ButtonOwnProps above rather than left to this intersection - see the comment there.
  type Props = ButtonOwnProps &
    Omit<HTMLAnchorAttributes & HTMLButtonAttributes, keyof ButtonOwnProps>;

  let {
    intent = 'neutral',
    pressed,
    href,
    type,
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  // The exact utility codification of .hv-control (primitives.css ~131-176): min-height, the 1px
  // strong border, the control radius, the fixed padding, weight 800, no underline, and the
  // focus-visible ring + offset shadow. Background and text colour are deliberately absent here -
  // they come from intentClasses below as a single matched pair, never layered on top of this.
  // font-extrabold (not font-bold) matches .hv-control's font-weight: 800. The three inherited
  // properties are named individually rather than via the `[font:inherit]` shorthand: that
  // shorthand also resets font-weight, and its resolution order against a separate weight utility
  // is not something Tailwind's generated stylesheet order guarantees - naming family/size/line-height
  // directly leaves font-weight solely owned by font-extrabold.
  // The standard hover/active/cursor treatment, owned here rather than duplicated per call site.
  // This is the exact codification of the idiom surveyed from CheckInControl.svelte (.hv-control),
  // FavouriteControl.svelte (.favourite-toggle), and SuggestPlacePill.svelte (.suggest-pill):
  // pointer cursor while enabled, a -1px hover lift gated on not-disabled AND not-aria-pressed
  // (the settled/selected state stays put, per FavouriteControl's comment "The outline state
  // invites; the saved state is already settled"), and a 0.97 active squish gated on not-disabled
  // - the standard control squish; smaller round pills using a stronger squish is deliberate
  // call-site character, not a deviation to fix. The transition rides --hv-motion-instant, the
  // same control tempo, so reduced motion and operations mode retune it exactly as they do at
  // every surveyed call site. Anchors carry no :disabled attribute, so not-disabled resolves true
  // there, which is the correct outcome - a link-mode Button still gets the lift.
  const base =
    'inline-flex min-h-control items-center justify-center border border-border-strong rounded-control px-[0.8rem] py-[0.55rem] [font-family:inherit] [font-size:inherit] [line-height:inherit] font-extrabold no-underline cursor-pointer transition-transform duration-[var(--hv-motion-instant)] ease-settle not-disabled:not-aria-pressed:hover:-translate-y-px not-disabled:active:scale-[0.97] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-focus-ring focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]';

  // Each intent is a complete background/text pair, not an override layered on the base classes:
  // Tailwind resolves two same-specificity utility classes (say bg-snow-raised and bg-basalt) by
  // their position in the generated stylesheet, not by their order in the class attribute, so
  // having both in the list at once is not a safe way to express "this one wins".
  const intentClasses: Record<Intent, string> = {
    neutral: 'bg-snow-raised text-basalt',
    primary: 'bg-basalt text-snow-raised',
    committed: 'bg-signal text-basalt'
  };

  // A pressed Button always reads as committed. The two states are visually identical today, and
  // pressed is the more specific signal, so it wins over whatever intent was passed.
  const visualIntent = $derived(pressed === true ? 'committed' : intent);
  const classes = $derived(
    [base, intentClasses[visualIntent], className].filter(Boolean).join(' ')
  );
</script>

{#if href}
  <!-- No aria-pressed here: a link cannot be a toggle, and role link rejects the attribute. The
       pressed prop still drives the selected look for the rare anchor that wants it. -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Button is a generic primitive; href arrives pre-resolved (or intentionally external) from whichever caller supplied it. -->
  <a {href} class={classes} {...rest}>
    {@render children()}
  </a>
{:else}
  <button class={classes} {...rest} type={type ?? 'button'} aria-pressed={pressed}>
    {@render children()}
  </button>
{/if}
