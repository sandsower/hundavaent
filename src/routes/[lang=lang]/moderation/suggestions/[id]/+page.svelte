<script lang="ts">
  import { Notice } from '@hundavaent/design-system';
  import SuggestionReviewPanel from '$lib/moderation/SuggestionReviewPanel.svelte';
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
  <title>{data.copy['suggestion.review']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main data-ui-mode="operations">
  {#if data.draftSaved}
    <Notice tone="success" role="status" class="mb-[0.75rem] font-extrabold"
      >{data.copy['moderation.workbench.draftSaved']}</Notice
    >
  {/if}
  <fieldset data-route-review disabled={Boolean(conflictAction?.conflictRefreshFailed)}>
    <SuggestionReviewPanel data={reviewData} {form} standalone />
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
