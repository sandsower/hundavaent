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
    border-top: 2px solid var(--ink);
    background: var(--paper-light);
    padding: 0.9rem 1.1rem;
    box-shadow: 0 -0.35rem 1.1rem rgb(25 59 69 / 12%);
  }
  .decision-dock:focus-within {
    box-shadow:
      0 -0.35rem 1.1rem rgb(25 59 69 / 12%),
      inset 0 0 0 3px var(--focus);
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
    color: var(--ink-soft);
    font-size: 0.72rem;
    font-weight: 900;
  }
  .decision-dock :global(select),
  .decision-dock :global(textarea) {
    width: 100%;
    border: 2px solid var(--ink);
    border-radius: 0.65rem;
    background: white;
    padding: 0.5rem;
    color: var(--ink);
  }
  .decision-dock :global(button) {
    min-height: 2.75rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.55rem 0.9rem;
    color: var(--ink);
    font-weight: 950;
    box-shadow: 0.18rem 0.2rem 0 var(--ink);
    cursor: pointer;
  }
  .decision-dock :global(button:focus-visible),
  .decision-dock :global(select:focus-visible),
  .decision-dock :global(textarea:focus-visible) {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
  @media (max-width: 44rem) {
    .decision-dock :global(form) {
      grid-template-columns: 1fr;
    }
  }
</style>
