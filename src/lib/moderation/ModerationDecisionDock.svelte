<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    children?: Snippet;
  }

  let { label, disabled = false, children }: Props = $props();
</script>

<section
  class="decision-dock sticky z-[3] bottom-0 min-w-0 py-[0.9rem] px-[1.1rem] border-t border-t-basalt bg-snow-raised shadow-none focus-within:shadow-[inset_0_0_0_3px_var(--hv-focus-ring)]"
  aria-label={label}
>
  <fieldset class="min-w-0 m-0 p-0 border-0" {disabled}>
    {@render children?.()}
  </fieldset>
</section>

<style>
  .decision-dock :global(form) {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(8rem, 0.7fr) minmax(12rem, 1fr) minmax(9rem, auto);
    gap: 0.65rem;
    align-items: end;
  }
  /* No live call site renders inside this dock today (grepped src/ and tests/ - nothing imports
     ModerationDecisionDock). Its shape (a select/textarea/button trio in a form grid) mirrors
     what ModerationReasonDialog and the moderation hub used to render as bare label/select/
     textarea/button elements before this migration - those are now Field/Select/Textarea/Button
     primitives that own their own look, and this batch's decision controls (Candidate/
     Suggestion/CorrectionDecisionControls) render nothing but Buttons. The button and select/
     textarea/label styling blocks that used to live here are deleted on that basis, matching the
     twin ModerationActionBar component (which has a live call site) - only the structural form
     grid above is layout glue worth keeping.  */
  @media (max-width: 44rem) {
    .decision-dock :global(form) {
      grid-template-columns: 1fr;
    }
  }
</style>
