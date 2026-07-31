<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Tone = 'verified' | 'selected' | 'success' | 'error' | 'attention';

  interface StatusOwnProps {
    tone?: Tone;
    /** Call-site hooks and non-conflicting utilities only - overriding a tone's background/text
        through this is unsupported (Tailwind resolves same-specificity utilities by stylesheet
        order, not class-attribute order); extend the tone map instead. */
    class?: string;
    children: Snippet;
  }

  // Status is always a chip: unlike Notice it renders a fixed <span>, matching every call site
  // surveyed (inline status/verification chips), so there is no `as` prop here.
  type Props = StatusOwnProps & Omit<HTMLAttributes<HTMLSpanElement>, keyof StatusOwnProps>;

  let { tone, class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of the retired legacy .hv-status primitive's shared rule:
  // inline chip layout, the 1px strong border, the control radius, the fixed 0.3rem/0.5rem block/inline
  // padding, the 0.75rem size, and weight 800. Background and text colour are deliberately absent
  // here - they come from toneClasses below as a single matched set, never layered on top, for the
  // same Tailwind same-specificity reason Button's base/intentClasses split calls out.
  const base =
    'inline-block border border-border-strong rounded-control px-[0.5rem] py-[0.3rem] text-[0.75rem] font-extrabold';

  // Each tone is a complete background/text pair, not an override layered on the base classes -
  // see Button.svelte's intentClasses comment for why partial overrides are unsafe with Tailwind's
  // same-specificity resolution. Untoned (tone absent) mirrors .hv-status's own unqualified rule
  // (fjord-soft, no text colour override) rather than being folded into `base`.
  const toneClasses: Record<'untoned' | Tone, string> = {
    untoned: 'bg-fjord-soft',
    // verified and selected were pixel-identical in the retired legacy stylesheet (a single
    // shared selector) - kept as two complete entries here rather than aliased, so either tone
    // name reads as first-class.
    verified: 'bg-signal text-basalt',
    selected: 'bg-signal text-basalt',
    success: 'bg-success-soft text-success',
    // error and attention were also pixel-identical in the retired legacy stylesheet - a
    // knowingly-kept redundancy (two separate selectors resolving to the same declarations),
    // pinned rather than collapsed so the codification stays a faithful mirror of the source.
    error: 'bg-danger-soft text-danger',
    attention: 'bg-danger-soft text-danger'
  };

  const classes = $derived(
    [base, toneClasses[tone ?? 'untoned'], className].filter(Boolean).join(' ')
  );
</script>

<span class={classes} {...rest}>
  {@render children()}
</span>
