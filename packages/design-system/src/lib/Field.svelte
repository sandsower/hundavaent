<script lang="ts">
  import type { Snippet } from 'svelte';
  import { provideFieldContext } from './field-context.js';

  interface Props {
    /** Visible label copy. Components carry no copy of their own - this arrives from the
        caller's copy source, already localized. */
    label: string;
    /** Guidance shown below the control, wired to it via aria-describedby. */
    hint?: string;
    /** Field-level problem, rendered in the danger ink below the hint and wired via both
        aria-describedby and aria-invalid on the control. No live region here on purpose: the
        form-level Notice with role="alert" stays the announcement channel, exactly as shipped
        surfaces behave today. */
    error?: string | null;
    /** Call-site hooks and non-conflicting layout utilities only - the same contract as every
        other primitive's class prop. */
    class?: string;
    /** The control - exactly one. Input/Textarea/Select pick up this field's id/describedby/
        invalid wiring through context automatically; anything else (a file input, a custom
        picker) can be wired by hand against the ids visible in the rendered markup. Two
        context-consuming controls under one Field is unsupported: both would resolve the same
        controlId (duplicate DOM ids, label associated with the first only). A caller-supplied
        id on the wrapped control is silently overridden by the field's own - external
        references must target the Field-generated id, or the control belongs outside a Field. */
    children: Snippet;
  }

  let { label, hint, error, class: className = '', children }: Props = $props();

  const uid = $props.id();
  const controlId = `${uid}-control`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;

  // Hint before error, stable order: a screen reader hears the guidance, then the problem.
  const describedby = $derived(
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  );
  const invalid = $derived(Boolean(error));

  provideFieldContext({
    controlId,
    get describedby() {
      return describedby;
    },
    get invalid() {
      return invalid;
    }
  });

  // The label -> control stack, codifying label.hv-stack's grid + context gap. The label itself
  // carries no weight or size utility: Regime-A public forms render labels at body weight today
  // and baseline-first migration keeps that; a surface with a deliberately heavier label keeps
  // it via its own scoped hook, not through this primitive.
  // min-w-0 because Fields sit as items in columned grids (the correction form's paired-name
  // rows): a grid item's default min-width of auto lets one long unbreakable label word push
  // the item past its track, which the old .hv-grid > * { min-width: 0 } rule prevented.
  const classes = $derived(['grid gap-context min-w-0', className].filter(Boolean).join(' '));
</script>

<div class={classes}>
  <label for={controlId}>{label}</label>
  {@render children()}
  {#if hint}
    <!-- Keep the zero margin explicit as part of Field's spacing contract, including when the
         component is rendered in isolation without the package stylesheet. Sized to .hv-meta,
         the de-facto hint treatment on shipped surfaces. -->
    <p id={hintId} class="m-0 text-[0.9rem] leading-[1.5] text-basalt-muted">{hint}</p>
  {/if}
  {#if error}
    <p id={errorId} class="m-0 text-[0.9rem] leading-[1.5] font-bold text-danger">{error}</p>
  {/if}
</div>
