<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface PageTitleOwnProps {
    /** h1 on pages, h2 where the title heads a sub-surface. Always a heading element - the
        display treatment carries page-title weight and screen readers should agree. */
    as?: 'h1' | 'h2';
    /** Call-site hooks and non-conflicting utilities only. */
    class?: string;
    children: Snippet;
  }

  type Props = PageTitleOwnProps & Omit<HTMLAttributes<HTMLHeadingElement>, keyof PageTitleOwnProps>;

  let { as = 'h1', class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of .hv-page-title: the display serif at a viewport-tracking
  // clamp, weight 650, sub-1 leading with tight tracking, capped at 18ch so a long Icelandic
  // place name wraps rather than running the measure. m-0 replaces the header's descendant
  // margin reset - the primitive owns its own zero now.
  const base =
    'm-0 max-w-[18ch] text-basalt font-display text-[clamp(2.4rem,7vw,4.5rem)] font-[650] leading-[0.98] tracking-[-0.035em]';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<svelte:element this={as} class={classes} {...rest}>
  {@render children()}
</svelte:element>
