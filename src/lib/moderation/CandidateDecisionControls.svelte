<script module lang="ts">
  export type CandidateDecisionOutcome = 'publish' | 'needs_information' | 'rejected' | 'reopen';
</script>

<script lang="ts">
  import type { Catalogue } from '$i18n';

  interface Props {
    copy: Catalogue;
    status: 'pending' | 'needs_information' | 'rejected' | 'published';
    ready: boolean;
    disabled?: boolean;
    ondecide: (outcome: CandidateDecisionOutcome) => void;
  }

  let { copy, status, ready, disabled = false, ondecide }: Props = $props();
</script>

{#if status === 'rejected'}
  <div class="decision-options single" role="group" aria-label={copy['moderation.reviewTitle']}>
    <button type="button" {disabled} onclick={() => ondecide('reopen')}>
      {copy['moderation.workbench.reopen']}
    </button>
  </div>
{:else if status === 'pending' || status === 'needs_information'}
  <div class="decision-options" role="group" aria-label={copy['moderation.reviewTitle']}>
    <button
      class="primary"
      type="button"
      disabled={disabled || !ready}
      onclick={() => ondecide('publish')}
    >
      {copy['moderation.verifyAndPublish']}
    </button>
    <button type="button" {disabled} onclick={() => ondecide('needs_information')}>
      {copy['moderation.workbench.needsInformation']}
    </button>
    <button class="danger" type="button" {disabled} onclick={() => ondecide('rejected')}>
      {copy['moderation.workbench.reject']}
    </button>
  </div>
{/if}

<style>
  .decision-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .decision-options.single {
    grid-template-columns: minmax(8rem, 1fr);
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
      grid-template-columns: 1fr;
    }
  }
</style>
