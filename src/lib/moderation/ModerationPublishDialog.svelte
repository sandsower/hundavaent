<script lang="ts">
  import { Button, Dialog, Field, Textarea } from '@hundavaent/design-system';

  interface Props {
    open: boolean;
    title: string;
    description: string;
    reasonLabel: string;
    reasonHelp: string;
    confirmLabel: string;
    cancelLabel: string;
    onconfirm: (reason: string) => void;
    oncancel: () => void;
  }

  let {
    open,
    title: titleText,
    description,
    reasonLabel,
    reasonHelp,
    confirmLabel,
    cancelLabel,
    onconfirm,
    oncancel
  }: Props = $props();
  let reason = $state('');

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onconfirm(reason);
  }

  // Mirrors the pre-migration effect's reset behaviour: this dialog stays mounted with `open`
  // toggling (see CandidateReviewPanel.svelte / +page.svelte call sites), so the reason field
  // needs an explicit clear on every closed -> open transition rather than relying on remount.
  $effect(() => {
    if (open) reason = '';
  });
</script>

<Dialog {open} size="standard" class="grid gap-[0.7rem]" {oncancel}>
  {#snippet title()}
    <h2>{titleText}</h2>
  {/snippet}
  <p>{description}</p>
  <form class="publish-form" onsubmit={submit}>
    <Field label={reasonLabel} hint={reasonHelp}>
      <Textarea bind:value={reason} rows={3} required />
    </Field>
    <div class="actions">
      <Button intent="neutral" onclick={oncancel}>{cancelLabel}</Button>
      <Button intent="committed" type="submit">{confirmLabel}</Button>
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
  .publish-form {
    display: grid;
    gap: 0.7rem;
  }
  /* Field renders its own <label>, crossing this component's scoping boundary the same way
     AuthDialog's `form :global(label)` rule does - :global() reaches it purely on the literal
     element, scoped under this component's hash via the ancestor selector. Field's label carries
     no size/weight utility of its own precisely so a surface like this keeps its reduced,
     heavier treatment. */
  .publish-form :global(label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
  .actions {
    display: flex;
    gap: 0.55rem;
    justify-content: flex-end;
  }
</style>
