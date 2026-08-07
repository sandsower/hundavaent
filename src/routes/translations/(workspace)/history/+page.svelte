<script lang="ts">
  import {
    Button,
    Eyebrow,
    Meta,
    PageHeader,
    PageShell,
    PageTitle,
    Notice,
    Panel,
    Status
  } from '@hundavaent/design-system';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  function kindLabel(kind: 'inventory_sync' | 'publish' | 'restore'): string {
    if (kind === 'inventory_sync') return 'Application key sync';
    if (kind === 'restore') return 'Restored revision';
    return 'Published changes';
  }
</script>

<svelte:head>
  <title>Translation history | Hundavænt</title>
</svelte:head>

<!-- .history now lives on PageShell's own <main> root, outside this file's scope hash. The
     hardcoded `1rem` is left as a literal (not swapped for a gap-panel/gap-context recipe
     utility) because --hv-space-panel retunes to 0.75rem under operations mode - resolving
     through the token here would silently shrink this gap under exactly the mode this page
     always renders in. Tag-qualified for defense in depth even though the bare class is
     currently unique. -->
<PageShell mode="operations" class="history grid gap-4" aria-labelledby="history-title">
  <PageHeader class="mb-section">
    <Eyebrow>Published revisions</Eyebrow>
    <PageTitle id="history-title">Translation history</PageTitle>
    <Meta>Restore creates a new published revision. Existing history is never deleted.</Meta>
  </PageHeader>

  {#if form?.conflict}
    <Notice as="p" tone="attention" role="alert">
      A newer revision was published. Reload before restoring.
    </Notice>
  {:else if form?.invalid}
    <Notice as="p" tone="error" role="alert">Confirm the revision before restoring it.</Notice>
  {/if}

  {#if data.workspace.pendingCount > 0}
    <Notice as="p" tone="attention">
      Publish or revise the {data.workspace.pendingCount} pending keys before restoring history.
    </Notice>
  {/if}

  <ol class="revision-list grid m-0 p-0 gap-3 list-none">
    {#each data.workspace.revisions as revision (revision.revisionNumber)}
      <!-- .revision now lives on Panel's root <li>, outside this file's scope hash. Bare class is
           unique repo-wide (grep-verified). -->
      <Panel
        as="li"
        class="revision flex gap-4 items-center justify-between p-4 max-narrow:items-stretch max-narrow:flex-col"
      >
        <!-- p/h2 stay bare (not :global) - they're still literal elements in this file's template
             (the Meta-rendered paragraphs are components now and carry no such hash, so they're
             correctly excluded here; Meta's own m-0 already zeroes their margin). -->
        <div>
          <p class="revision-number m-0 text-fjord text-[0.75rem] font-[850] uppercase">
            Revision {revision.revisionNumber}
          </p>
          <h2 class="m-0">{kindLabel(revision.kind)}</h2>
          <Meta>
            {revision.changeCount} changed keys · {new Date(revision.publishedAt).toLocaleString(
              'en-GB'
            )}
          </Meta>
          {#if revision.restoredFromRevisionNumber}
            <Meta>Restored from revision {revision.restoredFromRevisionNumber}</Meta>
          {/if}
        </div>
        {#if data.workspace.currentRevision === revision.revisionNumber}
          <Status tone="success">Current</Status>
        {:else if data.workspace.pendingCount > 0 || !data.workspace.currentRevision}
          <Status tone="attention">Restore unavailable</Status>
        {:else}
          <form
            class="flex gap-[0.65rem] items-center max-narrow:items-stretch max-narrow:flex-col"
            method="POST"
            action="?/restore"
          >
            <input type="hidden" name="targetRevision" value={revision.revisionNumber} />
            <input type="hidden" name="expectedRevision" value={data.workspace.currentRevision} />
            <label class="font-extrabold">
              <input type="checkbox" name="confirm" value="restore" required />
              Confirm
            </label>
            <Button intent="neutral" type="submit"
              >Restore revision {revision.revisionNumber}</Button
            >
          </form>
        {/if}
      </Panel>
    {:else}
      <Notice as="li">No published revisions yet.</Notice>
    {/each}
  </ol>
</PageShell>
