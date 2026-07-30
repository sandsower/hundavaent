<script lang="ts">
  import { Button } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type { SuggestionOutcome } from '$server/suggestions/suggestions';

  interface Props {
    copy: Catalogue;
    disabled?: boolean;
    acceptDisabled?: boolean;
    ondecide: (outcome: Exclude<SuggestionOutcome, 'submitted'>) => void;
  }

  let { copy, disabled = false, acceptDisabled = false, ondecide }: Props = $props();
</script>

<div class="decision-options" role="group" aria-label={copy['suggestion.resolve']}>
  <Button
    class="decision-action"
    intent="committed"
    disabled={disabled || acceptDisabled}
    onclick={() => ondecide('accepted')}
  >
    {copy['suggestion.action.accept']}
  </Button>
  <Button
    class="decision-action"
    intent="neutral"
    {disabled}
    onclick={() => ondecide('needs_information')}
  >
    {copy['moderation.workbench.needsInformation']}
  </Button>
  <Button class="decision-action" intent="neutral" {disabled} onclick={() => ondecide('duplicate')}>
    {copy['suggestion.action.duplicate']}
  </Button>
  <Button class="decision-action" intent="danger" {disabled} onclick={() => ondecide('rejected')}>
    {copy['moderation.workbench.reject']}
  </Button>
</div>

<style>
  .decision-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.45rem;
  }
  /* Button renders its own <button> in a separate component, so Svelte's scoped CSS cannot reach
     it directly - the same ancestor-scoped :global() pattern AuthDialog's .facebook rule and
     ModerationReasonDialog's label rule use. The reduced font-size and min-width:0 truncation
     are call-site layout glue this migration preserves; Button's weight/height are the
     deliberately unified properties left untouched. */
  .decision-options :global(.decision-action) {
    min-width: 0;
    font-size: 0.76rem;
    line-height: 1.15;
  }
  @media (max-width: 44rem) {
    .decision-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
