<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fn } from 'storybook/test';

  import Button from './Button.svelte';

  const { Story } = defineMeta({
    title: 'Design System/Button',
    component: Button,
    tags: ['autodocs'],
    args: {
      onclick: fn()
    }
  });
</script>

<script lang="ts">
  // Story-local click counters: one per interactive story so each keeps its own count instead of
  // sharing a single instance-level value across the docs page.
  let neutralClicks = $state(0);
  let primaryClicks = $state(0);
  let committedClicks = $state(0);
  let pressedOn = $state(false);
  let iconOnlyPressed = $state(false);
  let favouritePressed = $state(false);

  function clickLabel(count: number) {
    if (count === 0) return 'Clicked 0 times';
    if (count === 1) return 'Clicked 1 time';
    return `Clicked ${count} times`;
  }

  // The favourite-heart path, exactly as shipped in src/lib/favourites/FavouriteControl.svelte -
  // note the path itself carries no fill here; the round control's stylesheet below drives fill
  // off aria-pressed, the same split the real component uses.
  const heartPath =
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z';
</script>

<Story name="Neutral" args={{ intent: 'neutral' }}>Neutral</Story>

<Story name="Primary" args={{ intent: 'primary' }}>Primary</Story>

<Story name="Committed" args={{ intent: 'committed' }}>Committed</Story>

<Story name="Quiet" args={{ intent: 'quiet' }}>Quiet</Story>

<Story name="Danger" args={{ intent: 'danger' }}>Danger</Story>

<Story name="Danger Quiet" args={{ intent: 'danger-quiet' }}>Danger Quiet</Story>

<!-- All six intents side by side, for a single at-a-glance comparison. Six independent Buttons,
     not one Button re-rendered six times, so each keeps its own onclick call in the actions
     panel. -->
<Story name="All Intents">
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <div style="display: flex; gap: 0.65rem; flex-wrap: wrap;">
      <Button {...rest} intent="neutral">Neutral</Button>
      <Button {...rest} intent="primary">Primary</Button>
      <Button {...rest} intent="committed">Committed</Button>
      <Button {...rest} intent="quiet">Quiet</Button>
      <Button {...rest} intent="danger">Danger</Button>
      <Button {...rest} intent="danger-quiet">Danger Quiet</Button>
    </div>
  {/snippet}
</Story>

<Story name="Pressed On" args={{ pressed: true }}>Selected</Story>

<Story name="Pressed Off" args={{ pressed: false }}>Not selected</Story>

<Story name="Disabled" args={{ disabled: true }}>Disabled</Story>

<Story name="Busy" args={{ 'aria-busy': true }}>Saving</Story>

<Story name="Link" args={{ href: '#' }}>Go to place</Story>

<Story name="Icon Only" args={{ 'aria-label': 'Add to favorites' }}>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
      fill="currentColor"
    />
  </svg>
</Story>

<!-- The `round` shape prop, exercised directly (rather than through the hand-rolled
     .favourite-icon-toggle class further down): rounded-full, zero padding, and width/height tied
     to --hv-control-height via shapeClasses, matching the icon family surveyed from
     SelectedPlaceCard's .icon-action and SharePlaceControl's .icon-control. -->
<Story name="Round" args={{ shape: 'round', 'aria-label': 'Share this place' }}>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .05 3.41L8.9 10.7a3 3 0 1 0 0 2.6l6.15 3.29A3 3 0 1 0 15.83 15L9.68 11.71a3.07 3.07 0 0 0 0-2.42L15.83 6a3 3 0 0 0 2.17 2Z"
      fill="currentColor"
    />
  </svg>
</Story>

<Story name="Icon Only Interactive" args={{ 'aria-label': 'Add to favorites' }}>
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <Button
      {...rest}
      pressed={iconOnlyPressed}
      aria-label={iconOnlyPressed ? 'Remove from favorites' : 'Add to favorites'}
      onclick={(event) => {
        iconOnlyPressed = !iconOnlyPressed;
        args.onclick?.(event);
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d={heartPath} fill="currentColor" />
      </svg>
    </Button>
    <p>{iconOnlyPressed ? 'Remove from favorites' : 'Add to favorites'}</p>
  {/snippet}
</Story>

<!-- Reproduces the shipped favourite-heart control from src/lib/favourites/FavouriteControl.svelte:
     a round icon-only toggle whose heart renders outline when unpressed and fills solid when
     pressed, driven off aria-pressed exactly like the shipped component. The hover-lift-when-not-pressed
     behaviour is Button's own (see Button.svelte's not-disabled:not-aria-pressed:hover rule) and is
     deliberately not duplicated here. -->
<Story name="Icon Toggle (Favourite)" args={{ pressed: false, 'aria-label': 'Save to favourites' }}>
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <Button
      {...rest}
      pressed={favouritePressed}
      aria-label={favouritePressed ? 'Remove from favourites' : 'Save to favourites'}
      class="favourite-icon-toggle"
      onclick={(event) => {
        favouritePressed = !favouritePressed;
        args.onclick?.(event);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={heartPath} />
      </svg>
    </Button>
  {/snippet}
</Story>

<!-- FavouriteControl's signed-out branch: same round heart shape, rendered as an anchor (Button
     picks <a> whenever href is set) so an unauthenticated visitor is routed to sign in instead of
     toggling a state that doesn't exist for them yet. -->
<Story
  name="Icon Link (Favourite signed-out)"
  args={{
    href: '#',
    'aria-label': 'Sign in to save to favourites',
    class: 'favourite-icon-toggle'
  }}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={heartPath} />
  </svg>
</Story>

<!-- FavouriteControl also sets aria-busy and disabled on the same round control while its PUT
     request is in flight (submitting in the component). Shown here mid-save, before the response
     flips pressed/aria-label. -->
<Story
  name="Icon Toggle (Favourite, Saving)"
  args={{
    pressed: false,
    disabled: true,
    'aria-busy': true,
    'aria-label': 'Save to favourites',
    class: 'favourite-icon-toggle'
  }}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={heartPath} />
  </svg>
</Story>

<Story name="Submit Type" args={{ type: 'submit' }}>Save changes</Story>

<Story name="Neutral Interactive" args={{ intent: 'neutral' }}>
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <Button
      {...rest}
      onclick={(event) => {
        neutralClicks++;
        args.onclick?.(event);
      }}
    >
      {clickLabel(neutralClicks)}
    </Button>
  {/snippet}
</Story>

<Story name="Primary Interactive" args={{ intent: 'primary' }}>
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <Button
      {...rest}
      onclick={(event) => {
        primaryClicks++;
        args.onclick?.(event);
      }}
    >
      {clickLabel(primaryClicks)}
    </Button>
  {/snippet}
</Story>

<Story name="Committed Interactive" args={{ intent: 'committed' }}>
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <Button
      {...rest}
      onclick={(event) => {
        committedClicks++;
        args.onclick?.(event);
      }}
    >
      {clickLabel(committedClicks)}
    </Button>
  {/snippet}
</Story>

<Story name="Pressed Interactive" args={{ pressed: false }}>
  {#snippet template(args)}
    {@const { children, ...rest } = args}
    <Button
      {...rest}
      pressed={pressedOn}
      onclick={(event) => {
        pressedOn = !pressedOn;
        args.onclick?.(event);
      }}
    >
      {pressedOn ? 'Selected' : 'Not selected'}
    </Button>
  {/snippet}
</Story>

<style>
  /* The round icon-toggle shape from src/lib/favourites/FavouriteControl.svelte's
     .favourite-toggle: fixed circular sizing plus the svg's own outline/fill split. Button renders
     the actual button/a element, so these stay global rather than scoped - there is no wrapping
     element in this file for Svelte's scoping to key off, the same reason FavouriteControl itself
     reaches its toggle through :global(). Decorative extras from the shipped component (the
     just-saved bloom/heart-punch flourish, the selected-state danger colour swap) are intentionally
     left out; they are not part of the essential icon-toggle shape these stories exist to cover. */
  :global(.favourite-icon-toggle) {
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    border-radius: 999px;
    place-items: center;
  }

  :global(.favourite-icon-toggle svg) {
    width: 1.2rem;
    fill: transparent;
    stroke: currentColor;
    stroke-linejoin: round;
    stroke-width: 1.8;
    transition: fill var(--hv-fade-quick) linear;
  }

  :global(.favourite-icon-toggle[aria-pressed='true'] svg) {
    fill: currentColor;
  }
</style>
