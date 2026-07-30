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
  class="workspace bg-snow-raised"
  aria-labelledby="moderation-workspace-title"
  data-moderation-workspace
  bind:this={workspaceElement}
  onsubmitcapture={handleSubmit}
>
  <header class="workspace-top">
    <div>
      <h1 id="moderation-workspace-title">{copy['moderation.workspace.title']}</h1>
      <p>{copy['moderation.workspace.meta']}</p>
    </div>
    <strong>{copy['moderation.workspace.totalCount'].replace('{count}', String(totalCount))}</strong
    >
  </header>

  <div class="workspace-body">
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

    <section class="review" aria-label={copy['moderation.workspace.selectedItemLabel']}>
      <header class="review-head">
        {#if selectedItem}
          <div>
            <p class="eyebrow">{copy[queueKeys[activeQueueId]]}</p>
            <h2>{selectedItem.title}</h2>
            <p class="review-meta">{selectedItem.meta}</p>
          </div>
          <span class="shortcut">{copy['moderation.workspace.shortcut']}</span>
        {:else}
          <div>
            <p class="eyebrow">{copy[queueKeys[activeQueueId]]}</p>
            <h2>{copy['moderation.workspace.noSelectionTitle']}</h2>
            <p class="review-meta">{copy['moderation.workspace.noSelectionBody']}</p>
          </div>
        {/if}
        <Status tone="success" class="live-status" role="status" aria-live="polite"
          >{statusMessage}</Status
        >
      </header>

      <div class="review-scroll" data-review-scroll>
        {#if reviewErrorMessage}
          <Notice tone="error" class="review-error" role="alert">
            <p>{reviewErrorMessage}</p>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- retryHref is assembled from the already-resolved locale-specific moderation base path. -->
            <a href={retryHref}>{copy['moderation.workspace.retry']}</a>
          </Notice>
        {/if}
        {#if selectedItem}
          <fieldset class="review-content" disabled={reviewDisabled}>
            {#if reviewContent}
              {@render reviewContent()}
            {:else}
              <article class="review-summary">
                <span>{selectedItem.statusLabel}</span>
                <p>{selectedItem.summary}</p>
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
  .workspace {
    display: grid;
    height: calc(100dvh - var(--hv-app-header-height, 4.4rem) - 1rem);
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-shell);
    box-shadow: var(--hv-shadow-raised);
  }
  .workspace-top {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--hv-color-basalt);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    padding: 0.85rem 1.1rem;
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  h1 {
    font-size: 1.2rem;
    line-height: 1.15;
  }
  .workspace-top p {
    margin-top: 0.2rem;
    color: var(--hv-border-subtle);
    font-size: 0.78rem;
  }
  .workspace-top strong {
    flex: none;
    border: 1px solid var(--hv-color-signal);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    padding: 0.35rem 0.65rem;
    font-size: 0.76rem;
  }
  .workspace-body {
    display: grid;
    grid-template-columns: minmax(11rem, 0.7fr) minmax(15rem, 0.95fr) minmax(24rem, 1.55fr);
    min-height: 0;
    overflow: hidden;
  }
  .workspace-body > :global(*) {
    min-width: 0;
    min-height: 0;
  }
  .review {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--hv-color-snow);
  }
  .review-head {
    display: flex;
    position: relative;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
    border-bottom: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
    padding: 1rem 1.2rem;
  }
  .review-head h2 {
    font-family: var(--hv-font-display);
    font-weight: 650;
    font-size: clamp(1.35rem, 3vw, 1.65rem);
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .eyebrow {
    margin-bottom: 0.25rem;
    color: var(--hv-color-fjord);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  .review-meta {
    margin-top: 0.3rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.76rem;
  }
  .shortcut {
    flex: none;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.28rem 0.42rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.67rem;
    font-weight: 800;
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
  .review-scroll {
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: 1rem 1.2rem;
  }
  .review-summary {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    padding: 0.9rem;
  }
  .review-content {
    min-width: 0;
    margin: 0;
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
  .review-scroll :global(.review-error a) {
    display: inline-block;
    margin-top: 0.5rem;
    font-weight: 800;
  }
  .review-summary span {
    color: var(--hv-color-fjord);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .review-summary p {
    margin-top: 0.3rem;
    line-height: 1.45;
  }
  @media (max-width: 60rem) and (min-width: 44.01rem) {
    .workspace-body {
      grid-template-columns: minmax(15rem, 0.8fr) minmax(24rem, 1.4fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .workspace-body > :global(nav:first-child) {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 44rem) {
    .workspace {
      height: calc(100dvh - var(--hv-app-header-height, 4.4rem) - 0.8rem);
      min-height: 0;
      border-radius: var(--hv-radius-shell);
      box-shadow: var(--hv-shadow-raised);
    }
    .workspace-top {
      align-items: start;
    }
    .workspace-top strong {
      white-space: nowrap;
    }
    .workspace-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(8rem, 24dvh) minmax(0, 1fr);
      min-height: 0;
    }
    .review {
      min-height: 0;
    }
    .review-head {
      position: relative;
    }
    .review-scroll {
      min-height: 0;
    }
    .shortcut {
      display: none;
    }
  }
  @media (max-width: 28rem) {
    .workspace-top {
      display: grid;
    }
    .workspace-top strong {
      width: fit-content;
    }
  }
</style>
