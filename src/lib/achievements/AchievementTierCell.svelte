<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import type {
    EarnedTierAchievement,
    LockedTierAchievement
  } from '$server/achievements/achievements';
  import { progressLabel, tierLabel } from './tier-copy';

  interface Props {
    entry: EarnedTierAchievement | LockedTierAchievement;
    // Only a collection's nearest unearned tier is the Member's active target. Higher tiers show
    // their threshold instead of a progress track, which keeps one progressbar per collection rather
    // than three reporting the same number to a screen reader.
    active: boolean;
    lang: Locale;
    copy: Catalogue;
  }

  let { entry, active, lang, copy }: Props = $props();

  const label = $derived(tierLabel(entry.tier, copy));
  const started = $derived(active && entry.kind === 'locked' && entry.progress.current > 0);

  // Tier is expressed structurally rather than by hue: there are no metallic tokens in the design
  // system, and gold must not borrow Signal Yellow, which is reserved for verified access,
  // selection and committed actions.
  const state = $derived(entry.kind === 'earned' ? 'earned' : started ? 'started' : 'locked');
</script>

<div class="cell" data-achievement-tier={entry.tier} data-tier-state={state}>
  <p class="tier-label">{label}</p>

  {#if entry.kind === 'earned'}
    <p class="detail">
      {copy['achievements.earned'].replace('{date}', formatLocalizedDate(entry.earnedAt, lang))}
    </p>
  {:else}
    {@const line = progressLabel(
      entry.progress.kind,
      entry.progress.current,
      entry.progress.target,
      copy
    )}
    {#if started}
      <div
        class="track"
        role="progressbar"
        aria-label={line}
        aria-valuemin="0"
        aria-valuemax={entry.progress.target}
        aria-valuenow={entry.progress.current}
      >
        <span
          class="fill"
          style:width={`${Math.round((entry.progress.current / entry.progress.target) * 100)}%`}
        ></span>
      </div>
      <p class="detail">{line}</p>
    {:else}
      <p class="detail muted">
        {copy['achievements.lockedTarget'].replace('{target}', String(entry.progress.target))}
      </p>
    {/if}
  {/if}
</div>

<style>
  .cell {
    display: grid;
    align-content: start;
    gap: 0.4rem;
    min-height: 5.4rem;
    border: 1px solid color-mix(in srgb, var(--hv-color-fjord) 22%, transparent);
    border-radius: 0.9rem;
    padding: 0.7rem 0.8rem;
  }

  .cell[data-tier-state='locked'] {
    border-style: dashed;
    background: transparent;
  }

  .cell[data-tier-state='started'] {
    background: color-mix(in srgb, var(--hv-color-fjord) 4%, var(--hv-color-snow-raised));
  }

  .cell[data-tier-state='earned'] {
    border-color: color-mix(in srgb, var(--hv-color-moss) 42%, transparent);
    background: color-mix(in srgb, var(--hv-color-moss) 11%, var(--hv-color-snow-raised));
  }

  .tier-label {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .cell[data-tier-state='earned'] .tier-label {
    color: var(--hv-color-moss);
  }

  /* Weight increases across the row, so the three rungs read as a progression without colour. */
  .cell[data-achievement-tier='silver'] .tier-label {
    letter-spacing: 0.11em;
  }

  .cell[data-achievement-tier='gold'] .tier-label {
    letter-spacing: 0.13em;
  }

  .detail {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .detail.muted {
    color: var(--hv-color-basalt-muted);
    font-weight: 700;
  }

  .track {
    height: 0.4rem;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, var(--hv-color-fjord) 14%, var(--hv-color-snow));
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--hv-color-fjord);
    /* A growing width is a size change the eye reads as movement, so it belongs to the motion
       family rather than the fade family. The token already collapses to zero under reduced
       motion, which is why there is no local prefers-reduced-motion query here. */
    transition: width var(--hv-motion-quick) var(--hv-ease-settle);
  }
</style>
