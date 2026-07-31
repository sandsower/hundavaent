<!-- The tone list is hand-transcribed from Status.svelte's own toneClasses map, plus the untoned
     default that map also carries - the same read-not-import contract as ButtonIntents.svelte. -->
<script lang="ts">
  import Status from '../../src/lib/Status.svelte';
</script>

<div class="dsc-row">
  <Status>Draft</Status>
  <Status tone="verified">Verified</Status>
  <Status tone="selected">Selected</Status>
  <Status tone="success">Published</Status>
  <Status tone="error">Rejected</Status>
  <Status tone="attention">Needs review</Status>
</div>

<style>
  .dsc-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--hv-space-actions);
  }
</style>
