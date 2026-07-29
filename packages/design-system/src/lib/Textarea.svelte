<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';
  import { consumeFieldContext, mergeDescribedby } from './field-context.js';

  interface TextareaOwnProps {
    /** Call-site hooks and non-conflicting layout utilities only - overriding a size/surface
        utility through this is unsupported, same as every other primitive's class prop. */
    class?: string;
    /** Declared here (not left to the native attribute set) so it is $bindable: shipped call
        sites drive textareas with bind:value, and a spread-through attribute cannot be bound. */
    value?: HTMLTextareaAttributes['value'];
  }

  // id and the two aria wiring attributes are destructured out of the spread so the field
  // context can own them when present: an explicit attribute written after {...rest} would
  // clobber a caller's value even when resolved to undefined, so they must not ride the spread.
  type Props = TextareaOwnProps & Omit<HTMLTextareaAttributes, keyof TextareaOwnProps>;

  let {
    class: className = '',
    value = $bindable(),
    id,
    'aria-describedby': describedby,
    'aria-invalid': ariaInvalid,
    ...rest
  }: Props = $props();

  const field = consumeFieldContext();

  // Inside a Field the field's id wins (the label points at it); standalone, the caller's own
  // id passes through untouched. Caller describedby merges after the field's ids rather than
  // being replaced. aria-invalid: the field's error state forces true; otherwise whatever the
  // caller set stands.
  const resolvedId = $derived(field?.controlId ?? id);
  const resolvedDescribedby = $derived(mergeDescribedby(field?.describedby, describedby));
  const resolvedInvalid = $derived(field?.invalid ? true : ariaInvalid);

  // Input's exact base string (see Input.svelte's comment for the full .hv-field derivation),
  // with two changes: min-h-control is replaced rather than joined by min-h-[6rem] - two
  // same-property utilities resolve by stylesheet order, not class-attribute order, so having
  // both in the list at once is not a safe way to express "this one wins" - and resize-y is
  // added, since a single-line control's fixed height is the wrong default for a multi-line one.
  // rounded-control still applies: the shipped textarea rides the same radius token as every
  // other control, baseline-first.
  const base =
    'w-full min-w-0 min-h-[6rem] resize-y border border-border-strong rounded-control bg-snow-raised px-[0.8rem] py-[0.55rem] text-basalt [font-family:inherit] [font-size:inherit] [line-height:inherit] placeholder:text-basalt-muted disabled:bg-snow disabled:text-basalt-muted aria-invalid:border-danger focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-focus-ring focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<textarea
  class={classes}
  {...rest}
  bind:value
  id={resolvedId}
  aria-describedby={resolvedDescribedby}
  aria-invalid={resolvedInvalid}
></textarea>
