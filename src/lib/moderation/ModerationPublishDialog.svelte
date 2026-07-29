<script lang="ts">
  import { Dialog } from '@hundavaent/design-system';

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
  const id = $props.id();
  const helpId = `${id}-help`;
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
  <form onsubmit={submit}>
    <label>
      {reasonLabel}
      <textarea bind:value={reason} rows="3" required aria-describedby={helpId}></textarea>
    </label>
    <small id={helpId}>{reasonHelp}</small>
    <div class="actions">
      <button type="button" class="cancel" onclick={oncancel}>{cancelLabel}</button>
      <button type="submit">{confirmLabel}</button>
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
  p,
  small {
    color: var(--hv-color-basalt-muted);
    line-height: 1.4;
  }
  form,
  label {
    display: grid;
    gap: 0.45rem;
  }
  form {
    gap: 0.7rem;
  }
  label {
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.6rem;
    color: var(--hv-color-basalt);
    font: inherit;
    resize: vertical;
  }
  .actions {
    display: flex;
    gap: 0.55rem;
    justify-content: flex-end;
  }
  button {
    min-height: 2.7rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    padding: 0.55rem 0.8rem;
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 900;
  }
  button.cancel {
    background: var(--hv-color-snow-raised);
  }
  button:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }
</style>
