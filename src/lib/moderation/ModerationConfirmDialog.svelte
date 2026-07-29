<script lang="ts">
  import { Dialog } from '@hundavaent/design-system';

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
    title: titleText,
    description,
    confirmLabel,
    cancelLabel,
    tone = 'primary',
    onconfirm,
    oncancel
  }: Props = $props();
</script>

<Dialog {open} size="compact" class="grid gap-[0.75rem]" {oncancel}>
  {#snippet title()}
    <h2>{titleText}</h2>
  {/snippet}
  <p>{description}</p>
  <div class="actions">
    <button type="button" class="cancel" onclick={oncancel}>{cancelLabel}</button>
    <button type="button" class:danger={tone === 'danger'} onclick={onconfirm}>
      {confirmLabel}
    </button>
  </div>
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
