<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Button from './Button.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Button',
    component: Button,
    tags: ['autodocs']
  });
</script>

<Story name="Neutral" args={{ intent: 'neutral' }}>Neutral</Story>

<Story name="Primary" args={{ intent: 'primary' }}>Primary</Story>

<Story name="Committed" args={{ intent: 'committed' }}>Committed</Story>

<Story name="Pressed On" args={{ pressed: true }}>Selected</Story>

<Story name="Pressed Off" args={{ pressed: false }}>Not selected</Story>

<Story name="Disabled" args={{ disabled: true }}>Disabled</Story>

<Story name="Busy" args={{ 'aria-busy': true }}>Saving</Story>

<Story name="Link" args={{ href: '#' }}>Go to place</Story>

<Story name="Icon Only" args={{ 'aria-label': 'Add to favorites' }}>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
      fill="currentColor"
    />
  </svg>
</Story>

<Story name="Submit Type" args={{ type: 'submit' }}>Save changes</Story>
