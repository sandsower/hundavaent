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
  class="acknowledgement grid w-full grid-cols-[2.8rem_minmax(0,1fr)] gap-x-[0.7rem] gap-y-0 py-3 px-[0.85rem] border border-[color-mix(in_srgb,var(--hv-color-fjord)_48%,var(--hv-border-subtle))] rounded-control bg-snow-raised text-basalt shadow-raised pointer-events-none"
  data-weekly-rhythm-acknowledgement
  data-recognition-action={recognition.action}
  data-activated-week={recognition.activatedCurrentWeek}
  role="status"
  aria-live="polite"
>
  <div
    class="trail-motif relative grid row-[1/span_2] grid-cols-[0.85rem_minmax(0.25rem,1fr)_1.05rem] items-center text-fjord"
    aria-hidden="true"
  >
    <svg
      class="action-icon w-[0.85rem] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.7]"
      viewBox="0 0 24 24"
    >
      {#if recognition.action === 'favourite'}
        <path d="M12 20.2 4.2 12.8A5.2 5.2 0 0 1 11.6 5.5L12 6l.4-.5a5.2 5.2 0 0 1 7.4 7.3Z" />
      {:else if recognition.action === 'check_in'}
        <path d="M12 21s6-5.5 6-11A6 6 0 0 0 6 10c0 5.5 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.1" class="fill-fjord-soft" />
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
    <span class="trail h-px border-t-2 border-dotted border-current origin-left"></span>
    <PawMark active />
  </div>
  <span class="title min-w-0 font-display text-[0.95rem] font-[750] leading-tight">
    {recognition.activatedCurrentWeek ? copy['weeklyRhythm.activatedTitle'] : message.title}
  </span>
  <span
    class="detail min-w-0 overflow-hidden mt-[0.12rem] text-basalt-muted text-[0.74rem] font-bold leading-tight text-ellipsis whitespace-nowrap"
    >{message.detail}</span
  >
</div>

<style>
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
      transform: translateY(-0.32rem);
    }

    to {
      transform: translateY(0);
    }
  }

  @keyframes pin-appears {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
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
      transform: rotate(11deg) scale(1.55);
    }

    72% {
      transform: rotate(11deg) scale(0.9);
    }

    100% {
      transform: rotate(11deg) scale(1);
    }
  }

  @keyframes paw-appears {
    0% {
      opacity: 0;
    }

    72% {
      opacity: 1;
    }

    100% {
      opacity: 1;
    }
  }

  /* Anything that both moves and fades runs as two entries, one per family, so reduced motion
     stills the travel while the pin and paw keep appearing (see tokens.css). */
  .acknowledgement {
    animation: acknowledgement-arrives var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  .action-icon {
    animation:
      pin-settles var(--hv-motion-considered) var(--hv-ease-settle) both,
      pin-appears var(--hv-fade-considered) var(--hv-ease-settle) both;
  }

  .trail {
    animation: trail-draws var(--hv-motion-considered) calc(var(--hv-motion-stagger) * 3)
      var(--hv-ease-settle) both;
  }

  .trail-motif :global(.paw-mark) {
    width: 1.05rem;
    transform: rotate(11deg);
    transform-origin: center;
  }

  .trail-motif :global(.paw-mark) {
    animation:
      paw-stamps var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 6) var(--hv-ease-settle)
        both,
      paw-appears var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 6) var(--hv-ease-settle)
        both;
  }
</style>
