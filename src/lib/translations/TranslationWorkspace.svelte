<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';

  import {
    Button,
    Eyebrow,
    Input,
    Notice,
    PageShell,
    Panel,
    Select
  } from '@hundavaent/design-system';
  import type {
    SavedTranslationDraft,
    TranslationWorkspace as WorkspaceData
  } from '$server/translations/workspace';
  import TranslationRow from './TranslationRow.svelte';
  import {
    provideTranslationSaveCoordinator,
    useTranslationSaveCoordinator
  } from './save-coordinator';

  type Filter = 'all' | 'missing' | 'changed';
  type Locale = 'is' | 'en';

  let {
    workspace,
    saveEndpoint = '/translations/api/drafts',
    initialSearch = '',
    navigate
  }: {
    workspace: WorkspaceData;
    saveEndpoint?: string;
    initialSearch?: string;
    navigate?: (destination: string) => void | Promise<void>;
  } = $props();

  const saveCoordinator = useTranslationSaveCoordinator();
  provideTranslationSaveCoordinator(saveCoordinator);

  let entries = $state(untrack(() => workspace.entries.map((entry) => structuredClone(entry))));
  let currentRevision = $state(untrack(() => workspace.currentRevision));
  let pendingCount = $state(untrack(() => workspace.pendingCount));
  let search = $state(untrack(() => initialSearch));
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
      if (saveCoordinator.isEntryBlocking(entry.key)) return true;
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

  async function guardReview(event: MouseEvent): Promise<void> {
    if (!saveCoordinator.hasBlocking && !navigate) return;
    event.preventDefault();
    if (!(await saveCoordinator.settle())) return;
    const destination = resolve('/translations/review');
    if (navigate) await navigate(destination);
    else await goto(destination);
  }
</script>

<PageShell as="section" mode="operations" class="workspace" aria-labelledby="translations-title">
  <header class="workspace-header flex items-start justify-between gap-4 max-narrow:block">
    <div>
      <Eyebrow class="my-[1em]">Hundavænt workspace</Eyebrow>
      <h1
        class="[margin:0.2rem_0_0] font-display text-[clamp(2.3rem,6vw,4rem)] font-[650] leading-none tracking-[-0.035em]"
        id="translations-title">Translations</h1
      >
      <p class="max-w-[62ch] [margin:0.65rem_0_0] text-basalt-muted">
        Update Icelandic and English as equal languages. Drafts stay private until publishing.
      </p>
    </div>
    <Button
      class="review-link"
      intent="committed"
      href={resolve('/translations/review')}
      aria-disabled={saveCoordinator.hasBlocking}
      onclick={(event) => void guardReview(event)}
    >
      {reviewLabel()}
    </Button>
  </header>

  <Panel class="toolbar" aria-label="Translation filters">
    <label class="search-field grid min-w-0 gap-1 text-[0.8rem] font-[850]">
      <span>Search</span>
      <Input
        type="search"
        name="search"
        aria-label="Search translations"
        bind:value={search}
        oninput={() => (visibleLimit = 50)}
        placeholder="Key or translated text"
      />
    </label>
    <label class="grid min-w-0 gap-1 text-[0.8rem] font-[850]">
      <span>Namespace</span>
      <Select
        name="namespace"
        aria-label="Namespace"
        bind:value={namespace}
        onchange={() => (visibleLimit = 50)}
      >
        <option value="all">All namespaces</option>
        {#each namespaces as item (item)}
          <option value={item}>{item}</option>
        {/each}
      </Select>
    </label>
    <div
      class="filter-buttons flex gap-1 max-narrow:grid max-narrow:grid-cols-3"
      aria-label="Translation status filters"
    >
      <button
        class="min-h-control px-[0.7rem] py-2 border border-border-strong rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [line-height:inherit] font-[850] [color:inherit] aria-pressed:bg-signal"
        type="button"
        aria-pressed={filter === 'all'}
        onclick={() => selectFilter('all')}>All</button
      >
      <button
        class="min-h-control px-[0.7rem] py-2 border border-border-strong rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [line-height:inherit] font-[850] [color:inherit] aria-pressed:bg-signal"
        type="button"
        aria-pressed={filter === 'missing'}
        onclick={() => selectFilter('missing')}>Missing</button
      >
      <button
        class="min-h-control px-[0.7rem] py-2 border border-border-strong rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [line-height:inherit] font-[850] [color:inherit] aria-pressed:bg-signal"
        type="button"
        aria-pressed={filter === 'changed'}
        onclick={() => selectFilter('changed')}>Changed</button
      >
    </div>
    <button
      class="language-order min-h-control px-[0.7rem] py-2 border border-border-strong rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [line-height:inherit] font-[850] [color:inherit]"
      type="button"
      onclick={() => (firstLocale = firstLocale === 'is' ? 'en' : 'is')}
      aria-label={firstLocale === 'is' ? 'Show English first' : 'Show Icelandic first'}
    >
      {firstLocale === 'is' ? 'IS · EN' : 'EN · IS'}
    </button>
  </Panel>

  <p class="result-summary m-0 text-[0.85rem] font-[750] text-basalt-muted" aria-live="polite">
    Showing {Math.min(visibleEntries.length, filteredEntries.length)} of {filteredEntries.length}
    matching keys
  </p>

  <div class="translation-list grid gap-3">
    {#each visibleEntries as entry (entry.key)}
      <TranslationRow
        {entry}
        {currentRevision}
        {localeOrder}
        {saveEndpoint}
        onSaved={handleSaved}
      />
    {:else}
      <Notice as="p">No translations match these filters.</Notice>
    {/each}
  </div>

  {#if visibleEntries.length < filteredEntries.length}
    <Button
      class="show-more"
      intent="neutral"
      onclick={() => (visibleLimit += 50)}
      aria-label="Show more translations">Show 50 more</Button
    >
  {/if}

  <div
    class="mobile-review-bar hidden max-narrow:fixed max-narrow:z-20 max-narrow:right-0 max-narrow:bottom-0 max-narrow:left-0 max-narrow:flex max-narrow:min-h-[4.5rem] max-narrow:[padding:0.75rem_1rem_max(0.75rem,env(safe-area-inset-bottom))] max-narrow:border-t max-narrow:border-border-strong max-narrow:items-center max-narrow:justify-between max-narrow:gap-3 max-narrow:bg-snow-raised max-narrow:font-[850] max-narrow:[box-shadow:0_-0.7rem_1.8rem_rgb(30_45_49_/_12%)]"
  >
    <span>{pendingCount} unpublished</span>
    <Button
      intent="committed"
      href={resolve('/translations/review')}
      aria-disabled={saveCoordinator.hasBlocking}
      onclick={(event) => void guardReview(event)}
    >
      {reviewLabel()}
    </Button>
  </div>
</PageShell>

<style>
  /* .workspace now lives on PageShell's own <section> root, outside this file's scope hash. The
     bare class is NOT unique repo-wide (ModerationWorkspace.svelte also has a `.workspace`
     section), so this is qualified by tag and the aria-labelledby value that's unique to this
     page. The hardcoded `1rem` stays literal (not a gap-panel/gap-context recipe utility)
     because --hv-space-panel retunes to 0.75rem under operations mode, which this component
     always renders in. */
  :global(section.workspace[aria-labelledby='translations-title']) {
    display: grid;
    gap: 1rem;
  }

  /* .toolbar now lives on Panel's root <div>, outside this file's scope hash. Bare class is
     unique repo-wide (grep-verified). */
  :global(.toolbar) {
    position: sticky;
    z-index: 3;
    top: 0;
    display: grid;
    grid-template-columns: minmax(14rem, 2fr) minmax(10rem, 1fr) auto auto;
    padding: 0.75rem;
    gap: 0.65rem;
    align-items: end;
  }

  /* .show-more now lives on Button's own rendered element, outside this file's scope hash. Bare
     class is unique repo-wide (grep-verified). */
  :global(.show-more) {
    justify-self: center;
  }

  @media (max-width: 58rem) {
    :global(.toolbar) {
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 0.6fr);
    }
  }

  @media (max-width: 42rem) {
    :global(section.workspace[aria-labelledby='translations-title']) {
      padding-bottom: 5.5rem;
    }

    /* .review-link now lives on Button's own rendered <a>, outside this file's scope hash, but
       Button renders it as a direct child of .workspace-header in this file's own template, so
       the child combinator still holds - only the class needs :global() to re-anchor onto it. */
    .workspace-header > :global(.review-link) {
      display: none;
    }

    :global(.toolbar) {
      position: static;
      grid-template-columns: 1fr;
    }
  }
</style>
