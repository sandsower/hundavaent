<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    tone?: 'primary' | 'danger';
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    tone = 'primary',
    onconfirm,
    oncancel
  }: Props = $props();
  const titleId = $props.id();
  let dialogElement = $state<HTMLDialogElement>();
  let returnFocusElement: HTMLElement | null = null;

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
    class="confirm-dialog"
    aria-labelledby={titleId}
    bind:this={dialogElement}
    oncancel={handleCancel}
  >
    <h2 id={titleId}>{title}</h2>
    <p>{description}</p>
    <div class="actions">
      <button type="button" class="cancel" onclick={oncancel}>{cancelLabel}</button>
      <button type="button" class:danger={tone === 'danger'} onclick={onconfirm}>
        {confirmLabel}
      </button>
    </div>
  </dialog>
{/if}

<style>
  .confirm-dialog {
    position: fixed;
    z-index: 30;
    inset: 50% auto auto 50%;
    display: grid;
    width: min(calc(100% - 2rem), 30rem);
    max-height: calc(100dvh - 2rem);
    translate: -50% -50%;
    gap: 0.75rem;
    overflow-y: auto;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-shell);
    background: var(--hv-color-snow-raised);
    padding: 1.1rem;
    color: var(--hv-color-basalt);
    box-shadow: var(--hv-shadow-raised);
  }
  .confirm-dialog::backdrop {
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
  p {
    color: var(--hv-color-basalt-muted);
    line-height: 1.45;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
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
  button.danger {
    background: var(--hv-color-danger);
    color: var(--hv-color-snow-raised);
  }
  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }
</style>
