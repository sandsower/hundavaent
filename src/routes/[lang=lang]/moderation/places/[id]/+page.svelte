<script lang="ts">
  import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['moderation.reviewTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<main data-ui-mode="operations">
  <CandidateReviewPanel {data} {form} standalone />
</main>
