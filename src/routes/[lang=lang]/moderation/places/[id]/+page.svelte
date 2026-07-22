<script lang="ts">
  import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';

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
  <title>{data.copy['moderation.reviewTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<main data-ui-mode="operations">
  <fieldset data-route-review disabled={Boolean(conflictAction?.conflictRefreshFailed)}>
    <CandidateReviewPanel data={reviewData} {form} standalone />
  </fieldset>
</main>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
</style>
