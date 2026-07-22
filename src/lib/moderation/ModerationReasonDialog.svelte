<script lang="ts">
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
    title,
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
  const titleId = $props.id();
  let memberReasonIs = $state('');
  let memberReasonEn = $state('');
  let privateNote = $state('');

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onconfirm({ memberReasonIs, memberReasonEn, privateNote });
  }
</script>

{#if open}
  <dialog class="reason-dialog" open aria-labelledby={titleId} {oncancel}>
    <h2 id={titleId}>{title}</h2>
    <p>{description}</p>
    <form onsubmit={submit}>
      {@render children?.()}
      <div class="reasons">
        <label>
          {reasonIsLabel}
          <textarea bind:value={memberReasonIs} rows="3" required={reasonsRequired}></textarea>
        </label>
        <label>
          {reasonEnLabel}
          <textarea bind:value={memberReasonEn} rows="3" required={reasonsRequired}></textarea>
        </label>
      </div>
      {#if previousPrivateNote}
        <p class="previous-note">
          <strong>{previousPrivateNoteLabel}</strong>
          {previousPrivateNote}
        </p>
      {/if}
      <label>
        {privateNoteLabel}
        <textarea bind:value={privateNote} rows="2"></textarea>
      </label>
      <div class="actions">
        <button type="button" class="cancel" onclick={oncancel}>{cancelLabel}</button>
        <button type="submit" class:danger={tone === 'danger'} disabled={submitting}>
          {confirmLabel}
        </button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  .reason-dialog {
    position: fixed;
    z-index: 40;
    inset: 50% auto auto 50%;
    display: grid;
    width: min(calc(100% - 2rem), 38rem);
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
  form,
  label,
  .reasons {
    display: grid;
    gap: 0.45rem;
  }
  form {
    gap: 0.7rem;
  }
  .reasons {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  label {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  textarea,
  .reason-dialog :global(select) {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.55rem;
    color: var(--hv-color-basalt);
    font: inherit;
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
  @media (max-width: 36rem) {
    .reasons {
      grid-template-columns: 1fr;
    }
  }
</style>
