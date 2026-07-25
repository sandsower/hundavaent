<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { Catalogue } from '$i18n';
  import { requestAuthentication } from '$lib/auth/controller';
  import { memberNoteMaximumLength } from '$lib/contributions/correction';
  import type { CorrectionResult } from '$lib/contributions/correction-client';

  /**
   * The disclosure every inline Correction affordance is built from: the quiet trigger, the
   * fieldset, the note, the send lifecycle, the focus round-trip and the outcome announcements.
   * An editor supplies only its own controls and its own unchanged test, so no two editors can
   * drift on the accessibility conventions.
   */
  interface Props {
    copy: Catalogue;
    /** Already interpolated, because only the editor knows which fact it is correcting. */
    startLabel: string;
    signedIn: boolean;
    /** The editor's own unchanged test. The server repeats it against the stored value. */
    canSend: boolean;
    /** Called on every expand so the editor can reseed from the currently published value. */
    onOpen?: () => void;
    send: (note: string | null) => Promise<CorrectionResult>;
    controls: Snippet<[{ dismiss: (event: KeyboardEvent) => void; groupName: string }]>;
    announce?: (message: string) => void;
  }

  let {
    copy,
    startLabel,
    signedIn,
    canSend,
    onOpen = () => undefined,
    send,
    controls,
    announce = () => undefined
  }: Props = $props();

  const componentId = $props.id();
  let open = $state(false);
  let note = $state('');
  let sending = $state(false);
  let outcome = $state<'unchanged' | 'rate_limited' | 'failed' | null>(null);
  let attempt = $state(0);
  let editor = $state<HTMLFieldSetElement>();
  let valueControls = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let focusTarget = $state<'editor' | 'trigger' | null>(null);

  const outcomeMessage = $derived(
    outcome === 'unchanged'
      ? copy['inlineCorrection.unchanged']
      : outcome === 'rate_limited'
        ? copy['inlineCorrection.rateLimited']
        : outcome === 'failed'
          ? copy['inlineCorrection.failed']
          : null
  );

  function expand(): void {
    open = true;
    note = '';
    outcome = null;
    focusTarget = 'editor';
    onOpen();
  }

  function collapse(): void {
    open = false;
    outcome = null;
    focusTarget = 'trigger';
  }

  /**
   * Bound to each control rather than to the panel, because focus is always on one of them while
   * the editor is open and a listener on the fieldset would be a keyboard handler on a
   * non-interactive element. The chip behind this panel dismisses its own tooltip on Escape, so
   * the key must not travel.
   */
  function dismiss(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    collapse();
  }

  async function confirm(): Promise<void> {
    if (sending || !canSend) return;
    if (!signedIn) {
      // Required rather than deferred: the sign-in link can land in a different browser, so there
      // is nothing to replay and nothing held on the Member's behalf.
      requestAuthentication({ origin: 'contribution' });
      return;
    }
    sending = true;
    outcome = null;
    const result = await send(note.trim() || null);
    sending = false;

    if (result.status === 'submitted') {
      announce(copy['inlineCorrection.sent']);
      collapse();
      return;
    }
    if (result.status === 'authentication_required') {
      requestAuthentication({ origin: 'contribution' });
      return;
    }
    outcome =
      result.status === 'unchanged'
        ? 'unchanged'
        : result.status === 'rate_limited'
          ? 'rate_limited'
          : 'failed';
    // Two identical outcomes in a row are two separate events. Without this the live region text
    // never changes and a retry is announced to nobody.
    attempt += 1;
  }

  // Focus follows the disclosure in both directions, so keyboard focus is never left on a node
  // that has just been removed. The checked option is the entry point, as in any radio group;
  // the first control is only a fallback for a value the editor's group cannot represent.
  //
  // The search is scoped to the value controls rather than to the whole fieldset. The note is the
  // last control in the fieldset and the optional one, so a query over the fieldset would land on
  // it the moment an editor rendered no matching control, and the Member would be typing a note
  // before ever seeing the fact they came to correct.
  $effect(() => {
    if (focusTarget === 'editor' && editor) {
      const region = valueControls ?? editor;
      (
        region.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
        region.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea, select')
      )?.focus();
      focusTarget = null;
    }
    if (focusTarget === 'trigger' && trigger) {
      trigger.focus();
      focusTarget = null;
    }
  });

  $effect(() => {
    // `attempt` is read so a repeated identical message still counts as a change.
    void attempt;
    if (outcomeMessage) announce(outcomeMessage);
  });
</script>

<div class="inline-correction">
  {#if open}
    <fieldset bind:this={editor} class="editor" aria-labelledby={`${componentId}-legend`}>
      <legend id={`${componentId}-legend`}>{copy['inlineCorrection.legend']}</legend>
      <!-- The value the Member came to change always precedes the note, in DOM order and in the
           tab order, because the note is the optional afterthought and the value is the point. -->
      <div bind:this={valueControls} class="value-controls">
        {@render controls({ dismiss, groupName: `${componentId}-choice` })}
      </div>

      <label class="note">
        <span>{copy['inlineCorrection.note']}</span>
        <input
          type="text"
          maxlength={memberNoteMaximumLength}
          bind:value={note}
          autocomplete="off"
          onkeydown={dismiss}
        />
      </label>

      {#if outcomeMessage}
        <p class="outcome" data-correction-outcome>{outcomeMessage}</p>
      {/if}

      <div class="actions">
        <button
          class="confirm"
          type="button"
          disabled={!canSend || sending}
          onclick={() => void confirm()}
          onkeydown={dismiss}
        >
          {sending ? copy['inlineCorrection.sending'] : copy['inlineCorrection.confirm']}
        </button>
        <button class="cancel" type="button" onclick={collapse} onkeydown={dismiss}>
          {copy['inlineCorrection.cancel']}
        </button>
      </div>
    </fieldset>
  {:else}
    <button
      bind:this={trigger}
      class="start"
      type="button"
      aria-label={startLabel}
      onclick={expand}
    >
      {copy['inlineCorrection.start']}
    </button>
  {/if}
</div>

<style>
  .inline-correction {
    display: grid;
    justify-items: start;
    margin-top: 0.45rem;
  }

  /* The entry point into the whole feature sits directly under the access chips, so it needs a
     target a thumb can hit without toggling a chip. 1.5rem clears the WCAG 2.5.8 24px minimum. */
  .start {
    display: inline-flex;
    min-height: 1.5rem;
    align-items: center;
    padding: 0.15rem 0.4rem;
    border: 0;
    border-radius: var(--hv-radius-control);
    background: transparent;
    color: var(--hv-color-fjord);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    text-decoration: underline;
    cursor: pointer;
  }

  .start:focus-visible,
  .confirm:focus-visible,
  .cancel:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .editor {
    display: grid;
    width: 100%;
    gap: 0.5rem;
    min-width: 0;
    margin: 0;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 0.4rem;
    background: var(--hv-color-snow-raised);
    animation: correction-reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  legend {
    padding: 0;
    color: var(--hv-color-basalt);
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .value-controls {
    display: grid;
    min-width: 0;
    gap: 0.4rem;
  }

  .note {
    display: grid;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 750;
  }

  .note input {
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    font: inherit;
    font-size: 0.8rem;
  }

  .outcome {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    line-height: 1.35;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .confirm {
    min-height: 2rem;
    padding: 0.3rem 0.85rem;
    border: 1px solid var(--hv-color-fjord);
    border-radius: 999px;
    background: var(--hv-color-fjord);
    color: var(--hv-color-snow-raised);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 850;
    cursor: pointer;
  }

  .confirm:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .cancel {
    display: inline-flex;
    min-height: 1.5rem;
    align-items: center;
    padding: 0.15rem 0.4rem;
    border: 0;
    background: transparent;
    color: var(--hv-color-fjord);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 800;
    text-decoration: underline;
    cursor: pointer;
  }

  /* Transform only, and deliberately no opacity: the editor is text-bearing, so fading it in
     would start its legend and choices at a 1:1 contrast ratio and climb through the whole
     duration. Words arrive at full contrast and move into place. Reduced motion is handled by
     --hv-motion-quick collapsing to zero rather than by an override here. */
  @keyframes correction-reveal {
    from {
      transform: translateY(-0.15rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
