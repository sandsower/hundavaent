<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    hint?: string | null;
    children?: Snippet;
  }

  let { label, disabled = false, hint = null, children }: Props = $props();
</script>

<section class="action-bar" aria-label={label}>
  {#if hint}<p class="hint">{hint}</p>{/if}
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
  .hint {
    margin: 0 0 0.55rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.76rem;
    font-weight: 850;
    line-height: 1.35;
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
  /* The button/select/textarea focus-visible block that used to live here is deleted: every
     child this bar renders (CandidateDecisionControls, SuggestionDecisionControls,
     CorrectionDecisionControls) is migrated onto the Button primitive, which owns its own
     focus-visible ring. */
</style>
