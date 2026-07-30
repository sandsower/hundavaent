<script lang="ts">
  import { Notice, Status } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';

  import {
    buildModerationWorkspaceHref,
    moderationFilterIds,
    type ModerationFilterId,
    type ModerationPendingPhotoEntry,
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
    /**
     * Places holding Member photos. Cross-queue by nature - a photo can arrive on any Place - so
     * it is a section of its own rather than a fourth queue, and it is shown only when there is
     * something in it.
     */
    pendingPhotoPlaces?: readonly ModerationPendingPhotoEntry[];
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
    pendingPhotoPlaces = [],
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
      <Notice tone="error" class="error" role="alert">
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
      </Notice>
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
                <Status tone={item.priority ? 'error' : undefined} class="badge"
                  >{item.statusLabel}</Status
                >
              </span>
              {#if item.priorityLabel}
                <Status tone="success" class="priority-signal">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 3c2.5 2 5 2.5 7.5 3v5c0 5-3.1 8.2-7.5 10-4.4-1.8-7.5-5-7.5-10V6C7 5.5 9.5 5 12 3Z"
                    />
                    <path d="m8.7 11.8 2.1 2.1 4.6-4.7" />
                  </svg>
                  {item.priorityLabel}
                </Status>
              {/if}
              <span class="summary">{item.summary}</span>
              <span class="meta">{item.meta}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if pendingPhotoPlaces.length > 0}
      <section class="pending-photos" data-pending-photos>
        <h3>{copy['moderation.workspace.pendingPhotos.title']}</h3>
        <p>{copy['moderation.workspace.pendingPhotos.help']}</p>
        <ul>
          {#each pendingPhotoPlaces as place (place.placeId)}
            <li>
              <!-- The link's whole text is its accessible name, so the count a Moderator reads is
                   the count a speech-input user says (WCAG 2.5.3). -->
              <a href={place.href} data-pending-photo-place={place.placeId}>
                <strong>{place.title}</strong>
                <span>{place.meta}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
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
    font-weight: 800;
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
  /* Status renders its span inside a child component, so Svelte's scoped CSS cannot reach it
     directly - .badge/.priority-signal are guaranteed to land on the rendered span because we
     pass them through Status's class prop ourselves (the FavouriteControl precedent). Status's
     own tone classes now own background/text/radius/weight; only the leftover layout and the
     original reduced font-size survive here. */
  .work-list :global(.badge) {
    flex: none;
    padding: 0.16rem 0.4rem;
    font-size: 0.65rem;
    text-transform: uppercase;
  }
  .work-list :global(.priority-signal) {
    display: inline-flex;
    width: fit-content;
    gap: 0.28rem;
    align-items: center;
    padding: 0.2rem 0.45rem;
    font-size: 0.68rem;
  }
  .work-list :global(.priority-signal svg) {
    width: 0.9rem;
    height: 0.9rem;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .summary,
  .meta {
    font-size: 0.76rem;
    line-height: 1.35;
  }
  .empty {
    margin: 1rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-success-soft);
    padding: 1rem;
  }
  /* Notice renders its element in a child component, so scoped CSS cannot reach it directly -
     anchored through .work-list (locally authored) with :global() on the Notice-rendered class,
     per the ancestor-scoped-:global pattern (FavouriteControl.svelte). Notice's error tone now
     owns the border/background colour; only the leftover margin survives here. */
  .work-list :global(.error) {
    margin: 1rem;
  }
  .empty p,
  .work-list :global(.error p) {
    margin-top: 0.3rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.4;
  }
  .work-list :global(.error a) {
    display: inline-block;
    margin-top: 0.7rem;
    color: var(--hv-color-fjord);
    font-weight: 800;
  }
  .pending-photos {
    margin: 1rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow);
    padding: 0.8rem;
  }
  .pending-photos h3 {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .pending-photos p {
    margin-top: 0.3rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    line-height: 1.4;
  }
  .pending-photos ul {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.6rem;
  }
  .pending-photos li + li {
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 0.3rem;
  }
  .pending-photos a {
    display: grid;
    gap: 0.15rem;
    border-radius: var(--hv-radius-control);
    padding: 0.3rem 0.35rem;
    color: var(--hv-color-basalt);
    font-size: 0.76rem;
    text-decoration: none;
  }
  .pending-photos a:hover {
    background: var(--hv-color-signal-soft);
  }
  .pending-photos a strong {
    overflow-wrap: anywhere;
    text-decoration: underline;
  }
  .pending-photos a span {
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
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
    font-weight: 800;
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
