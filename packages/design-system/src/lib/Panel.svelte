<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface PanelOwnProps {
    /** section/article/li/header/div at call sites - the raised surface is a treatment, not a
        structure, so the element stays caller-owned (the Notice precedent). */
    as?: string;
    /** True where the old markup paired the surface with the shared inset (.hv-list-card, or
        .hv-form-section.hv-panel); false where the call site owns its own padding. */
    padded?: boolean;
    /** Call-site hooks and non-conflicting utilities only - overriding the surface set through
        this is unsupported; extend the component instead. */
    class?: string;
    children: Snippet;
  }

  type Props = PanelOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof PanelOwnProps>;

  let { as = 'div', padded = false, class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of .hv-panel: subtle 1px border, panel radius, the raised
  // snow surface and its shadow, all as one matched set (the Notice/Button complete-set rule).
  const base = 'border border-border-subtle rounded-panel bg-snow-raised shadow-raised';

  const classes = $derived([base, padded && 'p-panel', className].filter(Boolean).join(' '));
</script>

<svelte:element this={as} class={classes} {...rest}>
  {@render children()}
</svelte:element>
