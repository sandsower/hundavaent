<script lang="ts">
  import { Panel, PageShell, PageTitle } from '@hundavaent/design-system';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['legal.privacyTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<PageShell width="narrow" class="legal-page">
  <Panel as="article" class="privacy-article grid gap-context">
    <PageTitle>{data.copy['legal.privacyTitle']}</PageTitle>
    <p>{data.copy['legal.privacyIntro']}</p>
    <p>{data.copy['legal.privacyBody']}</p>
  </Panel>
</PageShell>

<style>
  /* The surface is now Panel (as="article"), so the bare tag selector went dead; a hook class
     on the class prop re-anchors it instead of a bare :global(article) that would reach every
     article on the page while this stylesheet is loaded. */
  :global(.privacy-article) {
    max-width: 44rem;
    margin-inline: auto;
    padding: clamp(1.25rem, 4vw, 2.5rem);
  }

  p {
    line-height: 1.65;
  }
</style>
