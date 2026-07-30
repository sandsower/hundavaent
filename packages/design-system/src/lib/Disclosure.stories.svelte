<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Disclosure from './Disclosure.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Disclosure',
    component: Disclosure,
    tags: ['autodocs']
  });
</script>

<script lang="ts">
  // Story-local element ref for the interactive story below, the same story-local-state
  // convention as Button.stories.svelte's click counters and Dialog.stories.svelte's open state -
  // this one exercises the element-ref contract (bind the real <details>, read `.open` off it)
  // rather than a bindable prop, since Disclosure deliberately has none (see Disclosure.svelte's
  // own comment on why).
  let detailsElement = $state<HTMLDetailsElement>();
  let isOpen = $state(false);
</script>

<!-- The one story: a real SelectedPlaceCard-shaped disclosure - a summary row a caller supplies
     content for, and a body shown while open. There is only one Default variant because
     Disclosure has no variant axis of its own (no tone, no size); the interesting behaviour is
     the open/closed toggle and the element ref, both demonstrated here rather than split across
     stories. -->
<Story name="Default" args={{}}>
  {#snippet template(args)}
    {@const { children: _ignored, summary: _ignoredSummary, ...rest } = args}
    <Disclosure
      {...rest}
      bind:element={detailsElement}
      ontoggle={() => (isOpen = detailsElement?.open ?? false)}
    >
      {#snippet summary()}
        <span>Practical details</span>
      {/snippet}
      <div style="display: grid; gap: 0.6rem; padding-block: 0.2rem;">
        <p>Leashed access only between 08:00 and 20:00.</p>
        <p>Off-leash areas are fenced and require a valid membership tag.</p>
      </div>
    </Disclosure>
    <p>{isOpen ? 'Open' : 'Closed'}</p>
  {/snippet}
</Story>
