<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    children?: Snippet;
  }

  let { label, disabled = false, children }: Props = $props();
</script>

<section class="decision-dock" aria-label={label}>
  <fieldset {disabled}>
    {@render children?.()}
  </fieldset>
</section>

<style>
  .decision-dock {
    position: sticky;
    z-index: 3;
    bottom: 0;
    min-width: 0;
    border-top: 1px solid var(--hv-color-basalt);
    background: var(--hv-color-snow-raised);
    padding: 0.9rem 1.1rem;
    box-shadow: none;
  }
  .decision-dock:focus-within {
    box-shadow: inset 0 0 0 3px var(--hv-focus-ring);
  }
  .decision-dock > fieldset {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .decision-dock :global(form) {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(8rem, 0.7fr) minmax(12rem, 1fr) minmax(9rem, auto);
    gap: 0.65rem;
    align-items: end;
  }
  .decision-dock :global(label) {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    font-weight: 900;
  }
  .decision-dock :global(select),
  .decision-dock :global(textarea) {
    width: 100%;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.5rem;
    color: var(--hv-color-basalt);
  }
  .decision-dock :global(button) {
    min-height: 2.75rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    padding: 0.55rem 0.9rem;
    color: var(--hv-color-basalt);
    font-weight: 950;
    box-shadow: none;
    cursor: pointer;
  }
  .decision-dock :global(button:focus-visible),
  .decision-dock :global(select:focus-visible),
  .decision-dock :global(textarea:focus-visible) {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  @media (max-width: 44rem) {
    .decision-dock :global(form) {
      grid-template-columns: 1fr;
    }
  }
</style>
