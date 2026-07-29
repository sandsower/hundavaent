<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fn } from 'storybook/test';

  import Choice from './Choice.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Choice',
    component: Choice,
    tags: ['autodocs'],
    args: {
      onchange: fn()
    }
  });
</script>

<script lang="ts">
  // Story-local checked state for the interactive story, the same convention as Button.stories.svelte's
  // click counters and Field.stories.svelte's interactive validation state.
  let interactiveChecked = $state(false);
</script>

<Story name="Radio" args={{ type: 'radio', name: 'story-radio' }}>Front yard</Story>

<Story name="Checkbox" args={{ type: 'checkbox', name: 'story-checkbox' }}>
  Notify me by email
</Story>

<Story name="Checked" args={{ type: 'checkbox', name: 'story-checked', checked: true }}>
  Already opted in
</Story>

<Story name="Disabled" args={{ type: 'checkbox', name: 'story-disabled', disabled: true }}>
  Unavailable
</Story>

<!-- Mirrors suggest/+page.svelte's .choices wrapper (the pattern FormSection.stories.svelte's
     "With Choices" story also composes): a plain gap-[0.5rem] grid of Choice rows sharing one
     `name`, inside a fieldset+legend the caller owns. Choice itself never renders that structure -
     labelling a group is the fieldset+legend's job, not an individual Choice's, per the comment in
     Choice.svelte. -->
<Story name="Radio Group" args={{}}>
  {#snippet template(args)}
    {@const { children: _ignored, ...rest } = args}
    <fieldset>
      <legend>Welcome area</legend>
      <div class="grid gap-[0.5rem]">
        <Choice {...rest} type="radio" name="story-group" value="front-yard">Front yard</Choice>
        <Choice {...rest} type="radio" name="story-group" value="back-yard">Back yard</Choice>
        <Choice {...rest} type="radio" name="story-group" value="whole-property">
          Whole property
        </Choice>
      </div>
    </fieldset>
  {/snippet}
</Story>

<Story name="Checkbox Interactive" args={{ type: 'checkbox', name: 'story-interactive' }}>
  {#snippet template(args)}
    {@const { children: _ignored, checked: _ignoredChecked, ...rest } = args}
    <Choice
      {...rest}
      checked={interactiveChecked}
      onchange={(event) => {
        interactiveChecked = event.currentTarget.checked;
        args.onchange?.(event);
      }}
    >
      {interactiveChecked ? 'Opted in' : 'Opted out'}
    </Choice>
  {/snippet}
</Story>
