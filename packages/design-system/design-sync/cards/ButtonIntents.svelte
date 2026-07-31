<!-- The six intents are hand-transcribed here from Button.svelte's own intentClasses map (it is
     not exported as data), which also means an invalid intent name would fail Svelte's own type
     check on the `intent` prop rather than silently render wrong. -->
<script lang="ts">
  import Button from '../../src/lib/Button.svelte';
</script>

<div class="dsc-row">
  <Button intent="neutral">Neutral</Button>
  <Button intent="primary">Save changes</Button>
  <Button intent="committed">Checked in</Button>
  <Button intent="quiet">Back</Button>
  <Button intent="danger">Delete place</Button>
  <Button intent="danger-quiet">Remove photo</Button>
</div>

<style>
  .dsc-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--hv-space-actions);
  }
</style>
