<script lang="ts">
  import { resolve } from '$app/paths';

  import { validateTranslationEntry } from '$lib/translations/placeholders';
  import { Eyebrow, Meta, PageHeader, PageShell, PageTitle, Panel } from '@hundavaent/design-system';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const locales = ['is', 'en'] as const;
  const changedEntries = $derived(
    data.workspace.entries.filter((entry) => entry.changed.is || entry.changed.en)
  );
  const invalidEntries = $derived(
    data.workspace.entries.filter(
      (entry) => validateTranslationEntry(entry.key, entry.draft.is, entry.draft.en).length > 0
    )
  );
</script>

<svelte:head>
  <title>Review translations | Hundavænt</title>
</svelte:head>

<PageShell mode="operations" class="review" aria-labelledby="review-title">
  <PageHeader class="mb-section">
    <Eyebrow>Publication review</Eyebrow>
    <PageTitle id="review-title">Review translations</PageTitle>
    <Meta>Publishing releases every pending Icelandic and English change together.</Meta>
  </PageHeader>

  {#if form?.conflict}
    <p class="hv-notice" data-tone="attention" role="alert">
      Another publication happened while this page was open. Reload and review the current batch.
    </p>
  {:else if form?.noChanges}
    <p class="hv-notice" data-tone="info" role="status">There are no changes to publish.</p>
  {:else if form?.invalidKeys}
    <p class="hv-notice" data-tone="error" role="alert">
      Publishing was blocked because {form.invalidKeys.length} keys are incomplete or have invalid placeholders.
    </p>
  {/if}

  {#if invalidEntries.length > 0}
    <section class="hv-notice" data-tone="error" aria-labelledby="validation-title">
      <h2 id="validation-title">Fix {invalidEntries.length} keys before publishing</h2>
      <ul>
        {#each invalidEntries.slice(0, 20) as entry (entry.key)}
          <li>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={`${resolve('/translations')}?search=${encodeURIComponent(entry.key)}`}
              >{entry.key}</a
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <p class="summary"><strong>{changedEntries.length}</strong> keys have unpublished changes.</p>

  <div class="change-list">
    {#each changedEntries as entry (entry.key)}
      <Panel as="article" class="change-card">
        <h2>{entry.key}</h2>
        <div class="changes">
          {#each locales as locale (locale)}
            {#if entry.changed[locale]}
              <section
                aria-label={`${locale === 'is' ? 'Icelandic' : 'English'} change for ${entry.key}`}
              >
                <h3>{locale === 'is' ? 'Icelandic' : 'English'}</h3>
                <p class="before"><span>Published</span>{entry.published[locale]}</p>
                <p class="after"><span>New</span>{entry.draft[locale]}</p>
              </section>
            {/if}
          {/each}
        </div>
      </Panel>
    {:else}
      <p class="hv-notice">No unpublished changes are waiting.</p>
    {/each}
  </div>

  <Panel class="publication-actions">
    <a class="hv-control" href={resolve('/translations')}>Back to editing</a>
    <form method="POST" action="?/publish">
      <input
        type="hidden"
        name="expectedRevision"
        value={data.workspace.currentRevision ?? 'none'}
      />
      <input type="hidden" name="expectedDraftGeneration" value={data.workspace.draftGeneration} />
      <button
        class="hv-control"
        data-intent="committed"
        type="submit"
        disabled={changedEntries.length === 0 || invalidEntries.length > 0}
        >Publish all changes</button
      >
    </form>
  </Panel>
</PageShell>

<style>
  /* .review now lives on PageShell's own <main> root, outside this file's scope hash. The bare
     class is NOT unique repo-wide (ModerationWorkspace.svelte has a `<section class="review">`),
     so this is tag-qualified rather than a bare :global. The hardcoded `1rem` is kept literal
     (not swapped for a gap-panel/gap-context recipe utility) because --hv-space-panel retunes to
     0.75rem under operations mode, which this page always renders in. */
  :global(main.review) {
    display: grid;
    gap: 1rem;
  }

  .summary {
    margin: 0;
  }

  .change-list {
    display: grid;
    gap: 0.75rem;
  }

  /* .change-card now lives on Panel's root <article>, outside this file's scope hash. Bare class
     is unique repo-wide (grep-verified). */
  :global(.change-card) {
    padding: 1rem;
  }

  /* This still matches every literal h2/h3/p left in the file (the header's eyebrow/meta moved
     to components that already carry their own m-0/margin resets, so losing them here is a
     no-op, not a regression). */
  h2,
  h3,
  p {
    margin-top: 0;
  }

  /* Descendant combinator, not child: Svelte's unused-selector check cannot prove a `>`
     relationship holds across a component boundary (the <h2> is a child of <Panel> in this
     file's own template, not provably a DOM child of the <article> Panel renders), so `>` here
     was flagged as unused even though it matched at runtime. A descendant combinator is
     equivalent in this markup - .change-card's only other heading level is h3. */
  :global(.change-card) h2 {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .changes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .changes p {
    min-height: 3rem;
    padding: 0.65rem;
    border-radius: var(--hv-radius-control);
    white-space: pre-wrap;
  }

  .changes p span {
    display: block;
    margin-bottom: 0.2rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .before {
    background: var(--hv-color-snow);
  }

  .after {
    background: var(--hv-color-signal-soft);
  }

  /* .publication-actions now lives on Panel's root, outside this file's scope hash. Bare class is
     unique repo-wide (grep-verified). */
  :global(.publication-actions) {
    position: sticky;
    bottom: 0;
    display: flex;
    padding: 0.75rem;
    gap: 0.75rem;
    align-items: center;
    justify-content: flex-end;
  }

  @media (max-width: 42rem) {
    .changes {
      grid-template-columns: 1fr;
    }

    :global(.publication-actions) {
      right: 0;
      left: 0;
    }
  }
</style>
