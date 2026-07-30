<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Button from './Button.svelte';
  import Eyebrow from './Eyebrow.svelte';
  import Meta from './Meta.svelte';
  import PageHeader from './PageHeader.svelte';
  import PageTitle from './PageTitle.svelte';

  const { Story } = defineMeta({
    title: 'Design System/PageHeader',
    component: PageHeader,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only. Children sit directly in the header - no heading-group wrapper - and
     every band is one gap-panel apart: this is the resolved 16px rhythm the old flat (8px) and
     wrapped (16px) header variants split over. -->

<Story name="Eyebrow, title, intro">
  <Eyebrow>Hundavænt</Eyebrow>
  <PageTitle>Your places</PageTitle>
  <Meta>Every place you have saved, checked in to, or suggested.</Meta>
</Story>

<Story name="With an action band">
  <Eyebrow>Suggest a place</Eyebrow>
  <PageTitle>Add somewhere new</PageTitle>
  <Meta>Tell other Members about a place that welcomes dogs.</Meta>
  <!-- The action cluster recipe: flex flex-wrap items-center gap-actions. A recipe rather than a
       component because the same cluster appears on nav tabs and card action rows, where a
       wrapper would block class: directives and semantic elements. -->
  <div class="flex flex-wrap items-center gap-actions">
    <Button intent="primary">My suggestions</Button>
    <Button>Back to places</Button>
  </div>
</Story>

<Story name="Title only">
  <PageTitle>Terms of use</PageTitle>
</Story>
