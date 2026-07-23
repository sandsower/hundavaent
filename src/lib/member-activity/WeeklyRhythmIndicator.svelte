<script lang="ts">
  import PawMark from './PawMark.svelte';

  interface Props {
    active: boolean;
  }

  let { active }: Props = $props();
</script>

<span
  class="weekly-rhythm-indicator"
  class:active
  data-weekly-rhythm-indicator
  data-state={active ? 'active' : 'open'}
  aria-hidden="true"
>
  <PawMark {active} />
</span>

<style>
  .weekly-rhythm-indicator {
    position: absolute;
    top: -0.48rem;
    right: -0.48rem;
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    border: 2px solid var(--hv-color-snow-raised);
    border-radius: 999px;
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt-muted);
    filter: drop-shadow(0 1px 1px rgb(30 45 49 / 22%));
    place-items: center;
    pointer-events: none;
  }

  .weekly-rhythm-indicator.active {
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
  }

  .weekly-rhythm-indicator :global(svg) {
    width: 0.78rem;
    height: 0.78rem;
  }
</style>
