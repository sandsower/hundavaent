<script lang="ts">
  import { Button } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type {
    PlaceFlagKind,
    PlaceFlagOutcome,
    PlaceFlagTargetKind
  } from '$server/place-flags/place-flags';

  interface Props {
    copy: Catalogue;
    kind: PlaceFlagKind;
    targetKind: PlaceFlagTargetKind;
    disabled?: boolean;
    /**
     * The primary outcome alone, disabled while the claim cannot honestly be applied. Every other
     * outcome stays open, because a Correction that cannot be applied can still be rejected or
     * sent back for information.
     */
    acceptDisabled?: boolean;
    ondecide: (outcome: Exclude<PlaceFlagOutcome, 'submitted'>) => void;
  }

  let {
    copy,
    kind,
    targetKind,
    disabled = false,
    acceptDisabled = false,
    ondecide
  }: Props = $props();
</script>

<div
  class="decision-options grid grid-cols-5 gap-[0.45rem] max-[44rem]:grid-cols-2"
  role="group"
  aria-label={copy['flag.resolve']}
>
  <Button
    class="decision-action"
    intent="committed"
    disabled={disabled || acceptDisabled}
    onclick={() => ondecide(kind === 'correction' ? 'applied' : 'confirmed_useful')}
  >
    {kind === 'correction' ? copy['flag.action.apply'] : copy['flag.action.confirmUseful']}
  </Button>
  <Button
    class="decision-action"
    intent="neutral"
    {disabled}
    onclick={() => ondecide('needs_information')}
  >
    {copy['moderation.workbench.needsInformation']}
  </Button>
  {#if targetKind === 'access_condition'}
    <Button
      class="decision-action"
      intent="neutral"
      {disabled}
      onclick={() => ondecide('dispute_opened')}
    >
      {copy['flag.action.openDispute']}
    </Button>
  {/if}
  <Button
    class="decision-action"
    intent="danger-quiet"
    {disabled}
    onclick={() => ondecide('place_inactivated')}
  >
    {copy['flag.action.inactivate']}
  </Button>
  <Button
    class="decision-action"
    intent="danger-quiet"
    {disabled}
    onclick={() => ondecide('rejected')}
  >
    {copy['moderation.workbench.reject']}
  </Button>
</div>

<style>
  /* Button renders its own <button> in a separate component, so Svelte's scoped CSS cannot reach
     it directly - the same ancestor-scoped :global() pattern AuthDialog's .facebook rule and
     ModerationReasonDialog's label rule use. The reduced font-size and min-width:0 truncation
     are call-site layout glue this migration preserves; Button's weight/height are the
     deliberately unified properties left untouched. danger-quiet (not danger) keeps this
     surface's deliberately calmer outline-only destructive treatment - see the shared migration
     context on not unifying the three danger flavours. */
  .decision-options :global(.decision-action) {
    min-width: 0;
    font-size: 0.74rem;
    line-height: 1.15;
  }
</style>
