<script lang="ts">
  import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  interface ConflictActionData {
    conflictReview?: Partial<PageProps['data']>;
    conflictRefreshFailed?: boolean;
  }

  const conflictAction = $derived(form as ConflictActionData | null);
  const reviewData = $derived(
    conflictAction?.conflictReview ? { ...data, ...conflictAction.conflictReview } : data
  );
</script>

<svelte:head>
  <title>{data.copy['flag.review']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main data-ui-mode="operations">
  {#if data.draftSaved}
    <p class="notice" role="status">{data.copy['moderation.workbench.draftSaved']}</p>
  {/if}
  <fieldset data-route-review disabled={Boolean(conflictAction?.conflictRefreshFailed)}>
    <CorrectionReviewPanel data={reviewData} {form} standalone />
  </fieldset>
</main>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .notice {
    margin: 0 0 0.75rem;
    border-left: 0.3rem solid var(--hv-color-success);
    background: var(--hv-color-success-soft);
    padding: 0.7rem 0.85rem;
    color: var(--hv-color-basalt);
    font-weight: 800;
  }
</style>
