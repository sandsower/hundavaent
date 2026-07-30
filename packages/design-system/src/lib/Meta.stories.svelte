<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Meta from './Meta.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Meta',
    component: Meta,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only: the muted supporting line under titles, on cards, and beside
     controls. -->

<Story name="Meta">Checked in 3 times · Last visit in May</Story>

<Story name="As small" args={{ as: 'small' }}>Saved before check-ins existed.</Story>

<Story name="As div (wrapping richer content)" args={{ as: 'div' }}>
  Enter coordinates directly if the search cannot find the place.
</Story>
