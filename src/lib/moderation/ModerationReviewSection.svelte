<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { ModerationReviewSectionState } from './types';

  // Deliberately NOT the package Disclosure (phase-6 decision): ModerationReadinessSummary
  // imperatively reaches into a section by id, asserts `instanceof HTMLDetailsElement`, flips
  // `.open`, and focuses the child <summary> - a contract that needs a literal native
  // <details>/<summary> pair at a stable id. The custom summary grid (title + meta + trailing
  // state-marker dot) and the hash-expansion effect below also don't fit Disclosure's plain
  // trigger/panel contract. Internals are restyled onto tokens/utilities where they hard-coded a
  // value that already has a token equivalent; spacing/type literals with no token equivalent are
  // left as scoped CSS.

  interface Props {
    id: string;
    title: string;
    summary: string;
    state?: ModerationReviewSectionState;
    defaultOpen?: boolean;
    children?: Snippet;
  }

  let {
    id,
    title,
    summary,
    state: sectionState = 'complete',
    defaultOpen = false,
    children
  }: Props = $props();
  let expanded = $state(false);
  let initialized = false;

  $effect(() => {
    if (!initialized) {
      expanded = defaultOpen || sectionState !== 'complete';
      initialized = true;
    } else if (sectionState !== 'complete') {
      expanded = true;
    }
  });

  $effect(() => {
    if (typeof window !== 'undefined' && window.location.hash === `#${id}`) expanded = true;
  });
</script>

<!-- Named group, per the nesting rule: these sections sit inside review panels that are
     themselves converted surfaces, so the state-marker's ancestor-state styling addresses this
     root by name rather than matching whichever group happens to be nearest. -->
<details
  {id}
  class="review-section group/review-section scroll-m-4 border border-border-subtle rounded-panel bg-snow-raised data-[section-state=warning]:border-signal data-[section-state=blocking]:border-danger"
  data-section-state={sectionState}
  bind:open={expanded}
>
  <summary
    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-[0.8rem] px-[0.9rem] list-none cursor-pointer focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px]"
  >
    <span class="section-heading grid gap-[0.18rem]">
      <strong class="font-display text-[1rem]">{title}</strong>
      <span class="text-[0.78rem] leading-[1.35] text-basalt-muted">{summary}</span>
    </span>
    <span
      class="state-marker w-[0.7rem] h-[0.7rem] rounded-control bg-success group-data-[section-state=warning]/review-section:bg-signal group-data-[section-state=blocking]/review-section:bg-danger"
      aria-hidden="true"
    ></span>
  </summary>
  <div class="section-body py-[0.85rem] px-[0.9rem] border-t border-t-border-subtle">
    {@render children?.()}
  </div>
</details>

<style>
  /* stays: a vendor pseudo-element Tailwind has no variant for. `list-none` on the summary above
     covers the standard ::marker; this is the Safari/WebKit half of the same suppression. */
  summary::-webkit-details-marker {
    display: none;
  }
</style>
