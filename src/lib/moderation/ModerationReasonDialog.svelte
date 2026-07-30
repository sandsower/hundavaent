<script lang="ts">
  import { Button, Dialog, Field, Textarea } from '@hundavaent/design-system';
  import type { Snippet } from 'svelte';

  export interface ModerationReasonValue {
    memberReasonIs: string;
    memberReasonEn: string;
    privateNote: string;
  }

  interface Props {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    reasonIsLabel: string;
    reasonEnLabel: string;
    privateNoteLabel: string;
    previousPrivateNoteLabel?: string;
    previousPrivateNote?: string | null;
    reasonsRequired?: boolean;
    tone?: 'primary' | 'danger';
    submitting?: boolean;
    children?: Snippet;
    onconfirm: (value: ModerationReasonValue) => void;
    oncancel: () => void;
  }

  let {
    open,
    title: titleText,
    description,
    confirmLabel,
    cancelLabel,
    reasonIsLabel,
    reasonEnLabel,
    privateNoteLabel,
    previousPrivateNoteLabel = '',
    previousPrivateNote = null,
    reasonsRequired = true,
    tone = 'primary',
    submitting = false,
    children,
    onconfirm,
    oncancel
  }: Props = $props();
  let memberReasonIs = $state('');
  let memberReasonEn = $state('');
  let privateNote = $state('');

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onconfirm({ memberReasonIs, memberReasonEn, privateNote });
  }
</script>

<Dialog {open} size="roomy" class="grid gap-[0.7rem]" {oncancel}>
  {#snippet title()}
    <h2>{titleText}</h2>
  {/snippet}
  <p>{description}</p>
  <form class="reason-form" onsubmit={submit}>
    {@render children?.()}
    <div class="reasons">
      <Field label={reasonIsLabel}>
        <Textarea bind:value={memberReasonIs} rows={3} required={reasonsRequired} />
      </Field>
      <Field label={reasonEnLabel}>
        <Textarea bind:value={memberReasonEn} rows={3} required={reasonsRequired} />
      </Field>
    </div>
    {#if previousPrivateNote}
      <p class="previous-note">
        <strong>{previousPrivateNoteLabel}</strong>
        {previousPrivateNote}
      </p>
    {/if}
    <Field label={privateNoteLabel}>
      <Textarea bind:value={privateNote} rows={2} />
    </Field>
    <div class="actions">
      <Button intent="neutral" onclick={oncancel}>{cancelLabel}</Button>
      <Button
        intent={tone === 'danger' ? 'danger' : 'committed'}
        type="submit"
        disabled={submitting}
      >
        {confirmLabel}
      </Button>
    </div>
  </form>
</Dialog>

<style>
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-family: var(--hv-font-display);
    font-size: 1.35rem;
  }
  p {
    color: var(--hv-color-basalt-muted);
    line-height: 1.4;
  }
  .reason-form {
    display: grid;
    gap: 0.7rem;
  }
  .reasons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }
  /* Field renders its own <label>, crossing this component's scoping boundary the same way
     AuthDialog's `form :global(label)` rule does - :global() reaches it purely on the literal
     element, scoped under this component's hash via the ancestor selector. Field's label carries
     no size/weight utility of its own precisely so this surface keeps its reduced, heavier
     treatment. */
  .reason-form :global(label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  .previous-note {
    border-left: 0.25rem solid var(--hv-color-signal);
    padding-left: 0.6rem;
  }
  .actions {
    display: flex;
    gap: 0.55rem;
    justify-content: flex-end;
  }
  @media (max-width: 36rem) {
    .reasons {
      grid-template-columns: 1fr;
    }
  }
</style>
