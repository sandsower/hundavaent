<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Status from './Status.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Status',
    component: Status,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only: Status itself carries no copy. Every real .hv-status call site is an
     inline chip, so these stories are shown side by side the way a chip row reads in the app. -->

<Story name="Untoned">Pending</Story>

<Story name="Verified" args={{ tone: 'verified' }}>Verified</Story>

<!-- selected was a pixel-identical alias of verified in the retired legacy stylesheet - kept as
     its own Story so the redundancy is visible rather than hidden. -->
<Story name="Selected" args={{ tone: 'selected' }}>Selected</Story>

<Story name="Success" args={{ tone: 'success' }}>Approved</Story>

<Story name="Error" args={{ tone: 'error' }}>Rejected</Story>

<!-- attention was a pixel-identical alias of error in the retired legacy stylesheet - a
     knowingly-kept redundancy, shown as its own Story for the same reason. -->
<Story name="Attention" args={{ tone: 'attention' }}>Needs attention</Story>

<Story name="All Tones">
  {#snippet template()}
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <Status>Pending</Status>
      <Status tone="verified">Verified</Status>
      <Status tone="selected">Selected</Status>
      <Status tone="success">Approved</Status>
      <Status tone="error">Rejected</Status>
      <Status tone="attention">Needs attention</Status>
    </div>
  {/snippet}
</Story>
