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

<section
  class="work-list grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-r border-r-border-subtle bg-snow-raised max-[60rem]:border-r-0 max-[44rem]:border-b max-[44rem]:border-b-border-subtle"
  aria-label={copy['moderation.workspace.selectedQueueLabel']}
>
  <!-- Workspace URLs are canonicalized from a resolved localized base route and query state. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <header class="z-2 p-4 border-b border-b-border-subtle bg-snow-raised">
    <div class="heading-row flex gap-[0.7rem] items-baseline justify-between">
      <h2 class="m-0 font-display text-[1.25rem] font-[650]">{activeQueueLabel}</h2>
      <span class="flex-none text-[0.78rem] text-basalt-muted"
        >{copy['moderation.workspace.openCount'].replace('{count}', String(activeCount))}</span
      >
    </div>
    <nav
      class="filters grid grid-cols-3 gap-[0.35rem] mt-3"
      aria-label={copy['moderation.workspace.filter.label']}
    >
      {#each moderationFilterIds as filter (filter)}
        <!-- .active and aria-current="page" are driven by the same expression, so the selected
             look rides the ARIA state rather than a class-only variant. -->
        <a
          class="px-[0.3rem] py-[0.42rem] border border-border-subtle rounded-control text-[0.72rem] font-extrabold text-center text-basalt no-underline aria-[current=page]:border-basalt aria-[current=page]:bg-signal"
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

  <div
    class="items min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
    data-work-list-scroll
  >
    {#if errorMessage}
      <Notice tone="error" class="error" role="alert">
        <strong>{copy['moderation.workspace.errorTitle']}</strong>
        <p class="m-0 mt-[0.3rem] leading-[1.4] text-basalt-muted">{errorMessage}</p>
        <a
          class="inline-block mt-[0.7rem] font-extrabold text-fjord"
          href={buildModerationWorkspaceHref(baseHref, {
            queue: activeQueueId,
            filters,
            cursor,
            cursorTrail
          })}>{copy['moderation.workspace.retry']}</a
        >
      </Notice>
    {:else if items.length === 0}
      <div class="empty m-4 p-4 border border-basalt rounded-panel bg-success-soft">
        <h3 class="m-0">{copy['moderation.workspace.emptyTitle']}</h3>
        <p class="m-0 mt-[0.3rem] leading-[1.4] text-basalt-muted">
          {copy['moderation.workspace.emptyBody']}
        </p>
      </div>
    {:else}
      <ul class="m-0 p-0 list-none">
        {#each items as item (item.id)}
          <li class="not-first:border-t not-first:border-t-border-subtle">
            <!-- .selected and aria-current="true" are driven by the same expression, so the
                 selected look rides the ARIA state rather than a class-only variant. -->
            <a
              class="grid gap-[0.28rem] pt-[0.85rem] pr-4 pb-[0.85rem] pl-[0.65rem] border-l-[0.4rem] border-l-transparent bg-snow-raised text-basalt no-underline hover:bg-signal-soft aria-[current=true]:border-l-signal aria-[current=true]:bg-signal-soft"
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
              <span class="item-top flex min-w-0 gap-2 items-center justify-between">
                <strong class="min-w-0 wrap-anywhere">{item.title}</strong>
                <Status tone={item.priority ? 'error' : undefined} class="badge"
                  >{item.statusLabel}</Status
                >
              </span>
              {#if item.priorityLabel}
                <Status tone="success" class="priority-signal">
                  <svg
                    class="w-[0.9rem] h-[0.9rem] stroke-current [stroke-width:1.9] [stroke-linecap:round] [stroke-linejoin:round]"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3c2.5 2 5 2.5 7.5 3v5c0 5-3.1 8.2-7.5 10-4.4-1.8-7.5-5-7.5-10V6C7 5.5 9.5 5 12 3Z"
                    />
                    <path d="m8.7 11.8 2.1 2.1 4.6-4.7" />
                  </svg>
                  {item.priorityLabel}
                </Status>
              {/if}
              <span class="summary text-[0.76rem] leading-[1.35] text-basalt-muted"
                >{item.summary}</span
              >
              <span class="meta text-[0.76rem] leading-[1.35] text-basalt-muted">{item.meta}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if pendingPhotoPlaces.length > 0}
      <section
        class="pending-photos m-4 p-[0.8rem] border border-border-subtle rounded-panel bg-snow"
        data-pending-photos
      >
        <h3 class="m-0 text-[0.78rem] font-extrabold tracking-[0.06em] uppercase">
          {copy['moderation.workspace.pendingPhotos.title']}
        </h3>
        <p class="m-0 mt-[0.3rem] text-[0.72rem] leading-[1.4] text-basalt-muted">
          {copy['moderation.workspace.pendingPhotos.help']}
        </p>
        <ul class="grid gap-[0.3rem] m-0 mt-[0.6rem] p-0 list-none">
          {#each pendingPhotoPlaces as place (place.placeId)}
            <li class="not-first:pt-[0.3rem] not-first:border-t not-first:border-t-border-subtle">
              <!-- The link's whole text is its accessible name, so the count a Moderator reads is
                   the count a speech-input user says (WCAG 2.5.3). -->
              <!-- The transparent 0.4rem left border and the raised background are inherited from
                   the `li > a` rule the work items also matched, so they are pinned here too. -->
              <a
                class="grid gap-[0.15rem] px-[0.35rem] py-[0.3rem] border-l-[0.4rem] border-l-transparent rounded-control bg-snow-raised text-[0.76rem] text-basalt no-underline hover:bg-signal-soft"
                href={place.href}
                data-pending-photo-place={place.placeId}
              >
                <strong class="wrap-anywhere underline">{place.title}</strong>
                <span class="text-[0.72rem] text-basalt-muted">{place.meta}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
  {#if !errorMessage && (hasPrevious || nextCursor)}
    <nav
      class="pagination flex gap-[0.6rem] justify-between px-4 py-3 border-t border-t-border-subtle"
      aria-label={copy['moderation.workspace.paginationLabel']}
    >
      {#if hasPrevious}
        <a
          class="text-[0.78rem] font-extrabold text-fjord last:ml-auto"
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
          class="text-[0.78rem] font-extrabold text-fjord last:ml-auto"
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
  /* Notice renders its element in a child component, so scoped CSS cannot reach it directly -
     anchored through .work-list (locally authored) with :global() on the Notice-rendered class,
     per the ancestor-scoped-:global pattern (FavouriteControl.svelte). Notice's error tone now
     owns the border/background colour; only the leftover margin survives here. */
  .work-list :global(.error) {
    margin: 1rem;
  }
</style>
