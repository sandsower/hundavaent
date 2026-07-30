<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Select from './Select.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Select',
    component: Select,
    tags: ['autodocs']
  });
</script>

<!-- Every template spreads a childless rest ({@const { children: _ignored, ...rest } = args}),
     the Field.stories.svelte rule: spreading raw args would pass Storybook's own children arg
     alongside the option children written below and one would silently overwrite the other.
     Standalone renders carry an aria-label: outside a Field nothing else names the control. -->
<Story name="Default" args={{ 'aria-label': 'Neighbourhood' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Select {...rest}>
      <option value="">Choose a neighbourhood</option>
      <option value="downtown">Downtown</option>
      <option value="harbour">Harbour</option>
      <option value="old-town">Old Town</option>
    </Select>
  {/snippet}
</Story>

<Story name="With Selected Value" args={{ 'aria-label': 'Neighbourhood', value: 'harbour' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Select {...rest}>
      <option value="downtown">Downtown</option>
      <option value="harbour">Harbour</option>
      <option value="old-town">Old Town</option>
    </Select>
  {/snippet}
</Story>

<Story name="Disabled" args={{ 'aria-label': 'Neighbourhood', disabled: true, value: 'downtown' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Select {...rest}>
      <option value="downtown">Downtown</option>
      <option value="harbour">Harbour</option>
      <option value="old-town">Old Town</option>
    </Select>
  {/snippet}
</Story>

<Story name="Invalid" args={{ 'aria-label': 'Neighbourhood', 'aria-invalid': true }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Select {...rest}>
      <option value="">Choose a neighbourhood</option>
      <option value="downtown">Downtown</option>
      <option value="harbour">Harbour</option>
      <option value="old-town">Old Town</option>
    </Select>
  {/snippet}
</Story>
