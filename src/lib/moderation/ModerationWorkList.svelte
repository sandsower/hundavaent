<script lang="ts">
  import type { Catalogue } from '$i18n';

  import {
    buildModerationWorkspaceHref,
    moderationFilterIds,
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
  const filterLabels = {
    actionable: 'moderation.workspace.filter.actionable',
    deferred: 'moderation.workspace.filter.deferred',
    resolved: 'moderation.workspace.filter.resolved'
  } as const;
</script>

<section class="work-list" aria-label={copy['moderation.workspace.selectedQueueLabel']}>
  <!-- Workspace URLs are canonicalized from a resolved localized base route and query state. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <header>
    <div class="heading-row">
      <h2>{activeQueueLabel}</h2>
      <span>{copy['moderation.workspace.openCount'].replace('{count}', String(activeCount))}</span>
    </div>
    <nav class="filters" aria-label={copy['moderation.workspace.filter.label']}>
      {#each moderationFilterIds as filter (filter)}
        <a
          class:active={filters.includes(filter)}
          aria-current={filters.includes(filter) ? 'page' : undefined}
          href={buildModerationWorkspaceHref(baseHref, {
            queue: activeQueueId,
            filters: [filter]
          })}>{copy[filterLabels[filter]]}</a
        >
      {/each}
    </nav>
  </header>

  <div class="items" data-work-list-scroll>
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
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border-right: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
  }
  header {
    z-index: 2;
    border-bottom: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
    padding: 1rem;
  }
  .heading-row {
    display: flex;
    gap: 0.7rem;
    align-items: baseline;
    justify-content: space-between;
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    margin-top: 0.75rem;
  }
  .filters a {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.42rem 0.3rem;
    color: var(--hv-color-basalt);
    font-size: 0.72rem;
    font-weight: 850;
    text-align: center;
    text-decoration: none;
  }
  .filters a.active {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-signal);
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-family: var(--hv-font-display);
    font-size: 1.25rem;
    font-weight: 650;
  }
  .heading-row span,
  .meta,
  .summary {
    color: var(--hv-color-basalt-muted);
  }
  .heading-row span {
    flex: none;
    font-size: 0.78rem;
  }
  a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .items {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  li + li {
    border-top: 1px solid var(--hv-border-subtle);
  }
  li > a {
    display: grid;
    gap: 0.28rem;
    border-left: 0.4rem solid transparent;
    background: var(--hv-color-snow-raised);
    padding: 0.85rem 1rem 0.85rem 0.65rem;
    color: var(--hv-color-basalt);
    text-decoration: none;
  }
  li > a:hover {
    background: var(--hv-color-signal-soft);
  }
  li > a.selected {
    border-left-color: var(--hv-color-signal);
    background: var(--hv-color-signal-soft);
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
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-fjord-soft);
    padding: 0.16rem 0.4rem;
    font-size: 0.65rem;
    font-weight: 900;
    text-transform: uppercase;
  }
  .badge.priority {
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }
  .summary,
  .meta {
    font-size: 0.76rem;
    line-height: 1.35;
  }
  .empty,
  .error {
    margin: 1rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-panel);
    padding: 1rem;
  }
  .empty {
    background: var(--hv-color-success-soft);
  }
  .error {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
  }
  .empty p,
  .error p {
    margin-top: 0.3rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.4;
  }
  .error a {
    display: inline-block;
    margin-top: 0.7rem;
    color: var(--hv-color-fjord);
    font-weight: 900;
  }
  .pagination {
    display: flex;
    gap: 0.6rem;
    justify-content: space-between;
    border-top: 1px solid var(--hv-border-subtle);
    padding: 0.75rem 1rem;
  }
  .pagination a {
    color: var(--hv-color-fjord);
    font-size: 0.78rem;
    font-weight: 900;
  }
  .pagination a:last-child {
    margin-left: auto;
  }
  @media (max-width: 60rem) {
    .work-list {
      border-right: 0;
    }
  }
  @media (max-width: 44rem) {
    .work-list {
      border-bottom: 1px solid var(--hv-border-subtle);
    }
  }
</style>
