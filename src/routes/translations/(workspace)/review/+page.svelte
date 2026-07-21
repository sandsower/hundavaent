<script lang="ts">
  import { resolve } from '$app/paths';

  import { validateTranslationEntry } from '$lib/translations/placeholders';
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

<main class="review hv-page-shell" data-ui-mode="operations" aria-labelledby="review-title">
  <header class="hv-page-header">
    <p class="hv-eyebrow">Publication review</p>
    <h1 id="review-title" class="hv-page-title">Review translations</h1>
    <p class="hv-meta">Publishing releases every pending Icelandic and English change together.</p>
  </header>

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
      <article class="change-card hv-panel">
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
      </article>
    {:else}
      <p class="hv-notice">No unpublished changes are waiting.</p>
    {/each}
  </div>

  <div class="publication-actions hv-panel">
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
  </div>
</main>

<style>
  .review {
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

  .change-card {
    padding: 1rem;
  }

  h2,
  h3,
  p {
    margin-top: 0;
  }

  .change-card > h2 {
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

  .publication-actions {
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

    .publication-actions {
      right: 0;
      left: 0;
    }
  }
</style>
