<script lang="ts">
  import StubPage from '$lib/StubPage.svelte';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['stub.aboutTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<StubPage
  lang={data.lang}
  copy={data.copy}
  title={data.copy['stub.aboutTitle']}
  body={data.copy['stub.aboutBody']}
/>
