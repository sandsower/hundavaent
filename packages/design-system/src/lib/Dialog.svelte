<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';

  type Size = 'compact' | 'standard' | 'roomy' | 'wide';

  // Exactly one of title/labelledby is required, and the type system carries that: `title` covers
  // the default case (moderation dialogs, AchievementShare) where Dialog owns the labelling
  // element and derives its id from $props.id(). `labelledby` exists for a caller whose own
  // markup already contains the element that should label the dialog - AuthDialog's h2 sits mid-
  // content below an eyebrow line and swaps between two states, so it cannot be lifted into a
  // title snippet rendered first without reordering its DOM. In that case Dialog renders no title
  // container of its own and simply points aria-labelledby at the id the caller supplies.
  type TitleProps = { title: Snippet; labelledby?: never } | { labelledby: string; title?: never };

  type DialogOwnProps = {
    open: boolean;
    /** Body content. */
    children: Snippet;
    size?: Size;
    /** Padded (the default) uses the standard panel padding; unpadded strips it to 0 for
        consumers with their own sectioned layout that pads internally. */
    unpadded?: boolean;
    /** Call-site hooks and non-conflicting layout utilities only. Overriding a size/padding/shell
        utility through this is unsupported - Tailwind resolves same-specificity utilities by
        stylesheet order, not class-attribute order, so "later in the attribute" does not win. */
    class?: string;
    /** Fires exactly once on every open -> false transition while the component is alive
        (Escape via the no-oncancel branch, or a programmatic flip from the caller). State-driven,
        not wired to the native `close` event, so it fires deterministically no matter which of
        those paths got there. Deliberately NOT fired when the parent unmounts Dialog while open:
        a destroyed consumer's callbacks must not run against torn-down surroundings (AuthDialog's
        onclose does router work), and native <dialog> removal fires nothing either - cleanup that
        must survive destruction belongs in the consumer's own teardown, not here. */
    onclose?: () => void;
    /** Escape is always intercepted (preventDefault runs unconditionally). Supplying oncancel
        hands the decision to the caller: it is called and nothing else happens here - every
        existing call site flips its own state. Omit it to let Dialog close itself, which fires
        onclose the same as any other close path. */
    oncancel?: () => void;
  } & TitleProps;

  // Native attributes not owned above (data-*, aria-*, id, ...) spread through onto the <dialog>
  // untouched. `open` is intersection-Omit'd because it is the bindable prop above, not the raw
  // boolean attribute - showModal()/close() drive the element, not the `open` attribute directly.
  // `title` is Omit'd because HTMLAttributes' native tooltip `title: string` is shadowed by this
  // component's own Snippet-typed `title`, the same deliberate-shadow idiom as Button's onclick.
  // aria-labelledby and aria-label are Omit'd too: labelling is exclusively the title-XOR-
  // labelledby contract above, and letting either through the spread would be silently discarded
  // (aria-labelledby) or silently outranked by it per the accname spec (aria-label).
  type Props = DialogOwnProps &
    Omit<HTMLDialogAttributes, keyof DialogOwnProps | 'aria-labelledby' | 'aria-label'>;

  let {
    open = $bindable(),
    title,
    labelledby,
    children,
    size = 'standard',
    unpadded = false,
    class: className = '',
    onclose,
    oncancel,
    ...rest
  }: Props = $props();

  const generatedTitleId = $props.id();
  const titleId = $derived(labelledby ?? generatedTitleId);

  let dialogElement = $state<HTMLDialogElement>();
  let returnFocusElement: HTMLElement | null = null;

  function handleCancel(event: Event): void {
    // Always intercepted: the browser's default is to close on Escape's cancel event before we
    // get a say, so preventDefault runs unconditionally and every other decision happens after.
    event.preventDefault();
    if (oncancel) {
      oncancel();
      return;
    }
    open = false;
  }

  // Mount/teardown, not an open-watching effect: the {#if open} block below is what mounts and
  // unmounts the <dialog> element, so this effect's own setup/teardown run exactly once per open
  // transition. NOTE Svelte detaches the element BEFORE this teardown runs (destroy_effect removes
  // the branch DOM first, then executes effect teardowns), so dialog.close() here operates on an
  // already-orphaned node and the browser's own focus restoration never fires - the manual
  // returnFocusElement restore below is therefore LOAD-BEARING, not belt-and-braces; the close()
  // call is kept only as a defensive no-op for any future ordering change.
  $effect(() => {
    const dialog = dialogElement;
    if (!dialog) return;

    returnFocusElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
      const target = returnFocusElement;
      returnFocusElement = null;
      queueMicrotask(() => {
        if (target?.isConnected) target.focus();
      });
    };
  });

  // onclose announcement, separate from the mount effect above so it is state-driven without
  // being destruction-driven: effects re-run on open's transitions while the component lives but
  // never on parent teardown, which is exactly the contract - Escape's self-close and a caller's
  // programmatic flip both announce; unmounting an open Dialog does not (see the onclose prop
  // comment). wasOpen is deliberately a plain variable, not $state: it is bookkeeping read and
  // written only inside this effect, and the effect's only dependency is `open` itself.
  let wasOpen = false;
  $effect(() => {
    if (open) {
      wasOpen = true;
      return;
    }
    if (wasOpen) {
      wasOpen = false;
      onclose?.();
    }
  });

  // Each size is a complete inline-size expression, not an override layered on a shared base -
  // see Button's intentClasses comment for why partial pairs are unsafe with Tailwind's
  // stylesheet-position-based resolution. inline-size (not width) so this respects writing mode,
  // matching the logical-property idiom the rest of the theme is built on.
  const sizeClasses: Record<Size, string> = {
    compact: '[inline-size:min(calc(100%_-_2rem),_30rem)]',
    standard: '[inline-size:min(calc(100%_-_2rem),_34rem)]',
    roomy: '[inline-size:min(calc(100%_-_2rem),_38rem)]',
    wide: '[inline-size:min(calc(100%_-_2rem),_42rem)]'
  };

  // Panel look, codified exactly like Button's `base`: border, radius, surface, shadow, and a
  // centred position via margin auto. Deliberately no z-index and no position/inset of our own -
  // showModal()'s top layer already stacks and centres the element; adding either here would
  // fight or duplicate what the browser already does.
  const base =
    'm-auto border border-border-strong rounded-panel bg-snow-raised text-inherit shadow-raised';

  const classes = $derived(
    [base, sizeClasses[size], unpadded ? 'p-0' : 'p-panel', className].filter(Boolean).join(' ')
  );
</script>

{#if open}
  <dialog
    class={classes}
    {...rest}
    aria-labelledby={titleId}
    oncancel={handleCancel}
    bind:this={dialogElement}
  >
    {#if title}
      <div id={generatedTitleId}>{@render title()}</div>
    {/if}
    {@render children()}
  </dialog>
{/if}

<style>
  /* The one dialog backdrop (tokens.css's --hv-color-scrim comment): every modal surface dims
     the page with this exact veil, never restating its own value. */
  dialog::backdrop {
    background: var(--hv-color-scrim);
    backdrop-filter: blur(2px);
  }

  /* The dialog is full of text, so its arrival is transform-only: words land at full contrast
     and move into place rather than fading in (tokens.css's fade-family limit - fading opacity
     or an inverting colour pair on text both measured below WCAG 1.4.3 on this codebase).
     translate/scale as their own properties, not the transform shorthand: Tailwind v4 emits
     translate/scale/rotate as independent properties, and a transform shorthand here would fight
     rather than compose with any of those utilities landing on the same element. The motion
     token collapses to 0ms under reduced motion (tokens.css), so no media query is needed here. */
  dialog[open] {
    animation: dialog-in var(--hv-motion-quick) var(--hv-ease-settle);
  }

  @keyframes dialog-in {
    from {
      translate: 0 0.4rem;
      scale: 0.985;
    }
  }

  /* Reproduces AuthDialog's mobile-sheet block (src/lib/auth/AuthDialog.svelte, the @media
     (max-width: 42rem) rule) so a Dialog consumer gets the exact same bottom-anchored, edge-
     inset sheet geometry that tests/component/auth-dialog.browser.test.ts:147 pins at 390x844 -
     16px left/right, 0 inline margin, and a safe-area-aware bottom margin. Left/right (not
     inline-start/end) and width/max-width (not inline-size) to match that block literally; the
     scoped style here is unlayered, so it overrides the layered Tailwind size utility above
     regardless of the property-name difference. */
  @media (max-width: 42rem) {
    dialog {
      left: 1rem;
      right: 1rem;
      width: auto;
      max-width: none;
      margin: auto 0 max(1rem, env(safe-area-inset-bottom));
    }
  }
</style>
