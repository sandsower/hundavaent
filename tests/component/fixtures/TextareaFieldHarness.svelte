<script lang="ts">
  import { Field, Textarea } from '@hundavaent/design-system';
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  // Test-only composition of Field around Textarea: same rationale as FieldHarness.svelte -
  // exercising the context wiring between the two components needs a real Svelte parent.
  interface Props {
    label: string;
    hint?: string;
    error?: string | null;
    fieldClass?: string;
    textareaProps?: Omit<HTMLTextareaAttributes, 'class'>;
  }

  let { label, hint, error, fieldClass, textareaProps = {} }: Props = $props();
</script>

<Field {label} {hint} {error} class={fieldClass}>
  <Textarea name="harness" {...textareaProps} />
</Field>
