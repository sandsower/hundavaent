<script lang="ts">
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
    title,
    description,
    reasonLabel,
    reasonHelp,
    confirmLabel,
    cancelLabel,
    onconfirm,
    oncancel
  }: Props = $props();
  const id = $props.id();
  const titleId = `${id}-title`;
  const helpId = `${id}-help`;
  let reason = $state('');
  let dialogElement = $state<HTMLDialogElement>();
  let returnFocusElement: HTMLElement | null = null;

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onconfirm(reason);
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    oncancel();
  }

  function restoreFocus(): void {
    const target = returnFocusElement;
    returnFocusElement = null;
    queueMicrotask(() => {
      if (target?.isConnected) target.focus();
    });
  }

  $effect(() => {
    const dialog = dialogElement;
    if (!dialog) return;

    if (open && !dialog.open) {
      reason = '';
      returnFocusElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();

    return () => {
      if (dialog.open) dialog.close();
      restoreFocus();
    };
  });
</script>

{#if open}
  <dialog
    class="publish-dialog"
    aria-labelledby={titleId}
    bind:this={dialogElement}
    oncancel={handleCancel}
  >
    <h2 id={titleId}>{title}</h2>
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
  </dialog>
{/if}

<style>
  .publish-dialog {
    position: fixed;
    z-index: 40;
    inset: 50% auto auto 50%;
    display: grid;
    width: min(calc(100% - 2rem), 34rem);
    max-height: calc(100dvh - 2rem);
    translate: -50% -50%;
    gap: 0.7rem;
    overflow-y: auto;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-shell);
    background: var(--hv-color-snow-raised);
    padding: 1rem;
    color: var(--hv-color-basalt);
    box-shadow: var(--hv-shadow-raised);
  }
  .publish-dialog::backdrop {
    background: rgb(20 37 41 / 55%);
  }
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
