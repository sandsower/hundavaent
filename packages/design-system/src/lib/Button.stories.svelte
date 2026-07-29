<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fn } from 'storybook/test';

  import Button from './Button.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Button',
    component: Button,
    tags: ['autodocs'],
    args: {
      onclick: fn()
    }
  });
</script>

<script lang="ts">
  // Story-local click counters: one per interactive story so each keeps its own count instead of
  // sharing a single instance-level value across the docs page.
  let neutralClicks = $state(0);
  let primaryClicks = $state(0);
  let committedClicks = $state(0);
  let pressedOn = $state(false);

  function clickLabel(count: number) {
    if (count === 0) return 'Clicked 0 times';
    if (count === 1) return 'Clicked 1 time';
    return `Clicked ${count} times`;
  }
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

<Story name="Neutral Interactive" args={{ intent: 'neutral' }}>
  {#snippet template(args)}
    <Button
      {...args}
      onclick={(event) => {
        neutralClicks++;
        args.onclick?.(event);
      }}
    >
      {clickLabel(neutralClicks)}
    </Button>
  {/snippet}
</Story>

<Story name="Primary Interactive" args={{ intent: 'primary' }}>
  {#snippet template(args)}
    <Button
      {...args}
      onclick={(event) => {
        primaryClicks++;
        args.onclick?.(event);
      }}
    >
      {clickLabel(primaryClicks)}
    </Button>
  {/snippet}
</Story>

<Story name="Committed Interactive" args={{ intent: 'committed' }}>
  {#snippet template(args)}
    <Button
      {...args}
      onclick={(event) => {
        committedClicks++;
        args.onclick?.(event);
      }}
    >
      {clickLabel(committedClicks)}
    </Button>
  {/snippet}
</Story>

<Story name="Pressed Interactive" args={{ pressed: false }}>
  {#snippet template(args)}
    <Button
      {...args}
      pressed={pressedOn}
      onclick={(event) => {
        pressedOn = !pressedOn;
        args.onclick?.(event);
      }}
    >
      {pressedOn ? 'Selected' : 'Not selected'}
    </Button>
  {/snippet}
</Story>
