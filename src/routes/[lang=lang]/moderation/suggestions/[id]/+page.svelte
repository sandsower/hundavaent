<script lang="ts">
  import SuggestionReviewPanel from '$lib/moderation/SuggestionReviewPanel.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['suggestion.review']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main data-ui-mode="operations">
  <SuggestionReviewPanel {data} {form} standalone />
</main>
