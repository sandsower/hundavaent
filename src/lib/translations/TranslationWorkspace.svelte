<script lang="ts">
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';

  import type {
    SavedTranslationDraft,
    TranslationWorkspace as WorkspaceData
  } from '$server/translations/workspace';
  import TranslationRow from './TranslationRow.svelte';

  type Filter = 'all' | 'missing' | 'changed';
  type Locale = 'is' | 'en';

  let {
    workspace,
    saveEndpoint = '/translations/api/drafts'
  }: { workspace: WorkspaceData; saveEndpoint?: string } = $props();

  let entries = $state(untrack(() => workspace.entries.map((entry) => structuredClone(entry))));
  let currentRevision = $state(untrack(() => workspace.currentRevision));
  let pendingCount = $state(untrack(() => workspace.pendingCount));
  let search = $state('');
  let namespace = $state('all');
  let filter = $state<Filter>('all');
  let firstLocale = $state<Locale>('is');
  let visibleLimit = $state(50);
  const namespaces = $derived([...new Set(entries.map((entry) => entry.namespace))].sort());
  const localeOrder = $derived<readonly Locale[]>(
    firstLocale === 'is' ? ['is', 'en'] : ['en', 'is']
  );
  const filteredEntries = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (namespace !== 'all' && entry.namespace !== namespace) return false;
      if (
        query &&
        !entry.key.toLocaleLowerCase().includes(query) &&
        !entry.draft.is.toLocaleLowerCase().includes(query) &&
        !entry.draft.en.toLocaleLowerCase().includes(query)
      ) {
        return false;
      }
      if (filter === 'missing' && entry.draft.is.trim() && entry.draft.en.trim()) return false;
      if (filter === 'changed' && !entry.changed.is && !entry.changed.en) return false;
      return true;
    });
  });
  const visibleEntries = $derived(filteredEntries.slice(0, visibleLimit));

  function selectFilter(next: Filter): void {
    filter = next;
    visibleLimit = 50;
  }

  function handleSaved(saved: SavedTranslationDraft): void {
    const entry = entries.find((candidate) => candidate.key === saved.key);
    if (entry) {
      entry.draft[saved.locale] = saved.value;
      entry.versions[saved.locale] = saved.version;
      entry.changed[saved.locale] = saved.changed;
    }
    pendingCount = saved.pendingCount;
    currentRevision = saved.currentRevision;
  }

  function reviewLabel(): string {
    return pendingCount === 1
      ? 'Review 1 unpublished change'
      : `Review ${pendingCount} unpublished changes`;
  }
</script>

<section
  class="workspace hv-page-shell"
  data-ui-mode="operations"
  aria-labelledby="translations-title"
>
  <header class="workspace-header">
    <div>
      <p class="hv-eyebrow">Hundavænt workspace</p>
      <h1 id="translations-title">Translations</h1>
      <p>Update Icelandic and English as equal languages. Drafts stay private until publishing.</p>
    </div>
    <a
      class="review-link hv-control"
      data-intent="committed"
      href={resolve('/translations/review')}
    >
      {reviewLabel()}
    </a>
  </header>

  <div class="toolbar hv-panel" aria-label="Translation filters">
    <label class="search-field">
      <span>Search</span>
      <input
        class="hv-field"
        type="search"
        aria-label="Search translations"
        bind:value={search}
        oninput={() => (visibleLimit = 50)}
        placeholder="Key or translated text"
      />
    </label>
    <label>
      <span>Namespace</span>
      <select
        class="hv-field"
        aria-label="Namespace"
        bind:value={namespace}
        onchange={() => (visibleLimit = 50)}
      >
        <option value="all">All namespaces</option>
        {#each namespaces as item (item)}
          <option value={item}>{item}</option>
        {/each}
      </select>
    </label>
    <div class="filter-buttons" aria-label="Translation status filters">
      <button type="button" aria-pressed={filter === 'all'} onclick={() => selectFilter('all')}
        >All</button
      >
      <button
        type="button"
        aria-pressed={filter === 'missing'}
        onclick={() => selectFilter('missing')}>Missing</button
      >
      <button
        type="button"
        aria-pressed={filter === 'changed'}
        onclick={() => selectFilter('changed')}>Changed</button
      >
    </div>
    <button
      class="language-order"
      type="button"
      onclick={() => (firstLocale = firstLocale === 'is' ? 'en' : 'is')}
      aria-label={firstLocale === 'is' ? 'Show English first' : 'Show Icelandic first'}
    >
      {firstLocale === 'is' ? 'IS · EN' : 'EN · IS'}
    </button>
  </div>

  <p class="result-summary" aria-live="polite">
    Showing {Math.min(visibleEntries.length, filteredEntries.length)} of {filteredEntries.length}
    matching keys
  </p>

  <div class="translation-list">
    {#each visibleEntries as entry (entry.key)}
      <TranslationRow
        {entry}
        {currentRevision}
        {localeOrder}
        {saveEndpoint}
        onSaved={handleSaved}
      />
    {:else}
      <p class="empty hv-notice">No translations match these filters.</p>
    {/each}
  </div>

  {#if visibleEntries.length < filteredEntries.length}
    <button
      class="show-more hv-control"
      type="button"
      onclick={() => (visibleLimit += 50)}
      aria-label="Show more translations">Show 50 more</button
    >
  {/if}

  <div class="mobile-review-bar">
    <span>{pendingCount} unpublished</span>
    <a class="hv-control" data-intent="committed" href={resolve('/translations/review')}>
      {reviewLabel()}
    </a>
  </div>
</section>

<style>
  .workspace {
    display: grid;
    gap: 1rem;
  }

  .workspace-header {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    justify-content: space-between;
  }

  h1 {
    margin: 0.2rem 0 0;
    font-family: var(--hv-font-display);
    font-size: clamp(2.3rem, 6vw, 4rem);
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.035em;
  }

  .workspace-header p:last-child {
    max-width: 62ch;
    margin: 0.65rem 0 0;
    color: var(--hv-color-basalt-muted);
  }

  .toolbar {
    position: sticky;
    z-index: 3;
    top: 0;
    display: grid;
    grid-template-columns: minmax(14rem, 2fr) minmax(10rem, 1fr) auto auto;
    padding: 0.75rem;
    gap: 0.65rem;
    align-items: end;
  }

  .toolbar label {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 850;
  }

  .filter-buttons {
    display: flex;
    gap: 0.25rem;
  }

  .filter-buttons button,
  .language-order {
    min-height: var(--hv-control-height);
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--hv-border-strong);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: inherit;
    font: inherit;
    font-weight: 850;
  }

  .filter-buttons button[aria-pressed='true'] {
    background: var(--hv-color-signal);
  }

  .result-summary {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.85rem;
    font-weight: 750;
  }

  .translation-list {
    display: grid;
    gap: 0.75rem;
  }

  .show-more {
    justify-self: center;
  }

  .mobile-review-bar {
    display: none;
  }

  @media (max-width: 58rem) {
    .toolbar {
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 0.6fr);
    }
  }

  @media (max-width: 42rem) {
    .workspace {
      padding-bottom: 5.5rem;
    }

    .workspace-header {
      display: block;
    }

    .workspace-header > .review-link {
      display: none;
    }

    .toolbar {
      position: static;
      grid-template-columns: 1fr;
    }

    .filter-buttons {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }

    .mobile-review-bar {
      position: fixed;
      z-index: 20;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      min-height: 4.5rem;
      padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom));
      border-top: 1px solid var(--hv-border-strong);
      gap: 0.75rem;
      align-items: center;
      justify-content: space-between;
      background: var(--hv-color-snow-raised);
      box-shadow: 0 -0.7rem 1.8rem rgb(30 45 49 / 12%);
      font-weight: 850;
    }
  }
</style>
