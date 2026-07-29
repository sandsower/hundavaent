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
  }

  // href decides the rendered element, so the two native attribute sets are intersected rather
  // than kept as a discriminated union: callers pass one Button and let the markup pick <a> or
  // <button>, and every prop not owned above (aria-*, data-*, disabled, onclick, ...) spreads
  // through untouched regardless of which element it lands on. Order matters here: TypeScript
  // resolves a handler prop like onclick, shared by both native attribute sets with a different
  // `currentTarget`, to the *last* intersected member's signature - Button second is what lets a
  // button-mode caller narrow `event.currentTarget as HTMLButtonElement` without a type error.
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
  const base =
    'inline-flex min-h-control items-center justify-center border border-border-strong rounded-control px-[0.8rem] py-[0.55rem] [font-family:inherit] [font-size:inherit] [line-height:inherit] font-extrabold no-underline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-focus-ring focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]';

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
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Button is a generic primitive; href arrives pre-resolved (or intentionally external) from whichever caller supplied it. -->
  <a {href} class={classes} {...rest} aria-pressed={pressed}>
    {@render children()}
  </a>
{:else}
  <button class={classes} {...rest} type={type ?? 'button'} aria-pressed={pressed}>
    {@render children()}
  </button>
{/if}
