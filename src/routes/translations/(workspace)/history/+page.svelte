<script lang="ts">
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

<main class="history hv-page-shell" data-ui-mode="operations" aria-labelledby="history-title">
  <header class="hv-page-header">
    <p class="hv-eyebrow">Published revisions</p>
    <h1 id="history-title" class="hv-page-title">Translation history</h1>
    <p class="hv-meta">
      Restore creates a new published revision. Existing history is never deleted.
    </p>
  </header>

  {#if form?.conflict}
    <p class="hv-notice" data-tone="attention" role="alert">
      A newer revision was published. Reload before restoring.
    </p>
  {:else if form?.invalid}
    <p class="hv-notice" data-tone="error" role="alert">
      Confirm the revision before restoring it.
    </p>
  {/if}

  {#if data.workspace.pendingCount > 0}
    <p class="hv-notice" data-tone="attention">
      Publish or revise the {data.workspace.pendingCount} pending keys before restoring history.
    </p>
  {/if}

  <ol class="revision-list">
    {#each data.workspace.revisions as revision (revision.revisionNumber)}
      <li class="revision hv-panel">
        <div>
          <p class="revision-number">Revision {revision.revisionNumber}</p>
          <h2>{kindLabel(revision.kind)}</h2>
          <p class="hv-meta">
            {revision.changeCount} changed keys · {new Date(revision.publishedAt).toLocaleString(
              'en-GB'
            )}
          </p>
          {#if revision.restoredFromRevisionNumber}
            <p class="hv-meta">Restored from revision {revision.restoredFromRevisionNumber}</p>
          {/if}
        </div>
        {#if data.workspace.currentRevision === revision.revisionNumber}
          <span class="hv-status" data-status="success">Current</span>
        {:else if data.workspace.pendingCount > 0 || !data.workspace.currentRevision}
          <span class="hv-status" data-status="attention">Restore unavailable</span>
        {:else}
          <form method="POST" action="?/restore">
            <input type="hidden" name="targetRevision" value={revision.revisionNumber} />
            <input type="hidden" name="expectedRevision" value={data.workspace.currentRevision} />
            <label>
              <input type="checkbox" name="confirm" value="restore" required />
              Confirm
            </label>
            <button class="hv-control" type="submit"
              >Restore revision {revision.revisionNumber}</button
            >
          </form>
        {/if}
      </li>
    {:else}
      <li class="hv-notice">No published revisions yet.</li>
    {/each}
  </ol>
</main>

<style>
  .history {
    display: grid;
    gap: 1rem;
  }

  .revision-list {
    display: grid;
    margin: 0;
    padding: 0;
    gap: 0.75rem;
    list-style: none;
  }

  .revision {
    display: flex;
    padding: 1rem;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .revision p,
  .revision h2 {
    margin: 0;
  }

  .revision-number {
    color: var(--hv-color-fjord);
    font-size: 0.75rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  form {
    display: flex;
    gap: 0.65rem;
    align-items: center;
  }

  label {
    font-weight: 800;
  }

  @media (max-width: 42rem) {
    .revision,
    form {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
