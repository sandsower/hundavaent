<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Notice from './Notice.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Notice',
    component: Notice,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only: Notice itself carries no copy, so these strings exist purely to show
     the tone-matrix look, mirroring real .hv-notice call sites (loading/empty states, form errors,
     save confirmations, sign-in gates) surveyed across the app. -->

<Story name="Untoned">Translations for this place are still being reviewed.</Story>

<Story name="Info" args={{ tone: 'info' }}>Loading place details…</Story>

<Story name="Verified" args={{ tone: 'verified' }}>
  This place has been verified by a moderator.
</Story>

<Story name="Attention" args={{ tone: 'attention' }}>
  Some fields could not be validated before publishing.
</Story>

<Story name="Error" args={{ tone: 'error' }}>Something went wrong. Please try again.</Story>

<Story name="Success" args={{ tone: 'success' }}>Your changes were saved.</Story>

<!-- The `as` prop in practice: real call sites render .hv-notice on p, div, section, and li
     depending on context (a status paragraph, a disclosure section, a list row). -->
<Story name="As Paragraph" args={{ as: 'p', tone: 'info' }}>Rendered as a paragraph.</Story>

<Story name="As Section" args={{ as: 'section', tone: 'attention' }}>Rendered as a section.</Story>

<Story name="As List Item" args={{ as: 'li', tone: 'success' }}>Rendered as a list item.</Story>

<!-- Role is deliberately caller-owned this phase (see Notice.svelte's contract comment): a Story
     showing a caller supplying role="alert" the way AuthDialog/RoundupPreferencesForm/the suggest
     flow do today for their error notices. -->
<Story name="Alert (caller-owned role)" args={{ tone: 'error', role: 'alert' }}>
  Caller-supplied role="alert" lands on the element via the rest spread.
</Story>
