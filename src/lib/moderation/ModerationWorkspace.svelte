<script lang="ts">
  import { Notice, Status } from '@hundavaent/design-system';
  import type { MessageKey } from '$i18n';

  import ModerationActionBar from './ModerationActionBar.svelte';
  import ModerationQueueRail from './ModerationQueueRail.svelte';
  import ModerationWorkList from './ModerationWorkList.svelte';
  import {
    buildModerationWorkspaceHref,
    type ModerationQueueId,
    type ModerationWorkspaceProps
  } from './types';

  let {
    copy,
    baseHref,
    queues,
    activeQueueId,
    items,
    selectedItemId,
    filters,
    cursor,
    cursorTrail,
    nextCursor,
    hasPrevious,
    pendingPhotoPlaces = [],
    statusMessage = '',
    errorMessage = null,
    reviewErrorMessage = null,
    actionsDisabled = false,
    reviewDisabled = false,
    showDecisionDock = true,
    decisionHint = null,
    focusTargetId = null,
    reviewContent,
    decisionContent
  }: ModerationWorkspaceProps = $props();

  const queueKeys: Record<ModerationQueueId, MessageKey> = {
    suggestions: 'moderation.workspace.queue.suggestions',
    'corrections-and-reports': 'moderation.workspace.queue.correctionsAndReports',
    'candidate-places': 'moderation.workspace.queue.candidatePlaces'
  };

  const activeQueue = $derived(queues.find((queue) => queue.id === activeQueueId));
  const selectedItem = $derived(items.find((item) => item.id === selectedItemId) ?? null);
  const selectedItemIndex = $derived(items.findIndex((item) => item.id === selectedItemId));
  const nextItemId = $derived(
    selectedItemIndex >= 0 ? (items[selectedItemIndex + 1]?.id ?? null) : null
  );
  const totalCount = $derived(queues.reduce((total, queue) => total + queue.count, 0));
  const retryHref = $derived(
    buildModerationWorkspaceHref(baseHref, {
      queue: activeQueueId,
      itemId: selectedItemId,
      filters,
      cursor,
      cursorTrail
    })
  );
  let workspaceElement: HTMLElement;

  $effect(() => {
    if (!workspaceElement) return;
    synchronizeWorkspaceForms(workspaceElement, {
      cursor,
      cursorTrail,
      nextItemId,
      nextCursor,
      filter: filters[0] ?? 'actionable'
    });
  });

  $effect(() => {
    if (!statusMessage || !selectedItemId) return;
    queueMicrotask(() => {
      const continuationTarget = focusTargetId
        ? document
            .getElementById(focusTargetId)
            ?.querySelector<HTMLElement>(
              'select:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), button:not(:disabled)'
            )
        : null;
      const queueTarget = workspaceElement?.querySelector<HTMLElement>(
        `[data-work-item-id="${selectedItemId}"]`
      );
      (continuationTarget ?? queueTarget)?.focus();
    });
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTypingTarget(event.target)
    ) {
      return;
    }

    const direction = event.key.toLowerCase();
    if (direction !== 'j' && direction !== 'k') return;

    const targetIndex = selectedItemIndex + (direction === 'j' ? 1 : -1);
    const itemTarget = workspaceElement?.querySelector<HTMLAnchorElement>(
      `[data-work-item-id="${items[targetIndex]?.id ?? ''}"]`
    );
    const pageTarget = workspaceElement?.querySelector<HTMLAnchorElement>(
      direction === 'j' ? '[data-work-next-page]' : '[data-work-previous-page]'
    );
    const target = itemTarget ?? pageTarget;
    if (!target) return;

    event.preventDefault();
    target.click();
  }

  function handleSubmit(event: SubmitEvent): void {
    if (!(event.target instanceof HTMLFormElement)) return;
    synchronizeForm(event.target, {
      cursor,
      cursorTrail,
      nextItemId,
      nextCursor,
      filter: filters[0] ?? 'actionable'
    });
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target.matches('input, textarea, select, button, [role="textbox"]')
    );
  }

  function synchronizeWorkspaceForms(
    workspace: HTMLElement,
    context: {
      cursor: string | null;
      cursorTrail: readonly (string | null)[];
      nextItemId: string | null;
      nextCursor: string | null;
      filter: string;
    }
  ): void {
    for (const form of workspace.querySelectorAll<HTMLFormElement>('form[method="POST" i]')) {
      synchronizeForm(form, context);
    }
  }

  function synchronizeForm(
    form: HTMLFormElement,
    context: {
      cursor: string | null;
      cursorTrail: readonly (string | null)[];
      nextItemId: string | null;
      nextCursor: string | null;
      filter: string;
    }
  ): void {
    form.querySelectorAll('[data-workspace-context]').forEach((input) => input.remove());
    appendWorkspaceInput(form, 'workspaceCursor', context.cursor);
    for (const previousCursor of context.cursorTrail) {
      appendWorkspaceInput(form, 'workspaceBack', previousCursor ?? 'first');
    }
    appendWorkspaceInput(form, 'workspaceNextItemId', context.nextItemId);
    appendWorkspaceInput(form, 'workspaceNextCursor', context.nextCursor);
    appendWorkspaceInput(form, 'workspaceFilter', context.filter);
  }

  function appendWorkspaceInput(form: HTMLFormElement, name: string, value: string | null): void {
    if (!value) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    input.dataset.workspaceContext = '';
    form.append(input);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Of Panel's surface set this shell keeps only the raised background: the border colour
     (basalt, not Panel's subtle default), radius (shell, not panel), and shadow are call-site
     overrides that Panel's own class-prop contract explicitly does not support ("overriding the
     surface set through this is unsupported"). The one live utility rides directly on this
     locally-authored element rather than a <Panel> wrapper so the scoped .workspace rule below
     keeps matching without needing :global() (the SelectedPlaceCard precedent). -->
<section
  class="workspace grid h-[calc(100dvh_-_var(--hv-app-header-height,_4.4rem)_-_1rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-basalt rounded-shell bg-snow-raised shadow-raised max-[44rem]:h-[calc(100dvh_-_var(--hv-app-header-height,_4.4rem)_-_0.8rem)] max-[44rem]:min-h-0 max-[44rem]:rounded-shell max-[44rem]:shadow-raised"
  aria-labelledby="moderation-workspace-title"
  data-moderation-workspace
  bind:this={workspaceElement}
  onsubmitcapture={handleSubmit}
>
  <header
    class="workspace-top flex gap-4 items-center justify-between px-[1.1rem] py-[0.85rem] border-b border-b-basalt bg-basalt text-snow-raised max-[44rem]:items-start max-[28rem]:grid"
  >
    <div>
      <h1 id="moderation-workspace-title" class="m-0 text-[1.2rem] leading-[1.15]">
        {copy['moderation.workspace.title']}
      </h1>
      <p class="m-0 mt-[0.2rem] text-[0.78rem] text-border-subtle">
        {copy['moderation.workspace.meta']}
      </p>
    </div>
    <strong
      class="flex-none px-[0.65rem] py-[0.35rem] border border-signal rounded-control bg-signal text-[0.76rem] text-basalt max-[44rem]:whitespace-nowrap max-[28rem]:w-fit"
      >{copy['moderation.workspace.totalCount'].replace('{count}', String(totalCount))}</strong
    >
  </header>

  <div
    class="workspace-body grid grid-cols-[minmax(11rem,0.7fr)_minmax(15rem,0.95fr)_minmax(24rem,1.55fr)] min-h-0 overflow-hidden max-[60rem]:min-[44.01rem]:grid-cols-[minmax(15rem,0.8fr)_minmax(24rem,1.4fr)] max-[60rem]:min-[44.01rem]:grid-rows-[auto_minmax(0,1fr)] max-[44rem]:grid-cols-[minmax(0,1fr)] max-[44rem]:grid-rows-[auto_minmax(8rem,24dvh)_minmax(0,1fr)] max-[44rem]:min-h-0"
  >
    <ModerationQueueRail {copy} {baseHref} {queues} {activeQueueId} {filters} />
    <ModerationWorkList
      {copy}
      {baseHref}
      {activeQueueId}
      activeQueueLabel={copy[queueKeys[activeQueueId]]}
      activeCount={activeQueue?.count ?? 0}
      {items}
      {selectedItemId}
      {filters}
      {cursor}
      {cursorTrail}
      {nextCursor}
      {hasPrevious}
      {pendingPhotoPlaces}
      {errorMessage}
    />

    <section
      class="review grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-snow max-[44rem]:min-h-0"
      aria-label={copy['moderation.workspace.selectedItemLabel']}
    >
      <header
        class="review-head flex relative gap-4 items-start justify-between px-[1.2rem] py-4 border-b border-b-border-subtle bg-snow-raised max-[44rem]:relative"
      >
        {#if selectedItem}
          <div>
            <p
              class="eyebrow m-0 mb-1 text-[0.68rem] font-extrabold tracking-[0.09em] uppercase text-fjord"
            >
              {copy[queueKeys[activeQueueId]]}
            </p>
            <h2
              class="m-0 font-display text-[clamp(1.35rem,_3vw,_1.65rem)] font-[650] leading-[1.1] wrap-anywhere"
            >
              {selectedItem.title}
            </h2>
            <p class="review-meta m-0 mt-[0.3rem] text-[0.76rem] text-basalt-muted">
              {selectedItem.meta}
            </p>
          </div>
          <span
            class="shortcut flex-none px-[0.42rem] py-[0.28rem] border border-border-subtle rounded-control bg-snow-raised text-[0.67rem] font-extrabold text-basalt-muted max-[44rem]:hidden"
            >{copy['moderation.workspace.shortcut']}</span
          >
        {:else}
          <div>
            <p
              class="eyebrow m-0 mb-1 text-[0.68rem] font-extrabold tracking-[0.09em] uppercase text-fjord"
            >
              {copy[queueKeys[activeQueueId]]}
            </p>
            <h2
              class="m-0 font-display text-[clamp(1.35rem,_3vw,_1.65rem)] font-[650] leading-[1.1] wrap-anywhere"
            >
              {copy['moderation.workspace.noSelectionTitle']}
            </h2>
            <p class="review-meta m-0 mt-[0.3rem] text-[0.76rem] text-basalt-muted">
              {copy['moderation.workspace.noSelectionBody']}
            </p>
          </div>
        {/if}
        <Status tone="success" class="live-status" role="status" aria-live="polite"
          >{statusMessage}</Status
        >
      </header>

      <div
        class="review-scroll min-w-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-[1.2rem] py-4 max-[44rem]:min-h-0"
        data-review-scroll
      >
        {#if reviewErrorMessage}
          <Notice tone="error" class="review-error" role="alert">
            <p class="m-0">{reviewErrorMessage}</p>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- retryHref is assembled from the already-resolved locale-specific moderation base path. -->
            <a class="inline-block mt-2 font-extrabold" href={retryHref}
              >{copy['moderation.workspace.retry']}</a
            >
          </Notice>
        {/if}
        {#if selectedItem}
          <fieldset class="review-content min-w-0 m-0 p-0 border-0" disabled={reviewDisabled}>
            {#if reviewContent}
              {@render reviewContent()}
            {:else}
              <article
                class="review-summary p-[0.9rem] border border-border-subtle rounded-panel bg-snow-raised"
              >
                <span class="text-[0.68rem] font-extrabold tracking-[0.08em] uppercase text-fjord"
                  >{selectedItem.statusLabel}</span
                >
                <p class="m-0 mt-[0.3rem] leading-[1.45]">{selectedItem.summary}</p>
              </article>
            {/if}
          </fieldset>
        {/if}
      </div>

      {#if selectedItem && !errorMessage && showDecisionDock && decisionContent}
        <ModerationActionBar
          label={copy['moderation.workspace.decisionLabel']}
          disabled={actionsDisabled}
          hint={decisionHint}
          children={decisionContent}
        />
      {/if}
    </section>
  </div>
</section>

<style>
  /* The three workspace columns are rendered by child components (ModerationQueueRail,
     ModerationWorkList) as well as locally, so this shared min-size guard stays a cross-component
     hook rather than moving onto each column. */
  .workspace-body > :global(*) {
    min-width: 0;
    min-height: 0;
  }
  /* Status renders its span inside a child component, so Svelte's scoped CSS cannot reach it
     directly - anchored through .review-head with :global() (the FavouriteControl precedent).
     Status's success tone now owns the background/text and its base owns the weight; the
     positioning, radius, and the "collapses away while empty" live-region behaviour (this element
     stays mounted so aria-live keeps announcing future updates, but must render invisible when
     there is nothing to say) survive as call-site character. Status's base border is fixed to
     border-strong regardless of tone, so the border colour is pinned to success here the same way
     FavouriteControl pins .favourite-toggle's selected-state border/background at the call site. */
  .review-head :global(.live-status) {
    position: absolute;
    top: 100%;
    right: 1.2rem;
    left: 1.2rem;
    z-index: 2;
    border-color: var(--hv-color-success);
    border-top: 0;
    border-radius: 0 0 var(--hv-radius-shell) var(--hv-radius-shell);
    padding: 0.5rem 0.7rem;
    font-size: 0.78rem;
  }
  .review-head :global(.live-status:empty) {
    border: 0;
    padding: 0;
  }
  /* Notice renders its element inside a child component, so scoped CSS cannot reach it directly -
     anchored through .review-scroll with :global() (the FavouriteControl precedent). Notice's
     error tone is an exact match for the old border/background pair, so only the margin survives
     as call-site character. */
  .review-scroll :global(.review-error) {
    margin-bottom: 1rem;
  }
  @media (max-width: 60rem) and (min-width: 44.01rem) {
    .workspace-body > :global(nav:first-child) {
      grid-column: 1 / -1;
    }
  }
</style>
