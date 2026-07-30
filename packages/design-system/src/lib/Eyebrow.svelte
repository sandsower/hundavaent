<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface EyebrowOwnProps {
    /** p at call sites today, h3 for the achievements group headings, span inside summaries.
        The treatment is typographic, not structural, so the element stays caller-owned. */
    as?: string;
    /** Call-site hooks and non-conflicting utilities only - surfaces that recolour their
        eyebrows (about's editorial sections) do it through a hook class, not by overriding
        text-fjord here. */
    class?: string;
    children: Snippet;
  }

  type Props = EyebrowOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof EyebrowOwnProps>;

  let { as = 'p', class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of .hv-eyebrow: small, heavy, tracked-out uppercase fjord.
  // m-0 because the primitive owns its own zero (see PageHeader's children note).
  const base = 'm-0 text-fjord text-[0.72rem] font-[850] tracking-[0.1em] uppercase';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<svelte:element this={as} class={classes} {...rest}>
  {@render children()}
</svelte:element>
