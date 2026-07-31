<!-- Font-display vs font-ui specimens at the weights the app actually ships: PageTitle's clamp()
     display size, Button/Choice's 800 weight, Eyebrow's 850 weight, and plain body copy. -->
<script lang="ts">
  // svelte-check emits no virtual declaration for a script-less component when a plain .ts module
  // (render-entry.ts) imports it, so this otherwise-static card needs an explicit script block to
  // stay inside the package's type gate.
</script>

<div class="dsc-type">
  <p class="display-sample">Hundahólmi</p>
  <p class="ui-800">Check in at Hundahólmi</p>
  <p class="ui-850">Suggested for you</p>
  <p class="ui-body">
    Grænisandur keeps its gate open from sunrise to sunset, and the tide pools along the north path
    are worth the detour.
  </p>
</div>

<style>
  .dsc-type {
    display: grid;
    gap: 1.25rem;
  }

  .display-sample {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: clamp(2.4rem, 7vw, 4.5rem);
    font-weight: 650;
    line-height: 0.98;
    letter-spacing: -0.035em;
    color: var(--hv-color-basalt);
  }

  .ui-800 {
    margin: 0;
    font-family: var(--hv-font-ui);
    font-weight: 800;
    font-size: 1.1rem;
    color: var(--hv-color-basalt);
  }

  .ui-850 {
    margin: 0;
    font-family: var(--hv-font-ui);
    font-weight: 850;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--hv-color-fjord);
  }

  .ui-body {
    margin: 0;
    max-width: 34rem;
    font-family: var(--hv-font-ui);
    font-weight: 400;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--hv-color-basalt);
  }
</style>
