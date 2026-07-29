<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Field from './Field.svelte';
  import FormSection from './FormSection.svelte';
  import Input from './Input.svelte';

  const { Story } = defineMeta({
    title: 'Design System/FormSection',
    component: FormSection,
    tags: ['autodocs']
  });
</script>

<!-- Every template spreads a childless rest ({@const { children: _ignored, ...rest } = args}), the
     phase-1 interactive-story rule: spreading raw args would pass Storybook's own children arg
     alongside the body children and one silently overwrites the other. -->
<Story name="With Legend" args={{ legend: 'Contact details' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <FormSection {...rest}>
      <Field label="Name of the place">
        <Input name="name" />
      </Field>
      <Field label="Phone" hint="Icelandic numbers only">
        <Input name="phone" type="tel" />
      </Field>
    </FormSection>
  {/snippet}
</Story>

<Story name="Without Legend" args={{}}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <FormSection {...rest}>
      <Field label="Name of the place">
        <Input name="name" />
      </Field>
    </FormSection>
  {/snippet}
</Story>

<!-- The shipped disable-gate pattern: setting `disabled` on the section natively disables every
     nested control, no per-field wiring needed - both inputs below are inert here even though
     neither carries a disabled prop of its own. -->
<Story name="Disabled" args={{ legend: 'Contact details', disabled: true }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <FormSection {...rest}>
      <Field label="Name of the place">
        <Input name="name" value="Kaffihúsið" />
      </Field>
      <Field label="Phone">
        <Input name="phone" type="tel" />
      </Field>
    </FormSection>
  {/snippet}
</Story>
