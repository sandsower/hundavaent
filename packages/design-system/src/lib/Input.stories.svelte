<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Input from './Input.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Input',
    component: Input,
    tags: ['autodocs']
  });
</script>

<!-- Standalone renders carry an aria-label: outside a Field nothing else names the control, and
     these stories model exactly that unwrapped usage (search boxes, toolbar filters). -->
<Story name="Default" args={{ 'aria-label': 'Name of the place' }} />

<Story
  name="With Placeholder"
  args={{ 'aria-label': 'Search places', placeholder: 'Search places' }}
/>

<Story name="With Value" args={{ 'aria-label': 'Name of the place', value: 'Kaffihúsið' }} />

<Story name="Disabled" args={{ 'aria-label': 'Unavailable', disabled: true, value: 'Read only' }} />

<Story
  name="Invalid"
  args={{ 'aria-label': 'Email', 'aria-invalid': true, value: 'not-an-email' }}
/>

<Story name="Email" args={{ 'aria-label': 'Email', type: 'email' }} />

<Story name="Password" args={{ 'aria-label': 'Password', type: 'password' }} />
