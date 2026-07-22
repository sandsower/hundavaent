<script lang="ts">
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
  <button
    class="primary"
    type="button"
    disabled={disabled || acceptDisabled}
    onclick={() => ondecide('accepted')}
  >
    {copy['suggestion.action.accept']}
  </button>
  <button type="button" {disabled} onclick={() => ondecide('needs_information')}>
    {copy['moderation.workbench.needsInformation']}
  </button>
  <button type="button" {disabled} onclick={() => ondecide('duplicate')}>
    {copy['suggestion.action.duplicate']}
  </button>
  <button class="danger" type="button" {disabled} onclick={() => ondecide('rejected')}>
    {copy['moderation.workbench.reject']}
  </button>
</div>

<style>
  .decision-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.45rem;
  }
  button {
    min-width: 0;
    min-height: 2.7rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.55rem;
    color: var(--hv-color-basalt);
    font: inherit;
    font-size: 0.76rem;
    font-weight: 900;
    line-height: 1.15;
  }
  .primary:not(:disabled) {
    background: var(--hv-color-signal);
  }
  .danger:not(:disabled) {
    background: var(--hv-color-danger);
    color: var(--hv-color-snow-raised);
  }
  @media (max-width: 44rem) {
    .decision-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
