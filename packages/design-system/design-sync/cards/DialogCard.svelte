<!-- Forced open (the `open` prop is always true here) - Dialog only reaches showModal() through a
     client-side $effect, which never runs during SSR, so build.ts post-processes this card's
     output, adding the native `open` attribute so the static markup renders visibly. -->
<script lang="ts">
  import Button from '../../src/lib/Button.svelte';
  import Dialog from '../../src/lib/Dialog.svelte';
</script>

<Dialog open size="standard">
  {#snippet title()}
    Leave Hundahólmi a note?
  {/snippet}
  <p>Other members will see this the next time they check in nearby.</p>
  <div class="dsc-actions">
    <Button intent="quiet">Not now</Button>
    <Button intent="primary" type="submit">Save note</Button>
  </div>
</Dialog>

<style>
  .dsc-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--hv-space-actions);
    margin-top: var(--hv-space-panel);
  }
</style>
