<script lang="ts">
  import PawMark from '$lib/member-activity/PawMark.svelte';

  interface Props {
    visible: boolean;
    label: string;
  }

  let { visible, label }: Props = $props();
</script>

{#if visible}
  <span
    class="unread inline-grid flex-none place-items-center w-[1.22rem] h-[1.22rem] ms-[0.1rem] border-2 border-snow-raised rounded-[999px] bg-brand-paw text-[white] drop-shadow-[0_1px_1px_rgb(30_45_49_/_22%)] pointer-events-none"
    data-achievement-unread-indicator
  >
    <span class="mark grid place-items-center w-[0.68rem] h-[0.68rem]" aria-hidden="true">
      <PawMark active={true} />
    </span>
    <span class="visually-hidden sr-only">{label}</span>
  </span>
{/if}

<style>
  .mark :global(svg) {
    width: 100%;
    height: 100%;
  }

  .unread {
    animation: achievement-unread-arrives var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  @keyframes achievement-unread-arrives {
    from {
      transform: scale(0.7) rotate(-12deg);
    }
    to {
      transform: scale(1) rotate(0);
    }
  }
</style>
