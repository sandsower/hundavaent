<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedWeekRange } from '$i18n/date';
  import { Eyebrow, Notice } from '@hundavaent/design-system';
  import PawMark from './PawMark.svelte';
  import type { WeeklyRhythmHistory } from './types';

  interface Props {
    history: WeeklyRhythmHistory;
    lang: Locale;
    copy: Catalogue;
    /* The account hub renders the trail as the door to the achievements page; the impact page
       renders it as a plain display. Both props must be present for the door to appear. */
    achievementsHref?: string;
    achievementsLabel?: string;
  }

  let { history, lang, copy, achievementsHref, achievementsLabel }: Props = $props();
</script>

<!-- Not <Panel>: this surface needs a bespoke border colour (a fjord-tinted mix), which Panel's
     contract cannot carry (its border/radius/shadow/background ship as one matched set that
     callers must not override - see Panel.svelte's class-prop doc comment). The panel recipe is
     reproduced here as scoped token CSS instead, on the caller's own element (the
     SelectedPlaceCard precedent: carry only the tokens that render). -->
<section
  class="weekly-rhythm relative grid col-span-full @container overflow-hidden p-panel gap-context border border-[color-mix(in_srgb,var(--hv-color-fjord)_36%,var(--hv-border-subtle))] rounded-panel bg-snow-raised shadow-raised has-[.achievements-door]:transition-[border-color] has-[.achievements-door]:duration-[var(--hv-fade-quick)] @max-[42rem]:p-panel [@media(hover:hover)]:has-[.achievements-door]:hover:border-fjord"
  data-weekly-rhythm-history
  data-state={history.status}
  aria-labelledby="weekly-rhythm-heading"
>
  <div class="rhythm-copy max-w-[37rem]">
    <Eyebrow>{copy['weeklyRhythm.privateEyebrow']}</Eyebrow>
    <h2 id="weekly-rhythm-heading" class="m-0 mt-[0.12rem] text-[1.3rem]">
      {copy['weeklyRhythm.historyTitle']}
    </h2>
    <p class="m-0 mt-[0.28rem] text-basalt-muted leading-[1.45]">
      {copy['weeklyRhythm.historyIntro']}
    </p>
  </div>

  {#if history.status === 'available'}
    <!-- Two columns of four. Below this the week range needs the full cell width, so the
         per-week state caption is dropped rather than allowed to wrap under it. -->
    <!-- Four rows of two: the narrowest the trail ever gets, inside a pillar on a small screen. -->
    <ol
      class="trail grid grid-cols-8 m-0 p-0 list-none @max-[42rem]:grid-cols-4 @max-[42rem]:gap-y-[1.1rem] @max-[22rem]:grid-cols-2"
      aria-label={copy['weeklyRhythm.historyLabel']}
    >
      {#each history.weeks as week (week.startsOn)}
        <li
          class="group relative grid min-w-0 grid-rows-[2.2rem_auto] justify-items-center text-basalt-muted"
          class:active={week.active}
          class:current={week.current}
          data-week-start={week.startsOn}
          data-state={week.active ? 'active' : 'open'}
          aria-label={`${formatLocalizedWeekRange(week.startsOn, week.endsOn, lang)}. ${
            week.active ? copy['weeklyRhythm.activeWeek'] : copy['weeklyRhythm.openWeek']
          }${week.current ? `. ${copy['weeklyRhythm.currentWeek']}` : ''}`}
        >
          <span
            class="trail-segment absolute top-4 right-1/2 -left-1/2 border-t-2 border-dotted border-[color-mix(in_srgb,var(--hv-color-fjord)_54%,transparent)] group-[:first-child]:hidden @max-[42rem]:group-[:nth-child(5)]:hidden @max-[22rem]:group-[:nth-child(odd)]:hidden"
            aria-hidden="true"
          ></span>
          <span
            class="node z-[1] grid w-[2.05rem] h-[2.05rem] border-2 border-[color-mix(in_srgb,var(--hv-color-fjord)_45%,var(--hv-border-subtle))] rounded-full bg-snow-raised place-items-center group-[.active]:border-fjord group-[.active]:bg-fjord-soft group-[.active]:text-fjord group-[.current]:shadow-[0_0_0_3px_var(--hv-color-signal)]"
            aria-hidden="true"
          >
            {#if week.active}
              <PawMark active />
            {:else}
              <span class="open-node w-[0.42rem] h-[0.42rem] rounded-full bg-current opacity-55"
              ></span>
            {/if}
          </span>
          <span class="week-copy grid min-w-0 mt-[0.4rem] text-center" aria-hidden="true">
            <!-- Captions sit at the 12px floor: anything smaller reads as decoration, not dates. -->
            <span class="week-range text-xs font-[850] leading-tight">
              {formatLocalizedWeekRange(week.startsOn, week.endsOn, lang)}
            </span>
            <span class="week-state mt-[0.15rem] text-[0.72rem] leading-[1.2] @max-[42rem]:hidden">
              {week.active ? copy['weeklyRhythm.activeWeek'] : copy['weeklyRhythm.openWeek']}
            </span>
          </span>
          {#if week.current}
            <span
              class="current-label mt-[0.3rem] py-[0.12rem] px-[0.4rem] rounded-full bg-signal text-basalt text-[0.7rem] font-black"
              aria-hidden="true"
            >
              {copy['weeklyRhythm.currentWeek']}
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <Notice as="div" tone="info" role="status" class="unavailable">
      <PawMark />
      <span>{copy['weeklyRhythm.unavailable']}</span>
    </Notice>
  {/if}

  {#if achievementsHref && achievementsLabel}
    <!-- The caller resolves the href; this display component owns no routes. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a
      class="achievements-door justify-self-start font-[850] no-underline text-fjord after:absolute after:inset-0 after:rounded-panel after:content-[''] focus-visible:rounded-control focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px]"
      data-achievements-door
      href={achievementsHref}
    >
      {achievementsLabel}
    </a>
  {/if}
</section>

<style>
  /* .unavailable now renders through Notice (a child component), so the hook needs :global() -
     Notice's own border/radius/background/padding stay untouched; this only adds layout.
     Ancestor-scoped under .weekly-rhythm (never a bare :global()), matching the rest of this
     migration's hook convention. */
  .weekly-rhythm :global(.unavailable) {
    display: flex;
    margin: 0;
    gap: 0.65rem;
    align-items: center;
  }

  .weekly-rhythm :global(.unavailable svg) {
    width: 1.25rem;
    flex: 0 0 auto;
    color: var(--hv-color-fjord);
  }

  .node :global(svg) {
    width: 1.05rem;
  }
</style>
