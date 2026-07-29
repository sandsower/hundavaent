<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Field from './Field.svelte';
  import Input from './Input.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Field',
    component: Field,
    tags: ['autodocs']
  });
</script>

<script lang="ts">
  // Story-local state for the interactive validation story: typing clears the error, submitting
  // empty raises it - the exact shape a server-action error takes on shipped surfaces.
  let interactiveValue = $state('');
  let interactiveError = $state<string | null>('Enter the name of the place');
</script>

<!-- Every template spreads a childless rest ({@const { children: _ignored, ...rest } = args}),
     the phase-1 interactive-story rule: spreading raw args would pass Storybook's own children
     arg alongside the body children and one silently overwrites the other. -->
<Story name="Plain" args={{ label: 'Name of the place' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Field {...rest}>
      <Input name="name" />
    </Field>
  {/snippet}
</Story>

<Story name="With Hint" args={{ label: 'Phone', hint: 'Icelandic numbers only' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Field {...rest}>
      <Input name="phone" type="tel" />
    </Field>
  {/snippet}
</Story>

<Story name="With Error" args={{ label: 'Email', error: 'Enter a valid email address' }}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Field {...rest}>
      <Input name="email" type="email" value="not-an-email" />
    </Field>
  {/snippet}
</Story>

<Story
  name="Hint And Error"
  args={{
    label: 'Email',
    hint: 'We only use this to sign you in',
    error: 'Enter a valid email address'
  }}
>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <Field {...rest}>
      <Input name="email" type="email" value="not-an-email" />
    </Field>
  {/snippet}
</Story>

<Story name="Validation Interactive" args={{ label: 'Name of the place' }}>
  {#snippet template(args)}
    {@const { children: _ignored, error: _alsoIgnored, ...rest } = args}
    <Field {...rest} error={interactiveError}>
      <Input
        name="name"
        bind:value={interactiveValue}
        oninput={() => {
          interactiveError = interactiveValue.trim() === '' ? 'Enter the name of the place' : null;
        }}
      />
    </Field>
  {/snippet}
</Story>
