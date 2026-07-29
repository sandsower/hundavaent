<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Tone = 'info' | 'verified' | 'attention' | 'error' | 'success';

  interface NoticeOwnProps {
    tone?: Tone;
    /** Which element Notice renders as. Call sites today are p/div/section/li - the codification
        keeps that call-site choice rather than fixing one element, unlike Status below (always a
        chip, always a span). */
    as?: string;
    /** Call-site hooks and non-conflicting utilities only - overriding a tone's border/background
        through this is unsupported (Tailwind resolves same-specificity utilities by stylesheet
        order, not class-attribute order); extend the tone map instead. */
    class?: string;
    children: Snippet;
  }

  // role and every other aria-* attribute stay on the rest spread rather than being named or
  // defaulted here: today's .hv-notice call sites decide their own role (status/alert/note, or
  // none at all for the plain "empty state" notices) and that stays caller-owned this phase - see
  // the contract note on WeeklyRhythmTrail/AuthDialog/SelectedPlaceCard's live-region usage.
  type Props = NoticeOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof NoticeOwnProps>;

  let { tone, as = 'div', class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of .hv-notice's shared rule (primitives.css:216-221): a 1px
  // border, the panel radius, and the panel padding. Border colour and background are deliberately
  // absent here - they come from toneClasses below as a single matched set, never layered on top
  // of this, for the same Tailwind same-specificity reason Button's base/intentClasses split calls
  // out.
  const base = 'border rounded-panel p-panel';

  // Each tone is a complete border/background(/text) set, not an override layered on the base
  // classes - see Button.svelte's intentClasses comment for why partial overrides are unsafe with
  // Tailwind's same-specificity resolution. Untoned (tone absent) mirrors .hv-notice's own
  // unqualified rule (border-subtle, fjord-soft) rather than being folded into `base`, so it stays
  // one complete entry alongside the rest instead of a special case.
  const toneClasses: Record<'untoned' | Tone, string> = {
    untoned: 'border-border-subtle bg-fjord-soft',
    info: 'border-fjord bg-fjord-soft',
    verified: 'border-basalt bg-signal-soft',
    // attention and error are pixel-identical in primitives.css (a single shared selector) - kept
    // as two complete entries here rather than aliased, so either tone name reads as first-class.
    attention: 'border-danger bg-danger-soft text-danger',
    error: 'border-danger bg-danger-soft text-danger',
    success: 'border-success bg-success-soft text-success'
  };

  const classes = $derived(
    [base, toneClasses[tone ?? 'untoned'], className].filter(Boolean).join(' ')
  );
</script>

<svelte:element this={as} class={classes} {...rest}>
  {@render children()}
</svelte:element>
