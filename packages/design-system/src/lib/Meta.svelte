<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface MetaOwnProps {
    /** p for intros and hints, small for card footnotes, div where the muted treatment wraps
        richer content (the coordinate-alternative block). */
    as?: string;
    /** Call-site hooks and non-conflicting utilities only. */
    class?: string;
    children: Snippet;
  }

  type Props = MetaOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof MetaOwnProps>;

  let { as = 'p', class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of .hv-meta: muted supporting text a step under body size.
  // leading-normal is Tailwind's 1.5, the same literal .hv-meta carried. m-0 because the
  // primitive owns its own zero (see PageHeader's children note).
  const base = 'm-0 text-basalt-muted text-[0.9rem] leading-normal';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<svelte:element this={as} class={classes} {...rest}>
  {@render children()}
</svelte:element>
