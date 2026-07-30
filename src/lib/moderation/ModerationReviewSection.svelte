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

<details {id} class="review-section" data-section-state={sectionState} bind:open={expanded}>
  <summary>
    <span class="section-heading">
      <strong>{title}</strong>
      <span>{summary}</span>
    </span>
    <span class="state-marker" aria-hidden="true"></span>
  </summary>
  <div class="section-body">
    {@render children?.()}
  </div>
</details>

<style>
  .review-section {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    scroll-margin: 1rem;
  }
  .review-section[data-section-state='warning'] {
    border-color: var(--hv-color-signal);
  }
  .review-section[data-section-state='blocking'] {
    border-color: var(--hv-color-danger);
  }
  summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.8rem 0.9rem;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }
  .section-heading {
    display: grid;
    gap: 0.18rem;
  }
  .section-heading strong {
    font-family: var(--hv-font-display);
    font-size: 1rem;
  }
  .section-heading span {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    line-height: 1.35;
  }
  .state-marker {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-success);
  }
  [data-section-state='warning'] .state-marker {
    background: var(--hv-color-signal);
  }
  [data-section-state='blocking'] .state-marker {
    background: var(--hv-color-danger);
  }
  .section-body {
    border-top: 1px solid var(--hv-border-subtle);
    padding: 0.85rem 0.9rem;
  }
</style>
