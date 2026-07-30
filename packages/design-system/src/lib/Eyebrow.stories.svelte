<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Eyebrow from './Eyebrow.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Eyebrow',
    component: Eyebrow,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only: the small tracked-out uppercase kicker that opens headers, cards, and
     sections. -->

<Story name="Eyebrow">Hundavænt</Story>

<!-- as in practice: the achievements page renders group headings as h3 eyebrows; summaries use
     span. -->
<Story name="As heading" args={{ as: 'h3' }}>Exploration achievements</Story>

<Story name="As span" args={{ as: 'span' }}>Place details</Story>
