<script lang="ts">
  import type { Catalogue } from '$i18n';
  import type { QualifyingAction, WeeklyRhythmRecognition } from './types';
  import PawMark from './PawMark.svelte';

  interface Props {
    recognition: WeeklyRhythmRecognition;
    subjectName?: string;
    copy: Catalogue;
  }

  let { recognition, subjectName = '', copy }: Props = $props();

  let message = $derived(actionMessage(recognition.action, subjectName, copy));

  function actionMessage(action: QualifyingAction, name: string, catalogue: Catalogue) {
    switch (action) {
      case 'favourite':
        return {
          title: catalogue['weeklyRhythm.favouriteTitle'],
          detail: catalogue['weeklyRhythm.favouriteDetail'].replace('{name}', name)
        };
      case 'check_in':
        return {
          title: catalogue['weeklyRhythm.checkInTitle'],
          detail: catalogue['weeklyRhythm.checkInDetail'].replace('{name}', name)
        };
      case 'rating':
        return {
          title: catalogue['weeklyRhythm.ratingTitle'],
          detail: catalogue['weeklyRhythm.ratingDetail'].replace('{name}', name)
        };
      case 'suggestion':
        return {
          title: catalogue['weeklyRhythm.suggestionTitle'],
          detail: catalogue['weeklyRhythm.suggestionDetail']
        };
      case 'correction':
        return {
          title: catalogue['weeklyRhythm.correctionTitle'],
          detail: catalogue['weeklyRhythm.correctionDetail']
        };
      case 'report':
        return {
          title: catalogue['weeklyRhythm.reportTitle'],
          detail: catalogue['weeklyRhythm.reportDetail']
        };
    }
  }
</script>

<div
  class="acknowledgement"
  data-weekly-rhythm-acknowledgement
  data-recognition-action={recognition.action}
  data-activated-week={recognition.activatedCurrentWeek}
  role="status"
  aria-live="polite"
>
  <div class="trail-motif" aria-hidden="true">
    <svg class="action-icon" viewBox="0 0 24 24">
      {#if recognition.action === 'favourite'}
        <path d="M12 20.2 4.2 12.8A5.2 5.2 0 0 1 11.6 5.5L12 6l.4-.5a5.2 5.2 0 0 1 7.4 7.3Z" />
      {:else if recognition.action === 'check_in'}
        <path d="M12 21s6-5.5 6-11A6 6 0 0 0 6 10c0 5.5 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.1" />
      {:else if recognition.action === 'rating'}
        <path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9Z" />
      {:else if recognition.action === 'suggestion'}
        <path d="M7 3h7l4 4v14H7Z" />
        <path d="M14 3v5h5M10 12h5M10 16h5" />
      {:else if recognition.action === 'correction'}
        <path d="m5 16-1 4 4-1L19 8l-3-3ZM14 7l3 3" />
      {:else}
        <path d="M6 21V4m0 1h11l-2 4 2 4H6" />
      {/if}
    </svg>
    <span class="trail"></span>
    <PawMark active />
  </div>
  <span class="title">
    {recognition.activatedCurrentWeek ? copy['weeklyRhythm.activatedTitle'] : message.title}
  </span>
  <span class="detail">{message.detail}</span>
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

  .action-icon {
    width: 0.85rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
  }

  .action-icon circle {
    fill: var(--hv-color-fjord-soft);
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

  /* Slides without fading so accessibility scans never sample the copy in a
     half-transparent state. */
  @keyframes acknowledgement-arrives {
    from {
      transform: translateY(-0.25rem);
    }

    to {
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

    .action-icon {
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
