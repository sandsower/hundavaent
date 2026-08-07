<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLFieldsetAttributes } from 'svelte/elements';

  interface FormSectionOwnProps {
    /** Rendered as a plain <legend>, first inside the fieldset when given. The shared semantic
        baseline preserves the native geometry explicitly, with no local utilities layered on. */
    legend?: string;
    /** Call-site hooks and non-conflicting layout utilities only - the same contract as every
        other primitive's class prop. */
    class?: string;
    children: Snippet;
  }

  // Everything not owned above spreads onto the fieldset untouched - notably `disabled`, the
  // shipped disable-gate pattern: a native fieldset's disabled attribute disables every control
  // nested inside it, so a caller gets the whole-section gate for free rather than having to
  // thread disabled through each field individually.
  type Props = FormSectionOwnProps & Omit<HTMLFieldsetAttributes, keyof FormSectionOwnProps>;

  let { legend, class: className = '', children, ...rest }: Props = $props();

  // The exact utility codification of the retired legacy .hv-form-section.hv-panel pair: the
  // grid + panel gap, the panel padding, the 1px subtle border, the panel radius, the raised
  // surface, and the raised shadow.
  const classes = $derived(
    [
      'grid min-w-0 gap-panel p-panel border border-border-subtle rounded-panel bg-snow-raised shadow-raised',
      className
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- No margin reset on the fieldset itself: the shared semantic baseline codifies the small
     inline margins these sections rendered before preflight, preserving pixel parity. -->
<fieldset class={classes} {...rest}>
  {#if legend}
    <legend>{legend}</legend>
  {/if}
  {@render children()}
</fieldset>
