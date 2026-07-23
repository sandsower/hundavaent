<script lang="ts">
  import type { Catalogue } from '$i18n';
  import PawMark from './PawMark.svelte';

  interface Props {
    placeName: string;
    activatedCurrentWeek: boolean;
    copy: Catalogue;
  }

  let { placeName, activatedCurrentWeek, copy }: Props = $props();
</script>

<div
  class="acknowledgement"
  data-weekly-rhythm-acknowledgement
  data-activated-week={activatedCurrentWeek}
  role="status"
  aria-live="polite"
>
  <div class="trail-motif" aria-hidden="true">
    <svg class="place-pin" viewBox="0 0 24 24">
      <path d="M12 21s6-5.5 6-11A6 6 0 0 0 6 10c0 5.5 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.1" />
    </svg>
    <span class="trail"></span>
    <PawMark active />
  </div>
  <span class="title">
    {activatedCurrentWeek
      ? copy['weeklyRhythm.activatedTitle']
      : copy['weeklyRhythm.recognizedTitle']}
  </span>
  <span class="detail">
    {copy['weeklyRhythm.recognizedDetail'].replace('{name}', placeName)}
  </span>
</div>

<style>
  .acknowledgement {
    display: grid;
    width: 100%;
    grid-template-columns: 2.8rem minmax(0, 1fr);
    padding: 0.75rem 0.85rem;
    border: 1px solid color-mix(in srgb, var(--hv-color-fjord) 48%, var(--hv-border-subtle));
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
    color: var(--hv-color-basalt);
    gap: 0 0.7rem;
    pointer-events: none;
  }

  .trail-motif {
    position: relative;
    display: grid;
    grid-row: 1 / span 2;
    grid-template-columns: 0.85rem minmax(0.25rem, 1fr) 1.05rem;
    align-items: center;
    color: var(--hv-color-fjord);
  }

  .place-pin {
    width: 0.85rem;
    fill: var(--hv-color-fjord-soft);
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
  }

  .trail {
    height: 1px;
    border-top: 2px dotted currentColor;
    transform-origin: left center;
  }

  .trail-motif :global(.paw-mark) {
    width: 1.05rem;
    transform: rotate(11deg);
    transform-origin: center;
  }

  .title,
  .detail {
    min-width: 0;
  }

  .title {
    font-family: var(--hv-font-display);
    font-size: 0.95rem;
    font-weight: 750;
    line-height: 1.25;
  }

  .detail {
    overflow: hidden;
    margin-top: 0.12rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes acknowledgement-arrives {
    from {
      opacity: 0;
      transform: translateY(-0.25rem);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pin-settles {
    from {
      opacity: 0;
      transform: translateY(-0.32rem);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes trail-draws {
    from {
      transform: scaleX(0);
    }

    to {
      transform: scaleX(1);
    }
  }

  @keyframes paw-stamps {
    0% {
      opacity: 0;
      transform: rotate(11deg) scale(1.55);
    }

    72% {
      opacity: 1;
      transform: rotate(11deg) scale(0.9);
    }

    100% {
      opacity: 1;
      transform: rotate(11deg) scale(1);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .acknowledgement {
      animation: acknowledgement-arrives 260ms ease-out both;
    }

    .place-pin {
      animation: pin-settles 280ms ease-out both;
    }

    .trail {
      animation: trail-draws 310ms 150ms ease-out both;
    }

    .trail-motif :global(.paw-mark) {
      animation: paw-stamps 360ms 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
  }
</style>
