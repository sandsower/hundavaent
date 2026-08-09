<script lang="ts">
  import { resolve } from '$app/paths';

  import { validateTranslationEntry } from '$lib/translations/placeholders';
  import {
    Button,
    Eyebrow,
    Meta,
    Notice,
    PageHeader,
    PageShell,
    PageTitle,
    Panel
  } from '@hundavaent/design-system';
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

<!-- .review now lives on PageShell's own <main> root, outside this file's scope hash. The bare
     class is NOT unique repo-wide (ModerationWorkspace.svelte has a `<section class="review">`),
     so this is tag-qualified rather than a bare :global. The hardcoded `1rem` is kept literal
     (not swapped for a gap-panel/gap-context recipe utility) because --hv-space-panel retunes to
     0.75rem under operations mode, which this page always renders in. -->
<PageShell mode="operations" class="review grid gap-4" aria-labelledby="review-title">
  <PageHeader class="mb-section">
    <Eyebrow>Source review</Eyebrow>
    <PageTitle id="review-title">Review translations</PageTitle>
    <Meta>
      Ready changes stay private until a developer imports both languages into JSON, reviews the
      diff, and deploys it.
    </Meta>
  </PageHeader>

  {#if form?.conflict}
    <!-- mt-0 mirrors the scoped `p { margin-top: 0 }` rule these notices lose by moving onto
         Notice's own rendered root, which sits outside this file's scope hash. -->
    <Notice as="p" tone="attention" role="alert" class="mt-0">
      The deployed source or draft set changed while this page was open. Reload and review the
      current batch.
    </Notice>
  {:else if form?.noChanges}
    <Notice as="p" tone="info" role="status" class="mt-0">
      There are no changes to make ready for source.
    </Notice>
  {:else if form?.invalidKeys}
    <Notice as="p" tone="error" role="alert" class="mt-0">
      Source readiness was blocked because {form.invalidKeys.length} keys are incomplete or have invalid
      placeholders.
    </Notice>
  {/if}

  {#if invalidEntries.length > 0}
    <Notice as="section" tone="error" aria-labelledby="validation-title">
      <!-- This still matches every literal h2/h3/p left in the file (the header's eyebrow/meta
           moved to components that already carry their own m-0/margin resets, so losing them
           here is a no-op, not a regression). -->
      <h2 class="mt-0" id="validation-title">
        Fix {invalidEntries.length} keys before making them ready
      </h2>
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
    </Notice>
  {/if}

  <p class="summary m-0">
    <strong>{changedEntries.length}</strong>
    {changedEntries.length === 1
      ? 'key has a change waiting for source.'
      : 'keys have changes waiting for source.'}
  </p>

  <div class="change-list grid gap-3">
    {#each changedEntries as entry (entry.key)}
      <!-- .change-card now lives on Panel's root <article>, outside this file's scope hash. Bare
           class is unique repo-wide (grep-verified). -->
      <Panel as="article" class="change-card p-4">
        <!-- Descendant combinator, not child: Svelte's unused-selector check cannot prove a `>`
             relationship holds across a component boundary (the <h2> is a child of <Panel> in this
             file's own template, not provably a DOM child of the <article> Panel renders), so `>`
             here was flagged as unused even though it matched at runtime. A descendant combinator
             is equivalent in this markup - .change-card's only other heading level is h3. -->
        <h2
          class="mt-0 [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace] text-[1rem] [overflow-wrap:anywhere]"
        >
          {entry.key}
        </h2>
        <div class="changes grid grid-cols-2 gap-4 max-narrow:grid-cols-1">
          {#each locales as locale (locale)}
            {#if entry.changed[locale]}
              <section
                aria-label={`${locale === 'is' ? 'Icelandic' : 'English'} change for ${entry.key}`}
              >
                <h3 class="mt-0">{locale === 'is' ? 'Icelandic' : 'English'}</h3>
                <p
                  class="before mt-0 min-h-12 p-[0.65rem] rounded-control bg-snow whitespace-pre-wrap"
                >
                  <span
                    class="block mb-[0.2rem] text-[0.72rem] font-[850] uppercase text-basalt-muted"
                    >Deployed JSON</span
                  >{entry.published[locale]}
                </p>
                <p
                  class="after mt-0 min-h-12 p-[0.65rem] rounded-control bg-signal-soft whitespace-pre-wrap"
                >
                  <span
                    class="block mb-[0.2rem] text-[0.72rem] font-[850] uppercase text-basalt-muted"
                    >New</span
                  >{entry.draft[locale]}
                </p>
              </section>
            {/if}
          {/each}
        </div>
      </Panel>
    {:else}
      <Notice as="p" class="mt-0">No changes are waiting for source.</Notice>
    {/each}
  </div>

  <!-- .publication-actions now lives on Panel's root, outside this file's scope hash. Bare class is
       unique repo-wide (grep-verified). -->
  <Panel
    class="publication-actions sticky bottom-0 flex gap-3 items-center justify-end p-3 max-narrow:right-0 max-narrow:left-0"
  >
    <Button intent="neutral" href={resolve('/translations')}>Back to editing</Button>
    <form method="POST" action="?/ready">
      <input
        type="hidden"
        name="expectedRevision"
        value={data.workspace.currentRevision ?? 'none'}
      />
      <input type="hidden" name="expectedDraftGeneration" value={data.workspace.draftGeneration} />
      <Button
        intent="committed"
        type="submit"
        disabled={changedEntries.length === 0 || invalidEntries.length > 0}
        >Ready all changes for source</Button
      >
    </form>
  </Panel>
</PageShell>
