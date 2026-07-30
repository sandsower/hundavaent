<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Panel from './Panel.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Panel',
    component: Panel,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only: the raised surface that carries cards, empty states, heroes, and
     toolbars. Unpadded by default - most call sites own their inset; padded matches the old
     .hv-list-card / .hv-form-section.hv-panel pairing. -->

<Story name="Unpadded (call site owns inset)">
  <div style="padding: 2rem;">A card whose padding belongs to the call site.</div>
</Story>

<Story name="Padded" args={{ padded: true }}>A list card at the shared panel inset.</Story>

<!-- as in practice: sections, articles, list items, and header heroes all carry the surface. -->
<Story name="As list item" args={{ as: 'li', padded: true }}>
  An achievement in the catalogue list.
</Story>

<Story name="As article" args={{ as: 'article' }}>
  <div style="padding: 1rem;">A translation card.</div>
</Story>
