<script lang="ts">
  import { Panel, PageShell, PageTitle } from '@hundavaent/design-system';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['legal.privacyTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<PageShell width="narrow" class="legal-page">
  <!-- The surface is now Panel (as="article"), so the bare tag selector went dead; the article's
       measure, centring and inset ride Panel's own class prop instead of a bare :global(article)
       that would reach every article on the page while this stylesheet is loaded. The hook class
       stays as the call site's name for this surface. -->
  <Panel
    as="article"
    class="privacy-article grid gap-context max-w-[44rem] mx-auto p-[clamp(1.25rem,4vw,2.5rem)]"
  >
    <PageTitle>{data.copy['legal.privacyTitle']}</PageTitle>
    <p class="leading-[1.65]">{data.copy['legal.privacyIntro']}</p>
    <p class="leading-[1.65]">{data.copy['legal.privacyBody']}</p>
  </Panel>
</PageShell>
