<script lang="ts">
  import PawMark from './PawMark.svelte';

  interface Props {
    active: boolean;
  }

  let { active }: Props = $props();
</script>

<span
  class="weekly-rhythm-indicator absolute -top-[0.48rem] -right-[0.48rem] grid place-items-center w-[1.35rem] h-[1.35rem] border-2 border-snow-raised rounded-full bg-snow-raised text-basalt-muted pointer-events-none drop-shadow-[0_1px_1px_rgb(30_45_49_/_22%)] [&.active]:bg-signal [&.active]:text-basalt"
  class:active
  data-weekly-rhythm-indicator
  data-state={active ? 'active' : 'open'}
  aria-hidden="true"
>
  <PawMark {active} />
</span>

<style>
  .weekly-rhythm-indicator :global(svg) {
    width: 0.78rem;
    height: 0.78rem;
  }
</style>
