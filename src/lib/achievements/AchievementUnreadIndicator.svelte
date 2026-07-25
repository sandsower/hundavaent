<script lang="ts">
  import PawMark from '$lib/member-activity/PawMark.svelte';

  interface Props {
    visible: boolean;
    label: string;
  }

  let { visible, label }: Props = $props();
</script>

{#if visible}
  <span class="unread" data-achievement-unread-indicator>
    <span class="mark" aria-hidden="true">
      <PawMark active={true} />
    </span>
    <span class="visually-hidden">{label}</span>
  </span>
{/if}

<style>
  .unread {
    display: inline-grid;
    flex: 0 0 auto;
    width: 1.22rem;
    height: 1.22rem;
    border: 2px solid var(--hv-color-snow-raised);
    border-radius: 999px;
    margin-inline-start: 0.1rem;
    background: var(--hv-color-brand-paw);
    color: white;
    filter: drop-shadow(0 1px 1px rgb(30 45 49 / 22%));
    place-items: center;
    pointer-events: none;
  }

  .mark {
    display: grid;
    width: 0.68rem;
    height: 0.68rem;
    place-items: center;
  }

  .mark :global(svg) {
    width: 100%;
    height: 100%;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    padding: 0;
    border: 0;
    margin: -1px;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: no-preference) {
    .unread {
      animation: achievement-unread-arrives 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    @keyframes achievement-unread-arrives {
      from {
        transform: scale(0.7) rotate(-12deg);
      }
      to {
        transform: scale(1) rotate(0);
      }
    }
  }
</style>
