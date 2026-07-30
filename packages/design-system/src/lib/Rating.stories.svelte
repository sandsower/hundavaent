<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fn } from 'storybook/test';

  import Rating from './Rating.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Rating',
    component: Rating,
    tags: ['autodocs'],
    args: {
      label: 'Overall',
      // Rating carries no copy of its own (see Rating.svelte's top comment) - label/scoreLabel
      // always arrive from the caller, exactly like InlineRating.svelte's labelScore. This is a
      // plain formatter, not an action to spy on, so it stays a real function rather than fn().
      scoreLabel: (score: number) => (score === 1 ? '1 star' : `${score} stars`),
      onSelect: fn()
    }
  });
</script>

<script lang="ts">
  // Story-local selected scores, the same convention as Button.stories.svelte's click counters:
  // Rating is fully controlled (value arrives as a prop; choosing only calls onSelect), so each
  // interactive story owns the state that drives the pop cascade the same way InlineRating does.
  let defaultValue = $state<number | null>(3);
  let inheritedValue = $state<number | null>(null);
</script>

<Story name="Default" args={{ value: 3 }}>
  {#snippet template(args)}
    {@const { ...rest } = args}
    <Rating
      {...rest}
      value={defaultValue}
      onSelect={(value) => {
        defaultValue = value;
        rest.onSelect?.(value);
      }}
    />
  {/snippet}
</Story>

<!-- Mirrors InlineRating.svelte's per-dimension rows: a dimension left unset falls back to the
     overall score and dims to 0.62 opacity via Rating's [data-inherited] rule, until the Member
     chooses that dimension explicitly and it becomes their own value. -->
<Story name="Inherited" args={{ value: null, inherited: true }}>
  {#snippet template(args)}
    {@const { ...rest } = args}
    <Rating
      {...rest}
      value={inheritedValue}
      onSelect={(value) => {
        inheritedValue = value;
        rest.onSelect?.(value);
      }}
    />
  {/snippet}
</Story>

<!-- Non-interactive: disabled buttons never fire onclick, so this needs no story-local state or
     template override - the same plain-args convention as Input.stories.svelte's Disabled story. -->
<Story name="Disabled" args={{ value: 3, disabled: true }} />
