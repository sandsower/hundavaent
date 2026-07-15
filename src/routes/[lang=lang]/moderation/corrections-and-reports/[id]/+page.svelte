<script lang="ts">
  import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['flag.review']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main data-ui-mode="operations">
  <CorrectionReviewPanel {data} {form} standalone />
</main>
