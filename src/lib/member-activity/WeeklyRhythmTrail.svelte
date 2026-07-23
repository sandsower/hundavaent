<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedWeekRange } from '$i18n/date';
  import PawMark from './PawMark.svelte';
  import type { WeeklyRhythmHistory } from './types';

  interface Props {
    history: WeeklyRhythmHistory;
    lang: Locale;
    copy: Catalogue;
  }

  let { history, lang, copy }: Props = $props();
</script>

<section
  class="weekly-rhythm hv-panel"
  data-weekly-rhythm-history
  data-state={history.status}
  aria-labelledby="weekly-rhythm-heading"
>
  <div class="rhythm-copy">
    <p class="hv-eyebrow">{copy['weeklyRhythm.privateEyebrow']}</p>
    <h2 id="weekly-rhythm-heading">{copy['weeklyRhythm.historyTitle']}</h2>
    <p>{copy['weeklyRhythm.historyIntro']}</p>
  </div>

  {#if history.status === 'available'}
    <ol class="trail" aria-label={copy['weeklyRhythm.historyLabel']}>
      {#each history.weeks as week (week.startsOn)}
        <li
          class:active={week.active}
          class:current={week.current}
          data-week-start={week.startsOn}
          data-state={week.active ? 'active' : 'open'}
          aria-label={`${formatLocalizedWeekRange(week.startsOn, week.endsOn, lang)}. ${
            week.active ? copy['weeklyRhythm.activeWeek'] : copy['weeklyRhythm.openWeek']
          }${week.current ? `. ${copy['weeklyRhythm.currentWeek']}` : ''}`}
        >
          <span class="trail-segment" aria-hidden="true"></span>
          <span class="node" aria-hidden="true">
            {#if week.active}
              <PawMark active />
            {:else}
              <span class="open-node"></span>
            {/if}
          </span>
          <span class="week-copy" aria-hidden="true">
            <span class="week-range">
              {formatLocalizedWeekRange(week.startsOn, week.endsOn, lang)}
            </span>
            <span class="week-state">
              {week.active ? copy['weeklyRhythm.activeWeek'] : copy['weeklyRhythm.openWeek']}
            </span>
          </span>
          {#if week.current}
            <span class="current-label" aria-hidden="true">
              {copy['weeklyRhythm.currentWeek']}
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <div class="unavailable hv-notice" data-tone="info" role="status">
      <PawMark />
      <span>{copy['weeklyRhythm.unavailable']}</span>
    </div>
  {/if}
</section>

<style>
  .weekly-rhythm {
    position: relative;
    display: grid;
    grid-column: 1 / -1;
    overflow: hidden;
    padding: 1.15rem;
    border-color: color-mix(in srgb, var(--hv-color-fjord) 36%, var(--hv-border-subtle));
    background: var(--hv-color-snow-raised);
    gap: 1.15rem;
  }

  .rhythm-copy {
    max-width: 37rem;
  }

  .rhythm-copy :is(p, h2) {
    margin: 0;
  }

  .rhythm-copy h2 {
    margin-top: 0.12rem;
    font-size: 1.3rem;
  }

  .rhythm-copy > p:last-child {
    margin-top: 0.28rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.45;
  }

  .trail {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .trail li {
    position: relative;
    display: grid;
    min-width: 0;
    grid-template-rows: 2.2rem auto;
    justify-items: center;
    color: var(--hv-color-basalt-muted);
  }

  .trail-segment {
    position: absolute;
    top: 1rem;
    right: 50%;
    left: -50%;
    border-top: 2px dotted color-mix(in srgb, var(--hv-color-fjord) 54%, transparent);
  }

  li:first-child .trail-segment {
    display: none;
  }

  .node {
    z-index: 1;
    display: grid;
    width: 2.05rem;
    height: 2.05rem;
    border: 2px solid color-mix(in srgb, var(--hv-color-fjord) 45%, var(--hv-border-subtle));
    border-radius: 999px;
    background: var(--hv-color-snow-raised);
    place-items: center;
  }

  .active .node {
    border-color: var(--hv-color-fjord);
    background: var(--hv-color-fjord-soft);
    color: var(--hv-color-fjord);
  }

  .current .node {
    box-shadow: 0 0 0 3px var(--hv-color-signal);
  }

  .node :global(svg) {
    width: 1.05rem;
  }

  .open-node {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.55;
  }

  .week-copy {
    display: grid;
    min-width: 0;
    margin-top: 0.4rem;
    text-align: center;
  }

  .week-range {
    font-size: 0.65rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .week-state {
    margin-top: 0.15rem;
    font-size: 0.64rem;
    line-height: 1.2;
  }

  .current-label {
    margin-top: 0.3rem;
    padding: 0.12rem 0.35rem;
    border-radius: 999px;
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    font-size: 0.62rem;
    font-weight: 900;
  }

  .unavailable {
    display: flex;
    margin: 0;
    gap: 0.65rem;
    align-items: center;
  }

  .unavailable :global(svg) {
    width: 1.25rem;
    flex: 0 0 auto;
    color: var(--hv-color-fjord);
  }

  @media (max-width: 42rem) {
    .weekly-rhythm {
      padding: 1rem;
    }

    .trail {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      row-gap: 1.1rem;
    }

    .trail li:nth-child(5) .trail-segment {
      display: none;
    }

    .week-state {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .weekly-rhythm *,
    .weekly-rhythm *::before,
    .weekly-rhythm *::after {
      scroll-behavior: auto;
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
</style>
