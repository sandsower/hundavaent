<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Textarea from './Textarea.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Textarea',
    component: Textarea,
    tags: ['autodocs']
  });
</script>

<!-- Standalone renders carry an aria-label: outside a Field nothing else names the control, and
     these stories model exactly that unwrapped usage. -->
<Story name="Default" args={{ 'aria-label': 'Notes' }} />

<Story
  name="With Value"
  args={{ 'aria-label': 'Notes', value: 'Great little coffee spot near the harbour.' }}
/>

<Story name="Disabled" args={{ 'aria-label': 'Unavailable', disabled: true, value: 'Read only' }} />

<Story name="Invalid" args={{ 'aria-label': 'Notes', 'aria-invalid': true, value: 'Too short' }} />
