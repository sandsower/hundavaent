<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Mode = 'place' | 'operations';
  type Width = 'wide' | 'narrow';

  interface PageShellOwnProps {
    /** Which element the shell renders as. Almost always the page's `main`; about's editorial
        shell is a `div` inside its own moded `main`, and the translations workspace is a
        `section`. */
    as?: string;
    /** Emitted as `data-ui-mode` unconditionally. The attribute is load-bearing twice over: the
        operations retune in tokens.css keys on it, and every unmigrated hv-* primitive rule in
        the shell's subtree is guarded by "ancestor-or-self carries a ui mode" - a shell that
        stopped emitting it would silently un-style its own descendants (the failure mode the
        guard's comment in primitives.css describes). A nested duplicate (about) is harmless:
        the inner attribute re-declares the same custom properties. */
    mode?: Mode;
    /** Content measure. Wide is the default the old data-width vocabulary implied when absent. */
    width?: Width;
    /** Call-site hooks and layout glue only (e.g. `grid gap-context` for shells that are also
        stacks, `mb-*` never - the shell owns its own block spacing). */
    class?: string;
    children: Snippet;
  }

  type Props = PageShellOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof PageShellOwnProps>;

  let {
    as = 'main',
    mode = 'place',
    width = 'wide',
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  // The width variant is a scoped class rather than a data attribute: the old data-width
  // vocabulary retires with .hv-page-shell, and nothing outside this component should key on it.
  const classes = $derived(['shell', width === 'narrow' && 'narrow', className]
    .filter(Boolean)
    .join(' '));
</script>

<svelte:element this={as} class={classes} data-ui-mode={mode} {...rest}>
  {@render children()}
</svelte:element>

<style>
  /* The exact recipe of .hv-page-shell (primitives.css): hug the viewport at the shared edge
     inset, cap at the content container, centre, and carry the page's own block padding. Scoped
     style rather than utilities because the width is a min() over two token references - the
     same reason Dialog keeps a style block - and var() resolves here at the element, so the
     operations edge/section retunes flow through exactly as the primitive class's did. */
  .shell {
    width: min(100% - var(--hv-space-edge) * 2, var(--hv-content-wide));
    margin-inline: auto;
    padding-block: var(--hv-space-section) 4rem;
  }

  .shell.narrow {
    width: min(100% - var(--hv-space-edge) * 2, var(--hv-content-narrow));
  }
</style>
