<script lang="ts">
  import Button from '../../src/lib/Button.svelte';
</script>

<div class="dsc-row">
  <Button shape="round" aria-label="Get directions to this place">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M7.5 7.5 5 5M19 19l-2.5-2.5M16.5 7.5 19 5M5 19l2.5-2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  </Button>
  <Button intent="primary" disabled>Saving</Button>
  <Button intent="neutral" pressed={true} aria-label="Following Hundahólmi">Following</Button>
  <Button href="#" intent="quiet">View on map</Button>
</div>

<style>
  .dsc-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--hv-space-actions);
  }
</style>
