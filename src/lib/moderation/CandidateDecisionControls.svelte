<script module lang="ts">
  export type CandidateDecisionOutcome = 'publish' | 'needs_information' | 'rejected' | 'reopen';
</script>

<script lang="ts">
  import { Button } from '@hundavaent/design-system';
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
    <Button class="decision-action" intent="neutral" {disabled} onclick={() => ondecide('reopen')}>
      {copy['moderation.workbench.reopen']}
    </Button>
  </div>
{:else if status === 'pending' || status === 'needs_information'}
  <div class="decision-options" role="group" aria-label={copy['moderation.reviewTitle']}>
    <Button
      class="decision-action"
      intent="committed"
      disabled={disabled || !ready}
      onclick={() => ondecide('publish')}
    >
      {copy['moderation.verifyAndPublish']}
    </Button>
    <Button
      class="decision-action"
      intent="neutral"
      {disabled}
      onclick={() => ondecide('needs_information')}
    >
      {copy['moderation.workbench.needsInformation']}
    </Button>
    <Button class="decision-action" intent="danger" {disabled} onclick={() => ondecide('rejected')}>
      {copy['moderation.workbench.reject']}
    </Button>
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
      grid-template-columns: 1fr;
    }
  }
</style>
