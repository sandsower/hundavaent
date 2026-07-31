<!-- The tone list is hand-transcribed from Notice.svelte's own toneClasses map, plus the untoned
     default that map also carries - the same read-not-import contract as ButtonIntents.svelte. -->
<script lang="ts">
  import Notice from '../../src/lib/Notice.svelte';
</script>

<div class="dsc-col">
  <Notice>Hundahólmi has 12 check-ins this week.</Notice>
  <Notice tone="info">New access notes were added to this place.</Notice>
  <Notice tone="verified">A moderator confirmed this place's access details.</Notice>
  <Notice tone="attention">Check the gate hours before visiting in winter.</Notice>
  <Notice tone="error" role="alert">Could not save your correction. Try again.</Notice>
  <Notice tone="success">Your suggestion was published.</Notice>
</div>

<style>
  .dsc-col {
    display: grid;
    gap: var(--hv-space-panel);
    max-width: 28rem;
  }
</style>
