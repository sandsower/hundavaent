<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { consumeFieldContext, mergeDescribedby } from './field-context.js';

  interface InputOwnProps {
    /** Call-site hooks and non-conflicting layout utilities only - overriding a size/surface
        utility through this is unsupported, same as every other primitive's class prop. */
    class?: string;
    /** Declared here (not left to the native attribute set) so it is $bindable: shipped call
        sites drive inputs with bind:value, and a spread-through attribute cannot be bound. */
    value?: HTMLInputAttributes['value'];
  }

  // id and the two aria wiring attributes are destructured out of the spread so the field
  // context can own them when present: an explicit attribute written after {...rest} would
  // clobber a caller's value even when resolved to undefined, so they must not ride the spread.
  type Props = InputOwnProps & Omit<HTMLInputAttributes, keyof InputOwnProps>;

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

  // The exact utility codification of the retired legacy .hv-field primitive: full width, the
  // control min-height, the 1px strong border, the control radius, the raised surface, and the
  // field padding. The font triple is named individually for the same reason as Button's base.
  // Net-new states .hv-field never had: muted placeholder ink, a muted disabled treatment, and
  // the danger border while aria-invalid - all token-referencing, so mode retunes flow through.
  // The focus ring is not declared here - theme.css's global `@layer base` rule is the single
  // owner for the app and Storybook alike.
  const base =
    'w-full min-w-0 min-h-control border border-border-strong rounded-control bg-snow-raised px-[0.8rem] py-[0.55rem] text-basalt [font-family:inherit] [font-size:inherit] [line-height:inherit] placeholder:text-basalt-muted disabled:bg-snow disabled:text-basalt-muted aria-invalid:border-danger';

  const classes = $derived([base, className].filter(Boolean).join(' '));
</script>

<input
  class={classes}
  {...rest}
  bind:value
  id={resolvedId}
  aria-describedby={resolvedDescribedby}
  aria-invalid={resolvedInvalid}
/>
