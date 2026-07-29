<script lang="ts">
  import { Field, Select } from '@hundavaent/design-system';
  import type { HTMLSelectAttributes } from 'svelte/elements';

  // Test-only composition of Field around Select: same rationale as FieldHarness.svelte -
  // exercising the context wiring between the two components needs a real Svelte parent. Unlike
  // FieldHarness's createRawSnippet callers, this is a real Svelte file, so the option children
  // are written as literal markup rather than built through a snippet.
  interface Props {
    label: string;
    hint?: string;
    error?: string | null;
    fieldClass?: string;
    selectProps?: HTMLSelectAttributes;
  }

  let { label, hint, error, fieldClass, selectProps = {} }: Props = $props();
</script>

<Field {label} {hint} {error} class={fieldClass}>
  <Select name="harness" {...selectProps}>
    <option value="apple">Apple</option>
    <option value="banana">Banana</option>
  </Select>
</Field>
