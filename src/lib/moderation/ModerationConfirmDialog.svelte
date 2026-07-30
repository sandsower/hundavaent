<script lang="ts">
  import { Button, Dialog } from '@hundavaent/design-system';

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
    <Button intent="neutral" onclick={oncancel}>{cancelLabel}</Button>
    <Button intent={tone === 'danger' ? 'danger' : 'committed'} onclick={onconfirm}>
      {confirmLabel}
    </Button>
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
</style>
