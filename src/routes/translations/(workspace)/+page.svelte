<script lang="ts">
  import TranslationWorkspace from '$lib/translations/TranslationWorkspace.svelte';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Translations | Hundavænt</title>
</svelte:head>

<TranslationWorkspace workspace={data.workspace} />
