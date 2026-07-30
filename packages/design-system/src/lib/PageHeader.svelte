<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface PageHeaderOwnProps {
    /** Call-site hooks and layout glue only. The one piece of glue most callers need is
        `mb-section`: a header sitting directly in a non-stack shell owned that margin through
        `.hv-page-shell:not(.hv-stack) > .hv-page-header`, and the component cannot know its
        parent, so the call site says it. Headers inside a stack add nothing. */
    class?: string;
    children: Snippet;
  }

  type Props = PageHeaderOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof PageHeaderOwnProps>;

  let { class: className = '', children, ...rest }: Props = $props();

  // One gap for everything the header holds - this is the 8px/16px rhythm resolution. The old
  // markup needed a heading-group wrapper because the header's own gap was 0.5rem while the
  // group's was --hv-space-panel; but the wrapped pages' computed rhythm was --hv-space-panel
  // between every band anyway (heading gap 1rem; heading-to-actions 0.5rem gap + 0.5rem
  // margin = 1rem in Member mode), so gap-panel with direct children reproduces them exactly,
  // and the flat headers - which sat at the header's raw 0.5rem - join the same rhythm. The
  // wrapper element itself is no longer part of the contract: eyebrow, title, intro, and the
  // action band all sit directly in the header.
  //
  // Children are expected to be the zero-margin primitives (Eyebrow, PageTitle, Meta) or
  // wrapper divs; a bare <p> child would reintroduce user-agent margins on top of the gap,
  // which is the caller's to avoid.
  const classes = $derived(['grid gap-panel', className].filter(Boolean).join(' '));
</script>

<header class={classes} {...rest}>
  {@render children()}
</header>
