<script lang="ts">
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

<div class="decision-options" role="group" aria-label={copy['flag.resolve']}>
  <button
    class="primary"
    type="button"
    disabled={disabled || acceptDisabled}
    onclick={() => ondecide(kind === 'correction' ? 'applied' : 'confirmed_useful')}
  >
    {kind === 'correction' ? copy['flag.action.apply'] : copy['flag.action.confirmUseful']}
  </button>
  <button type="button" {disabled} onclick={() => ondecide('needs_information')}>
    {copy['moderation.workbench.needsInformation']}
  </button>
  {#if targetKind === 'access_condition'}
    <button type="button" {disabled} onclick={() => ondecide('dispute_opened')}>
      {copy['flag.action.openDispute']}
    </button>
  {/if}
  <button class="danger" type="button" {disabled} onclick={() => ondecide('place_inactivated')}>
    {copy['flag.action.inactivate']}
  </button>
  <button class="danger" type="button" {disabled} onclick={() => ondecide('rejected')}>
    {copy['moderation.workbench.reject']}
  </button>
</div>

<style>
  .decision-options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
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
    font-size: 0.74rem;
    font-weight: 900;
    line-height: 1.15;
  }
  .primary:not(:disabled) {
    background: var(--hv-color-signal);
  }
  .danger:not(:disabled) {
    border-color: var(--hv-color-danger);
    color: var(--hv-color-danger);
  }
  @media (max-width: 44rem) {
    .decision-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
