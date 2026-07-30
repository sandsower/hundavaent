<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PageTitle from './PageTitle.svelte';

  const { Story } = defineMeta({
    title: 'Design System/PageTitle',
    component: PageTitle,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only. The display serif at its viewport clamp; the 18ch cap wraps long
     Icelandic titles rather than running the measure. -->

<Story name="Page title">Hundavænt places</Story>

<Story name="Long title wraps at 18ch">Staðir sem taka vel á móti hundum</Story>

<Story name="As h2" args={{ as: 'h2' }}>A sub-surface heading</Story>
