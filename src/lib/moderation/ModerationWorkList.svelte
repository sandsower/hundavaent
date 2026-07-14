<script lang="ts">
  import type { Catalogue } from '$i18n';

  import {
    buildModerationWorkspaceHref,
    type ModerationFilterId,
    type ModerationQueueId,
    type ModerationWorkItem
  } from './types';

  interface Props {
    copy: Catalogue;
    baseHref: string;
    activeQueueId: ModerationQueueId;
    activeQueueLabel: string;
    activeCount: number;
    items: readonly ModerationWorkItem[];
    selectedItemId: string | null;
    filters: readonly ModerationFilterId[];
    cursor: string | null;
    cursorTrail: readonly (string | null)[];
    nextCursor: string | null;
    hasPrevious: boolean;
    errorMessage?: string | null;
  }

  let {
    copy,
    baseHref,
    activeQueueId,
    activeQueueLabel,
    activeCount,
    items,
    selectedItemId,
    filters,
    cursor,
    cursorTrail,
    nextCursor,
    hasPrevious,
    errorMessage = null
  }: Props = $props();

  const previousCursor = $derived(cursorTrail.at(-1) ?? null);
  const previousTrail = $derived(cursorTrail.slice(0, -1));
  const nextTrail = $derived([...cursorTrail, cursor]);
</script>

<section class="work-list" aria-label={copy['moderation.workspace.selectedQueueLabel']}>
  <!-- Workspace URLs are canonicalized from a resolved localized base route and query state. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <header>
    <div class="heading-row">
      <h2>{activeQueueLabel}</h2>
      <span>{copy['moderation.workspace.openCount'].replace('{count}', String(activeCount))}</span>
    </div>
  </header>

  <div class="items">
    {#if errorMessage}
      <div class="error" role="alert">
        <strong>{copy['moderation.workspace.errorTitle']}</strong>
        <p>{errorMessage}</p>
        <a
          href={buildModerationWorkspaceHref(baseHref, {
            queue: activeQueueId,
            filters,
            cursor,
            cursorTrail
          })}>{copy['moderation.workspace.retry']}</a
        >
      </div>
    {:else if items.length === 0}
      <div class="empty">
        <h3>{copy['moderation.workspace.emptyTitle']}</h3>
        <p>{copy['moderation.workspace.emptyBody']}</p>
      </div>
    {:else}
      <ul>
        {#each items as item (item.id)}
          <li>
            <a
              class:selected={item.id === selectedItemId}
              aria-current={item.id === selectedItemId ? 'true' : undefined}
              href={buildModerationWorkspaceHref(baseHref, {
                queue: activeQueueId,
                itemId: item.id,
                filters,
                cursor,
                cursorTrail
              })}
              data-work-item-id={item.id}
            >
              <span class="item-top">
                <strong>{item.title}</strong>
                <span class:priority={item.priority} class="badge">{item.statusLabel}</span>
              </span>
              <span class="summary">{item.summary}</span>
              <span class="meta">{item.meta}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if !errorMessage && (hasPrevious || nextCursor)}
    <nav class="pagination" aria-label={copy['moderation.workspace.paginationLabel']}>
      {#if hasPrevious}
        <a
          data-work-previous-page
          href={buildModerationWorkspaceHref(baseHref, {
            queue: activeQueueId,
            filters,
            cursor: previousCursor,
            cursorTrail: previousTrail,
            selectLast: true
          })}>{copy['moderation.workspace.previousPage']}</a
        >
      {/if}
      {#if nextCursor}
        <a
          data-work-next-page
          href={buildModerationWorkspaceHref(baseHref, {
            queue: activeQueueId,
            filters,
            cursor: nextCursor,
            cursorTrail: nextTrail
          })}>{copy['moderation.workspace.nextPage']}</a
        >
      {/if}
    </nav>
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</section>

<style>
  .work-list {
    min-width: 0;
    border-right: 2px solid var(--ink);
    background: white;
  }
  header {
    position: sticky;
    z-index: 2;
    top: 0;
    border-bottom: 1px solid rgb(25 59 69 / 28%);
    background: white;
    padding: 1rem;
  }
  .heading-row {
    display: flex;
    gap: 0.7rem;
    align-items: baseline;
    justify-content: space-between;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-size: 1.25rem;
  }
  .heading-row span,
  .meta,
  .summary {
    color: var(--ink-soft);
  }
  .heading-row span {
    flex: none;
    font-size: 0.78rem;
  }
  a:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li + li {
    border-top: 1px solid rgb(25 59 69 / 22%);
  }
  li > a {
    display: grid;
    gap: 0.28rem;
    border-left: 0.4rem solid transparent;
    background: white;
    padding: 0.85rem 1rem 0.85rem 0.65rem;
    color: var(--ink);
    text-decoration: none;
  }
  li > a:hover {
    background: #fff8dc;
  }
  li > a.selected {
    border-left-color: var(--coral);
    background: #fff4cf;
  }
  .item-top {
    display: flex;
    min-width: 0;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }
  .item-top strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .badge {
    flex: none;
    border-radius: 999px;
    background: var(--mint);
    padding: 0.16rem 0.4rem;
    font-size: 0.65rem;
    font-weight: 900;
    text-transform: uppercase;
  }
  .badge.priority {
    background: var(--coral-soft);
    color: var(--coral-dark);
  }
  .summary,
  .meta {
    font-size: 0.76rem;
    line-height: 1.35;
  }
  .empty,
  .error {
    margin: 1rem;
    border: 2px solid var(--ink);
    border-radius: 0.9rem;
    padding: 1rem;
  }
  .empty {
    background: var(--mint);
  }
  .error {
    border-color: var(--danger);
    background: var(--coral-soft);
  }
  .empty p,
  .error p {
    margin-top: 0.3rem;
    color: var(--ink-soft);
    line-height: 1.4;
  }
  .error a {
    display: inline-block;
    margin-top: 0.7rem;
    color: var(--coral-dark);
    font-weight: 900;
  }
  .pagination {
    display: flex;
    gap: 0.6rem;
    justify-content: space-between;
    border-top: 1px solid rgb(25 59 69 / 28%);
    padding: 0.75rem 1rem;
  }
  .pagination a {
    color: var(--coral-dark);
    font-size: 0.78rem;
    font-weight: 900;
  }
  .pagination a:last-child {
    margin-left: auto;
  }
  @media (max-width: 44rem) {
    .work-list {
      border-right: 0;
      border-bottom: 2px solid var(--ink);
    }
    header {
      position: static;
    }
    .items {
      max-height: 15rem;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
</style>
