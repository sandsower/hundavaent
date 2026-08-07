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
   *
   * The focus round-trip covers the shell's own lifetime only - expand, cancel, and every outcome
   * that leaves the affordance standing. A successful send is the one exit it cannot own: the
   * parent replaces the whole affordance with a pending line, so the trigger this shell would
   * return focus to no longer exists by the time it could. The parent that renders the pending
   * line owns focus from that moment on, and every parent that swaps an affordance out must move
   * focus itself or drop the Member on `body`.
   */
  interface Props {
    copy: Catalogue;
    /** Already interpolated, because only the editor knows which fact it is correcting. */
    startLabel: string;
    /**
     * The trigger's visible words. WCAG 2.5.3 makes `startLabel` a superset of this, so an
     * affordance that renames one must rename both.
     */
    startText?: string;
    /** What the fieldset is for. A Report confirms a claim rather than choosing a value. */
    legend?: string;
    signedIn: boolean;
    /** The editor's own unchanged test. The server repeats it against the stored value. */
    canSend: boolean;
    /** Called on every expand so the editor can reseed from the currently published value. */
    onOpen?: () => void;
    send: (note: string | null) => Promise<CorrectionResult>;
    /**
     * Absent for an affordance whose whole claim is its trigger: a place-level Report alleges
     * rather than proposes, so it has no value to edit and the note is the only field there is.
     */
    controls?: Snippet<[{ dismiss: (event: KeyboardEvent) => void; groupName: string }]>;
    announce?: (message: string) => void;
  }

  let {
    copy,
    startLabel,
    startText,
    legend,
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
  let noteInput = $state<HTMLInputElement>();
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

  // Focus follows the disclosure in both directions for as long as the disclosure exists, so
  // keyboard focus is never left on a node that has just been removed. The `trigger` half is a
  // no-op after a successful send, because the parent has already unmounted the trigger by then
  // and owns focus instead; see the contract on `Props` above.
  //
  // The checked option is the entry point, as in any radio group; the first control is only a
  // fallback for a value the editor's group cannot represent.
  //
  // The search is scoped to the value controls rather than to the whole fieldset. The note is the
  // last control in the fieldset and the optional one, so a query over the fieldset would land on
  // it the moment an editor rendered no matching control, and the Member would be typing a note
  // before ever seeing the fact they came to correct.
  //
  // An affordance with no value controls at all is the one case where the note is where focus
  // belongs: there is no fact to see, because the claim was made by the trigger.
  $effect(() => {
    if (focusTarget === 'editor' && editor) {
      if (controls) {
        const region = valueControls ?? editor;
        (
          region.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
          region.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea, select')
        )?.focus();
      } else {
        noteInput?.focus();
      }
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

<div class="inline-correction grid justify-items-start mt-[0.45rem]">
  {#if open}
    <fieldset
      bind:this={editor}
      class="editor grid w-full min-w-0 gap-2 m-0 py-[0.6rem] px-[0.7rem] border border-border-subtle rounded-[0.4rem] bg-snow-raised"
      aria-labelledby={`${componentId}-legend`}
    >
      <legend
        id={`${componentId}-legend`}
        class="p-0 text-[0.72rem] font-[850] tracking-[0.05em] uppercase text-basalt"
      >
        {legend ?? copy['inlineCorrection.legend']}
      </legend>
      <!-- The value the Member came to change always precedes the note, in DOM order and in the
           tab order, because the note is the optional afterthought and the value is the point. -->
      {#if controls}
        <div bind:this={valueControls} class="value-controls grid min-w-0 gap-[0.4rem]">
          {@render controls({ dismiss, groupName: `${componentId}-choice` })}
        </div>
      {/if}

      <label class="note grid gap-1 text-[0.75rem] font-[750]">
        <span>{copy['inlineCorrection.note']}</span>
        <input
          bind:this={noteInput}
          type="text"
          maxlength={memberNoteMaximumLength}
          bind:value={note}
          autocomplete="off"
          onkeydown={dismiss}
          class="w-full py-[0.4rem] px-2 border border-border-subtle rounded-control [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-weight:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.8rem]"
        />
      </label>

      {#if outcomeMessage}
        <p
          class="outcome m-0 text-[0.75rem] leading-[1.35] text-basalt-muted"
          data-correction-outcome
        >
          {outcomeMessage}
        </p>
      {/if}

      <div class="actions flex items-center gap-2">
        <button
          class="confirm min-h-8 py-[0.3rem] px-[0.85rem] border border-fjord rounded-[999px] bg-fjord [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.78rem] font-[850] text-snow-raised cursor-pointer focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px] disabled:cursor-not-allowed disabled:opacity-[0.55]"
          type="button"
          disabled={!canSend || sending}
          onclick={() => void confirm()}
          onkeydown={dismiss}
        >
          {sending ? copy['inlineCorrection.sending'] : copy['inlineCorrection.confirm']}
        </button>
        <button
          class="cancel inline-flex min-h-6 items-center py-[0.15rem] px-[0.4rem] border-0 bg-transparent [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.75rem] font-extrabold text-fjord underline cursor-pointer focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
          type="button"
          onclick={collapse}
          onkeydown={dismiss}
        >
          {copy['inlineCorrection.cancel']}
        </button>
      </div>
    </fieldset>
  {:else}
    <!-- The entry point into the whole feature sits directly under the access chips, so it needs a
         target a thumb can hit without toggling a chip. 1.5rem clears the WCAG 2.5.8 24px minimum. -->
    <button
      bind:this={trigger}
      class="start inline-flex min-h-6 items-center py-[0.15rem] px-[0.4rem] border-0 rounded-control bg-transparent [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.72rem] font-extrabold text-fjord underline cursor-pointer focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
      type="button"
      aria-label={startLabel}
      onclick={expand}
    >
      {startText ?? copy['inlineCorrection.start']}
    </button>
  {/if}
</div>

<style>
  /* Transform only, and deliberately no opacity: the editor is text-bearing, so fading it in
     would start its legend and choices at a 1:1 contrast ratio and climb through the whole
     duration. Words arrive at full contrast and move into place. Reduced motion is handled by
     --hv-motion-quick collapsing to zero rather than by an override here. */
  .editor {
    animation: correction-reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  @keyframes correction-reveal {
    from {
      transform: translateY(-0.15rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
