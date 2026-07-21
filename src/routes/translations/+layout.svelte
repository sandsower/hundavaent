<script lang="ts">
  import '../../app.css';

  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}
