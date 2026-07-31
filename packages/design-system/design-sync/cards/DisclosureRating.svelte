<script lang="ts">
  import Disclosure from '../../src/lib/Disclosure.svelte';
  import Rating from '../../src/lib/Rating.svelte';

  // Rating is fully controlled (Rating.svelte's own top comment) - onSelect only matters once
  // hydrated, which a static preview card never is, so a no-op satisfies the required prop without
  // pretending to be interactive. scoreLabel is required and runs during SSR itself, to produce
  // each star's aria-label.
  const noop = () => {};
  const scoreLabel = (value: number) => (value === 1 ? '1 star' : `${value} stars`);
</script>

<div class="dsc-col">
  <Disclosure open>
    {#snippet summary()}
      Nearby parking
    {/snippet}
    <p>
      A small gravel lot on Fjörukvíar holds about eight cars; street parking is free after 18:00.
    </p>
  </Disclosure>
  <Disclosure>
    {#snippet summary()}
      Seasonal notes
    {/snippet}
    <p>The lower field floods after heavy rain between October and March.</p>
  </Disclosure>
  <div class="dsc-row">
    <Rating label="Overall" value={4} onSelect={noop} {scoreLabel} />
    <Rating label="Cleanliness" value={null} inherited onSelect={noop} {scoreLabel} />
    <Rating label="Access" value={2} disabled onSelect={noop} {scoreLabel} />
  </div>
</div>

<style>
  .dsc-col {
    display: grid;
    gap: var(--hv-space-panel);
    max-width: 28rem;
  }

  .dsc-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--hv-space-actions);
  }
</style>
