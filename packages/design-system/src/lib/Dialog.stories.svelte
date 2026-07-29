<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fn } from 'storybook/test';

  import Dialog from './Dialog.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Dialog',
    component: Dialog,
    tags: ['autodocs'],
    args: {
      onclose: fn(),
      oncancel: fn()
    }
  });
</script>

<script lang="ts">
  // Story-local open state for the interactive story below, kept separate from the static
  // per-size stories so pressing Escape in one never touches another - same story-local-state
  // convention as Button.stories.svelte's click counters.
  let interactiveOpen = $state(false);
</script>

<Story name="Compact" args={{ open: true, size: 'compact' }}>
  {#snippet template(args)}
    {@const { children: _ignored, labelledby: _ignoredLabelledby, ...rest } = args}
    <Dialog {...rest}>
      {#snippet title()}
        Compact dialog
      {/snippet}
      A dialog sized for a short confirmation - the narrowest of the four sizes, min(calc(100% - 2rem),
      30rem).
    </Dialog>
  {/snippet}
</Story>

<Story name="Standard" args={{ open: true, size: 'standard' }}>
  {#snippet template(args)}
    {@const { children: _ignored, labelledby: _ignoredLabelledby, ...rest } = args}
    <Dialog {...rest}>
      {#snippet title()}
        Standard dialog
      {/snippet}
      The default size for most dialogs - min(calc(100% - 2rem), 34rem).
    </Dialog>
  {/snippet}
</Story>

<Story name="Roomy" args={{ open: true, size: 'roomy' }}>
  {#snippet template(args)}
    {@const { children: _ignored, labelledby: _ignoredLabelledby, ...rest } = args}
    <Dialog {...rest}>
      {#snippet title()}
        Roomy dialog
      {/snippet}
      A wider dialog for forms with more fields - min(calc(100% - 2rem), 38rem).
    </Dialog>
  {/snippet}
</Story>

<Story name="Wide" args={{ open: true, size: 'wide' }}>
  {#snippet template(args)}
    {@const { children: _ignored, labelledby: _ignoredLabelledby, ...rest } = args}
    <Dialog {...rest}>
      {#snippet title()}
        Wide dialog
      {/snippet}
      The widest size, min(calc(100% - 2rem), 42rem) - for content that needs the most room.
    </Dialog>
  {/snippet}
</Story>

<Story name="Unpadded" args={{ open: true, unpadded: true }}>
  {#snippet template(args)}
    {@const { children: _ignored, labelledby: _ignoredLabelledby, ...rest } = args}
    <Dialog {...rest}>
      {#snippet title()}
        Unpadded dialog
      {/snippet}
      <div style="padding: 1rem; border-bottom: 1px solid var(--hv-border-subtle);">
        A sectioned layout that pads its own regions instead of taking Dialog's panel padding.
      </div>
      <div style="padding: 1rem;">Second section, padded independently of the first.</div>
    </Dialog>
  {/snippet}
</Story>

<!-- The one interactive story: a real trigger opens Dialog, and a Cancel button inside its body
     closes it, exactly the shape every real call site takes - Dialog owns no close chrome of its
     own (no built-in X button), so the body always supplies its own affordance. bind:open keeps
     the story's local state and Dialog's internal state in sync in both directions, the same
     controlled-open contract every consumer uses. -->
<Story name="Interactive Open/Close" args={{}}>
  {#snippet template(args)}
    {@const { children: _ignored, labelledby: _ignoredLabelledby, ...rest } = args}
    <button type="button" onclick={() => (interactiveOpen = true)}>Open dialog</button>
    <Dialog {...rest} bind:open={interactiveOpen} onclose={() => args.onclose?.()}>
      {#snippet title()}
        Delete this place?
      {/snippet}
      This can't be undone.
      <button type="button" onclick={() => (interactiveOpen = false)}>Cancel</button>
    </Dialog>
  {/snippet}
</Story>
