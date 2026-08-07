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

<section
  class="action-bar z-[3] min-w-0 py-[0.8rem] px-4 border-t border-t-basalt bg-[color-mix(in_srgb,var(--hv-color-snow-raised)_96%,transparent)] shadow-[0_-0.35rem_1rem_rgb(20_37_41_/_8%)] focus-within:shadow-[inset_0_0_0_3px_var(--hv-focus-ring)]"
  aria-label={label}
>
  {#if hint}
    <p class="hint m-[0_0_0.55rem] text-[0.76rem] leading-[1.35] font-[850] text-basalt-muted">
      {hint}
    </p>
  {/if}
  <fieldset class="min-w-0 m-0 p-0 border-0" {disabled}>
    {@render children?.()}
  </fieldset>
</section>

<style>
  .action-bar :global(form),
  .action-bar :global(.decision-options) {
    min-width: 0;
  }
  /* The button/select/textarea focus-visible block that used to live here is deleted: every
     child this bar renders (CandidateDecisionControls, SuggestionDecisionControls,
     CorrectionDecisionControls) is migrated onto the Button primitive, which owns its own
     focus-visible ring. */
</style>
