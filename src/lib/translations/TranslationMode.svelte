<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';

  import type { Locale } from '$i18n/locale';
  import type {
    TranslationAccess,
    TranslationApprovedHistory,
    TranslationPackage,
    TranslationPackageEntry,
    TranslationReviewSummary,
    TranslationWorkspace
  } from '$server/translations/packages';
  import { validateTranslationEntry } from './placeholders';
  import { createTranslationResolver, normalizeVisibleCopy } from './in-context-resolver';

  interface Props {
    active: boolean;
    locale: Locale;
    pageId: string;
    contextPath: string;
    access: TranslationAccess;
  }

  interface ContextPayload {
    workspace: TranslationWorkspace;
    selectedPackage: TranslationPackage | null;
    reviewQueue: TranslationReviewSummary[];
    catalogues: Record<Locale, Record<string, string>>;
  }

  interface Occurrence {
    id: string;
    element: HTMLElement;
    keys: string[];
    label: string;
    left: number;
    top: number;
    status: 'untouched' | 'draft' | 'approved';
  }

  let { active, locale, pageId, contextPath, access }: Props = $props();
  let workspace = $state<TranslationWorkspace | null>(null);
  let catalogues = $state<Record<Locale, Record<string, string>> | null>(null);
  let reviewQueue = $state<TranslationReviewSummary[]>([]);
  let reviewPackage = $state<TranslationPackage | null>(null);
  let occurrences = $state.raw<Occurrence[]>([]);
  let selectedKey = $state<string | null>(null);
  let candidateKeys = $state<string[]>([]);
  let valueIs = $state('');
  let valueEn = $state('');
  let entryVersion = $state(0);
  let interactionMode = $state<'edit' | 'browse'>('edit');
  let saveState = $state<'idle' | 'unsaved' | 'saving' | 'saved' | 'failed' | 'conflict'>('idle');
  let problem = $state<string | null>(null);
  let loading = $state(false);
  let showReview = $state(false);
  let reviewNote = $state('');
  let saveTimer: number | undefined;
  let scanTimer: number | undefined;
  let observer: MutationObserver | null = null;
  let occurrenceCounter = 0;

  const selectedEntry = $derived(
    selectedKey
      ? (workspace?.activePackage?.entries.find((entry) => entry.key === selectedKey) ?? null)
      : null
  );
  const selectedHistory = $derived(
    selectedKey
      ? (workspace?.approvedHistory.find((history) => history.key === selectedKey) ?? null)
      : null
  );
  const validationProblems = $derived(
    selectedKey ? validateTranslationEntry(selectedKey, valueIs, valueEn) : []
  );
  const activePackageHere = $derived(
    workspace?.activePackage?.pageId === pageId ? workspace.activePackage : null
  );
  const activePackageElsewhere = $derived(
    workspace?.activePackage && workspace.activePackage.pageId !== pageId
      ? workspace.activePackage
      : null
  );
  const selectionHasPendingSave = $derived(saveState !== 'idle' && saveState !== 'saved');
  const packageReadyToSubmit = $derived(
    Boolean(
      activePackageHere &&
      activePackageHere.entries.length > 0 &&
      activePackageHere.entries.every((entry) => entry.complete) &&
      !selectionHasPendingSave
    )
  );

  $effect(() => {
    if (!active) return;
    void loadContext();
    const onViewportChange = () => positionOccurrences();
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('click', interceptProductClick, true);
    observer = new MutationObserver((mutations) => {
      if (
        mutations.every(
          (mutation) =>
            mutation.target instanceof Element &&
            mutation.target.closest('[data-translation-ui]') !== null
        )
      ) {
        return;
      }
      scheduleScan();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'alt', 'placeholder', 'title', 'data-translation-key']
    });
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('click', interceptProductClick, true);
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    };
  });

  async function loadContext(packageId?: string): Promise<void> {
    loading = true;
    problem = null;
    const query = new URLSearchParams({ pageId });
    if (packageId) query.set('packageId', packageId);
    try {
      const response = await fetch(`/api/translations/context?${query}`);
      if (!response.ok) throw new Error('Translation workspace could not be loaded.');
      const payload = (await response.json()) as ContextPayload;
      workspace = payload.workspace;
      catalogues = payload.catalogues;
      reviewQueue = payload.reviewQueue;
      reviewPackage = payload.selectedPackage;
      scheduleScan();
    } catch {
      problem = 'Translation mode is temporarily unavailable.';
    } finally {
      loading = false;
    }
  }

  function scheduleScan(): void {
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, 20);
  }

  function scanPage(): void {
    if (!catalogues) return;
    const resolver = createTranslationResolver(catalogues, locale);
    const next: Occurrence[] = [];
    const seen: Array<{ element: HTMLElement; signatures: string[] }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const element = node.parentElement;
      const value = node.nodeValue ?? '';
      if (!element || !normalizeVisibleCopy(value) || excludedElement(element)) continue;
      addOccurrence(
        element,
        value,
        element.closest<HTMLElement>('[data-translation-key]')?.dataset.translationKey
      );
    }

    for (const element of document.querySelectorAll<HTMLElement>(
      '[aria-label], [alt], [placeholder], [title], [data-translation-key]'
    )) {
      if (excludedElement(element)) continue;
      const explicitKey = element.dataset.translationKey;
      const values = [
        element.getAttribute('aria-label'),
        element.getAttribute('alt'),
        element.getAttribute('placeholder'),
        element.getAttribute('title')
      ].filter((value): value is string => Boolean(value));
      if (explicitKey && values.length === 0) values.push(element.textContent ?? '');
      for (const value of values) addOccurrence(element, value, explicitKey);
    }

    occurrences = next;

    function addOccurrence(element: HTMLElement, rawValue: string, explicitKey?: string): void {
      if (!isVisible(element)) return;
      const result = resolver.resolve(rawValue, explicitKey);
      if (result.kind === 'none') return;
      const signature = result.keys.join('|');
      const elementSeen = seen.find((candidate) => candidate.element === element);
      if (elementSeen?.signatures.includes(signature)) return;
      if (elementSeen) elementSeen.signatures.push(signature);
      else seen.push({ element, signatures: [signature] });
      const rect = element.getBoundingClientRect();
      next.push({
        id: `translation-occurrence-${++occurrenceCounter}`,
        element,
        keys: result.keys,
        label: normalizeVisibleCopy(rawValue).slice(0, 120),
        left: Math.min(window.innerWidth - 24, Math.max(2, rect.right - 12)),
        top: Math.max(2, rect.top - 7),
        status: occurrenceStatus(result.keys)
      });
    }
  }

  function positionOccurrences(): void {
    occurrences = occurrences
      .filter(({ element }) => element.isConnected && isVisible(element))
      .map((occurrence) => {
        const rect = occurrence.element.getBoundingClientRect();
        return {
          ...occurrence,
          left: Math.min(window.innerWidth - 24, Math.max(2, rect.right - 12)),
          top: Math.max(2, rect.top - 7)
        };
      });
  }

  function excludedElement(element: HTMLElement): boolean {
    return (
      element.closest('[data-translation-ui]') !== null ||
      element.closest('script, style, noscript, [contenteditable="true"]') !== null
    );
  }

  function isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    );
  }

  function occurrenceStatus(keys: string[]): Occurrence['status'] {
    if (workspace?.activePackage?.entries.some((entry) => keys.includes(entry.key))) return 'draft';
    if (workspace?.approvedHistory.some((history) => keys.includes(history.key))) return 'approved';
    return 'untouched';
  }

  function selectOccurrence(occurrence: Occurrence): void {
    if (selectionHasPendingSave) {
      problem = 'Keep this translation open until autosave finishes.';
      return;
    }
    if (occurrence.keys.length === 1) selectKey(occurrence.keys[0]);
    else {
      selectedKey = null;
      candidateKeys = occurrence.keys;
    }
  }

  function selectKey(key: string): void {
    if (!catalogues) return;
    selectedKey = key;
    candidateKeys = [];
    const entry = workspace?.activePackage?.entries.find((candidate) => candidate.key === key);
    valueIs = entry?.draft.is ?? catalogues.is[key] ?? '';
    valueEn = entry?.draft.en ?? catalogues.en[key] ?? '';
    entryVersion = entry?.version ?? 0;
    saveState = 'idle';
    problem = null;
  }

  function interceptProductClick(event: MouseEvent): void {
    if (interactionMode !== 'edit' || !active || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-translation-ui]')) return;
    const occurrence = occurrences.find(
      ({ element }) => element === target || element.contains(target)
    );
    if (!occurrence) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectOccurrence(occurrence);
  }

  function queueSave(): void {
    saveState = 'unsaved';
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveSelected(), 700);
  }

  async function saveSelected(): Promise<void> {
    if (!selectedKey || !workspace || !catalogues || activePackageElsewhere) return;
    saveState = 'saving';
    problem = null;
    try {
      let packageValue = activePackageHere;
      if (!packageValue) {
        const startResponse = await mutation({
          action: 'start',
          pageId,
          contextPath,
          requestId: crypto.randomUUID()
        });
        packageValue = startResponse.package;
        workspace = { ...workspace, activePackage: packageValue };
      }

      const response = await fetch('/api/translations/context', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: packageValue.id,
          key: selectedKey,
          valueIs,
          valueEn,
          expectedEntryVersion: entryVersion,
          requestId: crypto.randomUUID()
        })
      });
      if (response.status === 409) {
        saveState = 'conflict';
        return;
      }
      if (!response.ok) throw new Error('save failed');
      const { entry } = (await response.json()) as {
        entry: {
          entryVersion: number;
          packageVersion: number;
          changed: boolean;
          changedBy: string;
          changedAt: string;
        };
      };
      entryVersion = entry.entryVersion;
      const existingEntries = packageValue.entries.filter(
        (candidate) => candidate.key !== selectedKey
      );
      const nextEntries: TranslationPackageEntry[] = entry.changed
        ? [
            ...existingEntries,
            {
              key: selectedKey,
              baseline: { is: catalogues.is[selectedKey], en: catalogues.en[selectedKey] },
              draft: { is: valueIs, en: valueEn },
              version: entry.entryVersion,
              changedBy: entry.changedBy,
              changedAt: entry.changedAt,
              complete: validationProblems.length === 0
            }
          ]
        : existingEntries;
      workspace = {
        ...workspace,
        activePackage: {
          ...packageValue,
          version: entry.packageVersion,
          entries: nextEntries
        }
      };
      saveState = 'saved';
      scheduleScan();
    } catch {
      saveState = 'failed';
    }
  }

  async function submitPackage(): Promise<void> {
    const packageValue = activePackageHere;
    if (!packageValue || !packageReadyToSubmit || validationProblems.length > 0) return;
    try {
      const response = await mutation({
        action: 'submit',
        packageId: packageValue.id,
        expectedPackageVersion: packageValue.version,
        requestId: crypto.randomUUID()
      });
      workspace = { ...workspace!, activePackage: null };
      selectedKey = null;
      await loadContext();
      problem = `Package for ${response.package.pageId} submitted for review.`;
    } catch {
      problem = 'The package changed. Reload translation mode and try again.';
    }
  }

  async function discardPackage(): Promise<void> {
    const packageValue = activePackageHere;
    if (!packageValue) return;
    try {
      await mutation({
        action: 'discard',
        packageId: packageValue.id,
        expectedPackageVersion: packageValue.version,
        requestId: crypto.randomUUID()
      });
      workspace = { ...workspace!, activePackage: null };
      selectedKey = null;
      scheduleScan();
    } catch {
      problem = 'The draft could not be discarded.';
    }
  }

  async function openReview(packageId: string): Promise<void> {
    showReview = true;
    await loadContext(packageId);
  }

  async function decideReview(decision: 'return' | 'approve'): Promise<void> {
    if (!reviewPackage) return;
    try {
      await mutation({
        action: decision,
        packageId: reviewPackage.id,
        expectedPackageVersion: reviewPackage.version,
        requestId: crypto.randomUUID(),
        ...(decision === 'return' ? { note: reviewNote } : {})
      });
      reviewPackage = null;
      reviewNote = '';
      await loadContext();
      showReview = true;
    } catch {
      problem = 'The review decision could not be saved.';
    }
  }

  async function mutation(body: Record<string, unknown>): Promise<{ package: TranslationPackage }> {
    const response = await fetch('/api/translations/context', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('translation mutation failed');
    return (await response.json()) as { package: TranslationPackage };
  }

  async function setTranslationMode(nextActive: boolean): Promise<void> {
    const response = await fetch('/api/translations/mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: nextActive })
    });
    if (!response.ok) {
      problem = 'Translation mode could not be changed.';
      return;
    }
    await invalidateAll();
  }

  function statusLabel(
    entry: TranslationPackageEntry | null,
    history: TranslationApprovedHistory | null
  ): string {
    if (entry) return 'Draft changed';
    if (history) return 'Approved history';
    return 'Untouched';
  }
</script>

<div data-translation-ui class="translation-ui" data-active={active}>
  {#if !active}
    <button class="launcher" type="button" onclick={() => void setTranslationMode(true)}>
      Translate this page
    </button>
  {:else}
    {#each occurrences as occurrence (occurrence.id)}
      <button
        class="marker"
        class:marker-draft={occurrence.status === 'draft'}
        class:marker-approved={occurrence.status === 'approved'}
        style={`left:${occurrence.left}px;top:${occurrence.top}px`}
        type="button"
        aria-label={occurrence.keys.length === 1
          ? `Edit translation: ${occurrence.keys[0]}`
          : `Choose translation key for: ${occurrence.label}`}
        title={occurrence.keys.length === 1 ? occurrence.keys[0] : 'Choose translation key'}
        onclick={() => selectOccurrence(occurrence)}><span></span></button
      >
    {/each}

    <div class="toolbar" role="toolbar" aria-label="Translation mode">
      <strong>Translation mode</strong>
      <button
        type="button"
        class:active-tool={interactionMode === 'edit'}
        onclick={() => (interactionMode = interactionMode === 'edit' ? 'browse' : 'edit')}
        >{interactionMode === 'edit' ? 'Browse page' : 'Edit copy'}</button
      >
      {#if access.canReview}
        <button type="button" onclick={() => (showReview = !showReview)}>
          Review packages ({reviewQueue.length})
        </button>
      {/if}
      {#if activePackageHere}
        <span>{activePackageHere.entries.length} changed</span>
      {/if}
      <button type="button" onclick={() => void setTranslationMode(false)}>Exit</button>
    </div>

    {#if candidateKeys.length > 0}
      <aside class="panel" aria-label="Choose translation key">
        <header>
          <p class="eyebrow">Possible bundle keys</p>
          <h2>Choose the matching key</h2>
          <button
            type="button"
            aria-label="Close translation panel"
            onclick={() => (candidateKeys = [])}>×</button
          >
        </header>
        <div class="panel-body key-choices">
          {#each candidateKeys as key (key)}
            <button type="button" onclick={() => selectKey(key)}>{key}</button>
          {/each}
        </div>
      </aside>
    {:else if selectedKey && catalogues}
      <aside class="panel" aria-labelledby="translation-panel-title">
        <header>
          <div>
            <p class="eyebrow">{statusLabel(selectedEntry, selectedHistory)}</p>
            <h2 id="translation-panel-title">{selectedKey}</h2>
          </div>
          <button
            type="button"
            aria-label="Close translation panel"
            disabled={selectionHasPendingSave}
            onclick={() => (selectedKey = null)}>×</button
          >
        </header>
        <div class="panel-body">
          {#if activePackageElsewhere}
            <div class="notice" role="status">
              Your editable draft belongs to {activePackageElsewhere.pageId}. Open
              <a href={resolve(activePackageElsewhere.contextPath as `/${string}`)}>that page</a> to continue.
            </div>
          {/if}
          {#if workspace?.activePackage?.status === 'revision_requested' && workspace.activePackage.reviewNote}
            <div class="notice attention">
              <strong>Returned for revision</strong>
              <p>{workspace.activePackage.reviewNote}</p>
            </div>
          {/if}
          <label>
            <span>Icelandic</span>
            <textarea
              bind:value={valueIs}
              disabled={Boolean(activePackageElsewhere)}
              oninput={queueSave}></textarea>
          </label>
          <label>
            <span>English</span>
            <textarea
              bind:value={valueEn}
              disabled={Boolean(activePackageElsewhere)}
              oninput={queueSave}></textarea>
          </label>
          <div class="detail-row">
            <span class:incomplete={validationProblems.length > 0}>
              {validationProblems.length === 0
                ? 'Both languages complete'
                : 'Translation incomplete'}
            </span>
            <span aria-live="polite">
              {saveState === 'unsaved'
                ? 'Unsaved'
                : saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'saved'
                    ? 'Saved'
                    : saveState === 'conflict'
                      ? 'Changed elsewhere - reload'
                      : saveState === 'failed'
                        ? 'Save failed - keep this panel open'
                        : ''}
            </span>
          </div>
          {#if selectedEntry}
            <p class="provenance">
              Last changed by {selectedEntry.changedBy} on {new Date(
                selectedEntry.changedAt
              ).toLocaleString()}.
            </p>
          {/if}
          {#if selectedHistory}
            <p class="provenance">
              Approved by {selectedHistory.approvedBy} on {new Date(
                selectedHistory.approvedAt
              ).toLocaleString()}.
            </p>
          {/if}
          {#if activePackageHere}
            <div class="package-actions">
              <button
                class="primary"
                type="button"
                disabled={!packageReadyToSubmit}
                onclick={() => void submitPackage()}>Submit page package</button
              >
              <button type="button" onclick={() => void discardPackage()}>Discard draft</button>
            </div>
          {/if}
        </div>
      </aside>
    {/if}

    {#if showReview}
      <aside class="panel review-panel" aria-labelledby="review-panel-title">
        <header>
          <div>
            <p class="eyebrow">Owner review</p>
            <h2 id="review-panel-title">Submitted page packages</h2>
          </div>
          <button type="button" aria-label="Close review panel" onclick={() => (showReview = false)}
            >×</button
          >
        </header>
        <div class="panel-body">
          {#if reviewPackage}
            <p><strong>{reviewPackage.pageId}</strong> by {reviewPackage.author.label}</p>
            <div class="review-entries">
              {#each reviewPackage.entries as entry (entry.key)}
                <article>
                  <h3>{entry.key}</h3>
                  <p><strong>IS:</strong> {entry.baseline.is} → {entry.draft.is}</p>
                  <p><strong>EN:</strong> {entry.baseline.en} → {entry.draft.en}</p>
                </article>
              {/each}
            </div>
            <label>
              <span>Overall return note</span>
              <textarea bind:value={reviewNote}></textarea>
            </label>
            <div class="package-actions">
              <button
                type="button"
                disabled={!reviewNote.trim()}
                onclick={() => void decideReview('return')}>Return package</button
              >
              <button class="primary" type="button" onclick={() => void decideReview('approve')}>
                Approve complete package
              </button>
            </div>
          {:else if reviewQueue.length === 0}
            <p>No submitted packages are waiting.</p>
          {:else}
            <div class="review-list">
              {#each reviewQueue as item (item.id)}
                <button type="button" onclick={() => void openReview(item.id)}>
                  <strong>{item.pageId}</strong>
                  <span>{item.changeCount} changes · {item.author}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    {/if}

    {#if loading || problem}
      <div class="mode-message" role={problem ? 'alert' : 'status'}>
        {problem ?? 'Loading translation mode…'}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* stays: in-context markers and the editing panel are isolated overlays on arbitrary product pages. */
  .translation-ui {
    --translation-ink: #16312d;
    --translation-surface: #fffdf7;
    --translation-accent: #087f6b;
    --translation-draft: #d47a00;
    --translation-approved: #3d67c6;
  }

  button {
    font: inherit;
  }

  .launcher,
  .toolbar {
    position: fixed;
    z-index: 1100;
    right: 1rem;
    bottom: 1rem;
    border: 1px solid color-mix(in srgb, var(--translation-ink) 35%, transparent);
    border-radius: 999px;
    background: var(--translation-ink);
    color: white;
    box-shadow: 0 10px 30px rgb(0 0 0 / 24%);
  }

  .launcher {
    min-height: 44px;
    padding: 0.65rem 1rem;
    font-weight: 800;
    cursor: pointer;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    max-width: calc(100vw - 2rem);
    padding: 0.35rem 0.45rem 0.35rem 0.8rem;
  }

  .toolbar button {
    min-height: 36px;
    padding: 0.35rem 0.7rem;
    border: 1px solid rgb(255 255 255 / 35%);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  .toolbar button:hover,
  .toolbar button:focus-visible,
  .toolbar .active-tool {
    background: white;
    color: var(--translation-ink);
  }

  .marker {
    position: fixed;
    z-index: 1050;
    display: grid;
    width: 26px;
    height: 26px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .marker span {
    width: 9px;
    height: 9px;
    border: 2px solid white;
    border-radius: 50%;
    background: var(--translation-accent);
    box-shadow: 0 1px 5px rgb(0 0 0 / 45%);
  }

  .marker-draft span {
    background: var(--translation-draft);
  }

  .marker-approved span {
    background: var(--translation-approved);
  }

  .marker:hover span,
  .marker:focus-visible span {
    width: 14px;
    height: 14px;
  }

  .panel {
    position: fixed;
    z-index: 1200;
    top: 0;
    right: 0;
    display: grid;
    width: min(30rem, 100vw);
    height: 100dvh;
    grid-template-rows: auto 1fr;
    border-left: 1px solid color-mix(in srgb, var(--translation-ink) 20%, transparent);
    background: var(--translation-surface);
    color: var(--translation-ink);
    box-shadow: -12px 0 40px rgb(0 0 0 / 22%);
  }

  .panel header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid rgb(0 0 0 / 12%);
  }

  .panel h2,
  .panel h3,
  .panel p {
    margin-top: 0;
  }

  .panel h2 {
    margin-bottom: 0;
    overflow-wrap: anywhere;
    font-size: 1.15rem;
  }

  .panel header > button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 1.6rem;
    cursor: pointer;
  }

  .eyebrow {
    margin-bottom: 0.2rem;
    color: color-mix(in srgb, var(--translation-ink) 68%, transparent);
    font-size: 0.75rem;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .panel-body {
    display: grid;
    align-content: start;
    gap: 1rem;
    overflow: auto;
    padding: 1rem;
  }

  .panel label {
    display: grid;
    gap: 0.35rem;
    font-weight: 800;
  }

  .panel textarea {
    width: 100%;
    min-height: 8rem;
    padding: 0.75rem;
    border: 1px solid rgb(22 49 45 / 35%);
    border-radius: 0.65rem;
    background: white;
    color: inherit;
    font: inherit;
    line-height: 1.45;
    resize: vertical;
  }

  .detail-row,
  .package-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
  }

  .incomplete {
    color: #9b3d20;
    font-weight: 800;
  }

  .provenance {
    margin-bottom: 0;
    color: color-mix(in srgb, var(--translation-ink) 72%, transparent);
    font-size: 0.86rem;
  }

  .notice,
  .mode-message {
    padding: 0.75rem;
    border-radius: 0.65rem;
    background: #e8f4f1;
  }

  .notice.attention {
    background: #fff0d7;
  }

  .notice p {
    margin: 0.3rem 0 0;
  }

  .package-actions button,
  .key-choices button,
  .review-list button {
    min-height: 42px;
    padding: 0.55rem 0.8rem;
    border: 1px solid rgb(22 49 45 / 35%);
    border-radius: 0.6rem;
    background: white;
    color: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  .package-actions .primary {
    border-color: var(--translation-accent);
    background: var(--translation-accent);
    color: white;
  }

  .package-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .key-choices,
  .review-list {
    grid-template-columns: 1fr;
  }

  .key-choices button,
  .review-list button {
    text-align: left;
  }

  .review-list button {
    display: grid;
    gap: 0.2rem;
  }

  .review-list span {
    font-size: 0.85rem;
    font-weight: 500;
  }

  .review-entries {
    display: grid;
    gap: 0.75rem;
  }

  .review-entries article {
    padding: 0.75rem;
    border: 1px solid rgb(22 49 45 / 18%);
    border-radius: 0.65rem;
    background: white;
  }

  .review-entries h3 {
    overflow-wrap: anywhere;
    font-size: 0.9rem;
  }

  .review-entries p:last-child {
    margin-bottom: 0;
  }

  .mode-message {
    position: fixed;
    z-index: 1300;
    right: 1rem;
    bottom: 4.8rem;
    max-width: min(24rem, calc(100vw - 2rem));
    box-shadow: 0 8px 25px rgb(0 0 0 / 18%);
  }

  @media (max-width: 42rem) {
    .toolbar {
      right: 0.5rem;
      bottom: 0.5rem;
      left: 0.5rem;
      overflow-x: auto;
    }

    .toolbar strong,
    .toolbar span {
      display: none;
    }
  }
</style>
