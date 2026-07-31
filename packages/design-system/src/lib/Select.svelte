<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import { consumeFieldContext, mergeDescribedby } from './field-context.js';

  interface SelectOwnProps {
    /** Call-site hooks and non-conflicting layout utilities only - overriding a size/surface
        utility through this is unsupported, same as every other primitive's class prop. */
    class?: string;
    /** Declared here (not left to the native attribute set) so it is $bindable: shipped call
        sites drive selects with bind:value, and a spread-through attribute cannot be bound. */
    value?: HTMLSelectAttributes['value'];
    /** The caller's <option> (and <optgroup>) elements. Required, not optional: an empty select
        is never a real call site, unlike Field's control-agnostic children. */
    children: Snippet;
  }

  // id and the two aria wiring attributes are destructured out of the spread so the field
  // context can own them when present: an explicit attribute written after {...rest} would
  // clobber a caller's value even when resolved to undefined, so they must not ride the spread.
  type Props = SelectOwnProps & Omit<HTMLSelectAttributes, keyof SelectOwnProps>;

  let {
    class: className = '',
    value = $bindable(),
    children,
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
  // minus placeholder:text-basalt-muted - a select has no placeholder to style. w-full min-w-0
  // stays: it matches .hv-field on selects today the same as it does on inputs. No
  // appearance-none and no custom chevron here - the native dropdown indicator stays, on purpose:
  // baseline-first migration ships the browser's own affordance rather than a bespoke one, and
  // revisiting that is a deliberate later call, not an oversight in this primitive.
  const base =
    'w-full min-w-0 min-h-control border border-border-strong rounded-control bg-snow-raised px-[0.8rem] py-[0.55rem] text-basalt [font-family:inherit] [font-size:inherit] [line-height:inherit] disabled:bg-snow disabled:text-basalt-muted aria-invalid:border-danger';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<select
  class={classes}
  {...rest}
  bind:value
  id={resolvedId}
  aria-describedby={resolvedDescribedby}
  aria-invalid={resolvedInvalid}
>
  {@render children()}
</select>
