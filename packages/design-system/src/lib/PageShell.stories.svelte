<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PageShell from './PageShell.svelte';

  const { Story } = defineMeta({
    title: 'Design System/PageShell',
    component: PageShell,
    tags: ['autodocs']
  });
</script>

<!-- Placeholder copy only: PageShell carries no copy; the tinted block makes the measure and
     centring visible against the canvas. -->

{#snippet measure(label: string)}
  <div style="background: var(--hv-color-fjord-soft); padding: 1rem; border-radius: 0.5rem;">
    {label}
  </div>
{/snippet}

<Story name="Wide (default)">
  {@render measure('72rem measure, centred, edge inset at narrow viewports')}
</Story>

<Story name="Narrow" args={{ width: 'narrow' }}>
  {@render measure('42rem measure - account pages, legal pages, list pages')}
</Story>

<!-- The operations retune flows through data-ui-mode: section padding and edge inset re-resolve
     inside the shell's subtree exactly as they did on .hv-page-shell. -->
<Story name="Operations mode" args={{ mode: 'operations' }}>
  {@render measure('data-ui-mode="operations" - the translations and moderation surfaces')}
</Story>

<!-- as in practice: about renders its shell as a div inside its own moded main; the translations
     workspace is a section. -->
<Story name="As Section" args={{ as: 'section', width: 'narrow' }}>
  {@render measure('Rendered as a section')}
</Story>
