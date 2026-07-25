<script lang="ts">
  interface Props {
    href: string;
    label: string;
    /**
     * True while the map is being panned or zoomed. Discovery chrome steps back during a gesture
     * and returns on its own when it settles.
     */
    quiet?: boolean;
  }

  let { href, label, quiet = false }: Props = $props();
</script>

<!-- The permanent way to add a Place that is not on the map yet. It is discovery chrome: it floats
     over the map, it never takes the map's gestures except on the pill itself, and the shell hides
     it whole while a Place is selected or the cluster is folded away. -->
<div class="suggest-dock" data-suggest-dock data-quiet={quiet} data-motion="tokenized">
  <!-- A full navigation (not a client-side route transition) keeps the destination's own
       sign-in handoff deterministic instead of racing the SPA router's async goto(). -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is pre-resolved by the caller with $app/paths resolve() -->
  <a class="suggest-pill" {href} data-sveltekit-reload>
    <span class="pill-glyph" aria-hidden="true">+</span>
    {label}
  </a>
</div>

<style>
  .suggest-dock {
    position: absolute;
    z-index: 3;
    /* Above the map attribution strip, which owns the bottom edge on every layout. */
    bottom: calc(var(--floating-card-inset, 0.75rem) + 1.75rem);
    right: var(--floating-card-inset, 0.75rem);
    left: var(--floating-card-inset, 0.75rem);
    display: flex;
    justify-content: center;
    /* The dock spans the map so the pill can centre in it; only the pill takes pointer events, so
       the map keeps every gesture either side of it. */
    pointer-events: none;
    /* Map gestures are quiet: the pill steps back with the rest of the browse chrome and comes back
       when the gesture settles. Opacity only, and only the same 0.35 the command cluster uses. */
    transition: opacity var(--hv-fade-quick) var(--hv-ease-settle);
  }

  .suggest-dock[data-quiet='true'] {
    opacity: 0.35;
  }

  .suggest-pill {
    display: inline-flex;
    min-height: var(--hv-control-height);
    max-width: 100%;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 1.1rem;
    border: 1px solid var(--hv-color-moss);
    border-radius: 999px;
    background: var(--hv-color-moss-soft);
    box-shadow: var(--hv-shadow-floating);
    color: var(--hv-color-basalt);
    font-weight: 850;
    letter-spacing: -0.015em;
    pointer-events: auto;
    text-decoration: none;
    /* Movement only, like every other pill in the command cluster. */
    transition: transform var(--hv-motion-instant) var(--hv-ease-settle);
  }

  .suggest-pill:hover {
    transform: translateY(-1px);
  }

  .suggest-pill:active {
    transform: scale(0.94);
  }

  .suggest-pill:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .pill-glyph {
    font-size: 1.15rem;
    font-weight: 900;
    line-height: 1;
  }
</style>
