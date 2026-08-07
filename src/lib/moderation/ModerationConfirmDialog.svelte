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
    <h2 class="m-0 font-display text-[1.35rem]">{titleText}</h2>
  {/snippet}
  <p class="m-0 leading-[1.45] text-basalt-muted">{description}</p>
  <div class="actions flex justify-end gap-[0.6rem]">
    <Button intent="neutral" onclick={oncancel}>{cancelLabel}</Button>
    <Button intent={tone === 'danger' ? 'danger' : 'committed'} onclick={onconfirm}>
      {confirmLabel}
    </Button>
  </div>
</Dialog>
