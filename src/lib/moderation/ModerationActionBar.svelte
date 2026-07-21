<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    children?: Snippet;
  }

  let { label, disabled = false, children }: Props = $props();
</script>

<section class="action-bar" aria-label={label}>
  <fieldset {disabled}>
    {@render children?.()}
  </fieldset>
</section>

<style>
  .action-bar {
    z-index: 3;
    min-width: 0;
    border-top: 1px solid var(--hv-color-basalt);
    background: color-mix(in srgb, var(--hv-color-snow-raised) 96%, transparent);
    padding: 0.8rem 1rem;
    box-shadow: 0 -0.35rem 1rem rgb(20 37 41 / 8%);
  }
  .action-bar:focus-within {
    box-shadow: inset 0 0 0 3px var(--hv-focus-ring);
  }
  fieldset {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .action-bar :global(form),
  .action-bar :global(.decision-options) {
    min-width: 0;
  }
  .action-bar :global(button:focus-visible),
  .action-bar :global(select:focus-visible),
  .action-bar :global(textarea:focus-visible) {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
</style>
