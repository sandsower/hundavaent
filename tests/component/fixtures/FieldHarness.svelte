<script lang="ts">
  import { Field, Input } from '@hundavaent/design-system';
  import type { HTMLInputAttributes } from 'svelte/elements';

  // Test-only composition of Field around Input: createRawSnippet can only render literal HTML,
  // so exercising the context wiring between the two components needs a real Svelte parent.
  interface Props {
    label: string;
    hint?: string;
    error?: string | null;
    fieldClass?: string;
    // class is omitted: Input's own class prop is the narrower hooks-only string, and spreading
    // the full native attribute map (whose class is ClassValue | null) fails to satisfy it.
    inputProps?: Omit<HTMLInputAttributes, 'class'>;
  }

  let { label, hint, error, fieldClass, inputProps = {} }: Props = $props();
</script>

<Field {label} {hint} {error} class={fieldClass}>
  <Input name="harness" {...inputProps} />
</Field>
