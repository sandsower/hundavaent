<!-- Demonstrates the documented utility recipes verbatim (stack = `grid gap-context`, actions =
     `flex flex-wrap items-center gap-actions`) rather than restating them as scoped CSS, so
     preview-entry.css's extra `@source '../design-sync'` root exists specifically to compile
     these classes. mode="place" is the component's own default (its Mode type is
     'place' | 'operations', not 'member') and stands in for the Member-facing page this card is
     showing. -->
<script lang="ts">
  import Button from '../../src/lib/Button.svelte';
  import Eyebrow from '../../src/lib/Eyebrow.svelte';
  import Meta from '../../src/lib/Meta.svelte';
  import PageHeader from '../../src/lib/PageHeader.svelte';
  import PageShell from '../../src/lib/PageShell.svelte';
  import PageTitle from '../../src/lib/PageTitle.svelte';
  import Panel from '../../src/lib/Panel.svelte';
</script>

<PageShell mode="place">
  <div class="grid gap-context">
    <PageHeader>
      <Eyebrow>Southwest Iceland</Eyebrow>
      <PageTitle>Hundahólmi</PageTitle>
      <Meta>A fenced off-lead field ten minutes from Hafnarfjörður, open year-round.</Meta>
    </PageHeader>
    <Panel padded>
      <p>Access notes, opening hours, and the latest check-ins live here.</p>
      <div class="flex flex-wrap items-center gap-actions">
        <Button intent="primary">Check in</Button>
        <Button intent="quiet">Get directions</Button>
      </div>
    </Panel>
  </div>
</PageShell>
