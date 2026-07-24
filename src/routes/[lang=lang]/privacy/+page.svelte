<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['legal.privacyTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<main class="legal-page hv-page-shell" data-ui-mode="place" data-width="narrow">
  <article class="hv-panel hv-stack">
    <h1 class="hv-page-title">{data.copy['legal.privacyTitle']}</h1>
    <p>{data.copy['legal.privacyIntro']}</p>
    <p>{data.copy['legal.privacyBody']}</p>
  </article>
</main>

<style>
  article {
    max-width: 44rem;
    margin-inline: auto;
    padding: clamp(1.25rem, 4vw, 2.5rem);
  }

  p {
    line-height: 1.65;
  }
</style>
