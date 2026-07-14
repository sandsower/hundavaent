<script lang="ts">
  import type { MessageKey } from '$i18n';

  import ModerationDecisionDock from './ModerationDecisionDock.svelte';
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
    statusMessage = '',
    errorMessage = null,
    reviewErrorMessage = null,
    actionsDisabled = false,
    showDecisionDock = true,
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
      nextCursor
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
    synchronizeForm(event.target, { cursor, cursorTrail, nextItemId, nextCursor });
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
    }
  ): void {
    form.querySelectorAll('[data-workspace-context]').forEach((input) => input.remove());
    appendWorkspaceInput(form, 'workspaceCursor', context.cursor);
    for (const previousCursor of context.cursorTrail) {
      appendWorkspaceInput(form, 'workspaceBack', previousCursor ?? 'first');
    }
    appendWorkspaceInput(form, 'workspaceNextItemId', context.nextItemId);
    appendWorkspaceInput(form, 'workspaceNextCursor', context.nextCursor);
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

<section
  class="workspace"
  aria-labelledby="moderation-workspace-title"
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
        <p class="live-status" role="status" aria-live="polite">{statusMessage}</p>
      </header>

      <div class="review-scroll">
        {#if reviewErrorMessage}
          <div class="review-error" role="alert">
            <p>{reviewErrorMessage}</p>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- retryHref is assembled from the already-resolved locale-specific moderation base path. -->
            <a href={retryHref}>{copy['moderation.workspace.retry']}</a>
          </div>
        {/if}
        {#if selectedItem}
          <fieldset class="review-content" disabled={actionsDisabled}>
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
        <ModerationDecisionDock
          label={copy['moderation.workspace.decisionLabel']}
          disabled={actionsDisabled}
          children={decisionContent}
        />
      {/if}
    </section>
  </div>
</section>

<style>
  .workspace {
    overflow: hidden;
    border: 3px solid var(--ink);
    border-radius: 1.5rem;
    background: var(--paper-light);
    box-shadow: 0.5rem 0.55rem 0 var(--teal);
  }
  .workspace-top {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid var(--ink);
    background: var(--mint);
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
    color: var(--ink-soft);
    font-size: 0.78rem;
  }
  .workspace-top strong {
    flex: none;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--paper-light);
    padding: 0.35rem 0.65rem;
    font-size: 0.76rem;
  }
  .workspace-body {
    display: grid;
    grid-template-columns: minmax(11rem, 0.7fr) minmax(15rem, 0.95fr) minmax(24rem, 1.55fr);
    min-height: 40rem;
  }
  .workspace-body > :global(*) {
    min-width: 0;
  }
  .review {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--paper);
  }
  .review-head {
    display: flex;
    position: relative;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
    border-bottom: 1px solid rgb(25 59 69 / 28%);
    background: var(--paper-light);
    padding: 1rem 1.2rem;
  }
  .review-head h2 {
    font-size: clamp(1.35rem, 3vw, 1.65rem);
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .eyebrow {
    margin-bottom: 0.25rem;
    color: var(--coral-dark);
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  .review-meta {
    margin-top: 0.3rem;
    color: var(--ink-soft);
    font-size: 0.76rem;
  }
  .shortcut {
    flex: none;
    border: 1px solid rgb(25 59 69 / 38%);
    border-radius: 0.5rem;
    background: white;
    padding: 0.28rem 0.42rem;
    color: var(--ink-soft);
    font-size: 0.67rem;
    font-weight: 800;
  }
  .live-status {
    position: absolute;
    top: 100%;
    right: 1.2rem;
    left: 1.2rem;
    z-index: 2;
    border-radius: 0 0 0.65rem 0.65rem;
    background: var(--mint);
    font-size: 0.78rem;
    font-weight: 850;
  }
  .live-status:not(:empty) {
    border: 2px solid var(--ink);
    border-top: 0;
    padding: 0.5rem 0.7rem;
  }
  .review-scroll {
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 1rem 1.2rem;
  }
  .review-summary {
    border: 1.5px solid var(--ink);
    border-radius: 0.85rem;
    background: white;
    padding: 0.9rem;
  }
  .review-content {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .review-error {
    margin-bottom: 1rem;
    border: 2px solid var(--ink);
    border-radius: 0.75rem;
    background: var(--coral-light);
    padding: 0.75rem;
  }
  .review-error a {
    display: inline-block;
    margin-top: 0.5rem;
    font-weight: 900;
  }
  .review-summary span {
    color: var(--coral-dark);
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .review-summary p {
    margin-top: 0.3rem;
    line-height: 1.45;
  }
  @media (max-width: 60rem) and (min-width: 44.01rem) {
    .workspace-body {
      grid-template-columns: 11rem 15rem minmax(23rem, 1fr);
      overflow-x: auto;
    }
  }
  @media (max-width: 44rem) {
    .workspace {
      overflow: visible;
      border-radius: 1rem;
      box-shadow: 0.3rem 0.35rem 0 var(--teal);
    }
    .workspace-top {
      align-items: start;
    }
    .workspace-top strong {
      white-space: nowrap;
    }
    .workspace-body {
      display: block;
      min-height: 0;
    }
    .review {
      display: block;
      min-height: 30rem;
      overflow: visible;
    }
    .review-head {
      position: relative;
    }
    .review-scroll {
      min-height: 18rem;
      overflow: visible;
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
