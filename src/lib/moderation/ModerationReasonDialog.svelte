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
    <h2 class="m-0 font-display text-[1.35rem]">{titleText}</h2>
  {/snippet}
  <p class="m-0 leading-[1.4] text-basalt-muted">{description}</p>
  <form class="reason-form grid gap-[0.7rem]" onsubmit={submit}>
    {@render children?.()}
    <div class="reasons grid grid-cols-2 gap-[0.45rem] max-[36rem]:grid-cols-[1fr]">
      <Field label={reasonIsLabel}>
        <Textarea bind:value={memberReasonIs} rows={3} required={reasonsRequired} />
      </Field>
      <Field label={reasonEnLabel}>
        <Textarea bind:value={memberReasonEn} rows={3} required={reasonsRequired} />
      </Field>
    </div>
    {#if previousPrivateNote}
      <!-- The bare `p` rule reached this note as well as the description above it, so the
           zero margin, 1.4 line-height and muted ink travel with the accent border here. -->
      <p
        class="previous-note m-0 pl-[0.6rem] border-l-[0.25rem] border-l-signal leading-[1.4] text-basalt-muted"
      >
        <strong>{previousPrivateNoteLabel}</strong>
        {previousPrivateNote}
      </p>
    {/if}
    <Field label={privateNoteLabel}>
      <Textarea bind:value={privateNote} rows={2} />
    </Field>
    <div class="actions flex justify-end gap-[0.55rem]">
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
</style>
