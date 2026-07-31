<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import type {
    EarnedTierAchievement,
    LockedTierAchievement
  } from '$server/achievements/achievements';
  import AchievementBadge from './AchievementBadge.svelte';
  import AchievementShare from './AchievementShare.svelte';
  import {
    collectionName,
    progressLabel,
    targetLabel,
    tierDisplayName,
    tierLabel
  } from './tier-copy';

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
  const shareCard = $derived({
    achievementKey: entry.key,
    collection: entry.collection,
    group: entry.group,
    tier: entry.tier,
    name: tierDisplayName(collectionName(entry, lang), entry.tier, copy),
    description: lang === 'is' ? entry.collectionDescriptionIs : entry.collectionDescriptionEn,
    brand: copy['site.name'],
    eyebrow: copy['achievements.share.cardEyebrow']
  });
</script>

<div class="cell" data-achievement-tier={entry.tier} data-tier-state={state}>
  <span class="tier-badge">
    <AchievementBadge
      achievementKey={entry.key}
      collection={entry.collection}
      group={entry.group}
      tier={entry.tier}
      {state}
      progress={entry.kind === 'locked' ? entry.progress.current / entry.progress.target : 1}
    />
  </span>

  <div class="tier-copy">
    <p class="tier-label">{label}</p>

    {#if entry.kind === 'earned'}
      <p class="detail">
        {copy['achievements.earned'].replace('{date}', formatLocalizedDate(entry.earnedAt, lang))}
      </p>
      <AchievementShare card={shareCard} {copy} />
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
        <p class="detail muted">{targetLabel(entry.progress.kind, entry.progress.target, copy)}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Each medal sits centred over its own caption rather than beside it. Side by side, the badge
     column plus a wrapping label made the four rungs different heights and clipped the longest
     threshold line; stacked, the row keeps its rhythm at any width. */
  .cell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.55rem;
    min-width: 0;
    justify-items: center;
    border: 1px solid color-mix(in srgb, var(--hv-color-fjord) 22%, transparent);
    border-radius: 0.9rem;
    padding: 1rem 0.7rem 0.85rem;
    text-align: center;
  }

  .cell[data-tier-state='locked'] {
    border-style: dashed;
    background: transparent;
    /* Rungs ahead recede rather than compete with the one being worked on. */
    opacity: 0.62;
  }

  .cell[data-tier-state='started'] {
    background: color-mix(in srgb, var(--hv-color-fjord) 4%, var(--hv-color-snow-raised));
  }

  .cell[data-tier-state='earned'] {
    border-color: color-mix(in srgb, var(--hv-color-moss) 42%, transparent);
    background: color-mix(in srgb, var(--hv-color-moss) 11%, var(--hv-color-snow-raised));
  }

  .tier-badge {
    display: block;
    width: 3.4rem;
  }

  .tier-copy {
    display: grid;
    width: 100%;
    min-width: 0;
    gap: 0.4rem;
    align-content: center;
    justify-items: center;
  }

  .tier-label {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .cell[data-tier-state='earned'] .tier-label {
    color: var(--hv-color-moss);
  }

  /* Letter-spacing increases across the row, so the four rungs read as a progression without
     colour. */
  .cell[data-achievement-tier='silver'] .tier-label {
    letter-spacing: 0.11em;
  }

  .cell[data-achievement-tier='gold'] .tier-label {
    letter-spacing: 0.13em;
  }

  .cell[data-achievement-tier='platinum'] .tier-label {
    letter-spacing: 0.15em;
  }

  .detail {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .detail.muted {
    color: var(--hv-color-basalt-muted);
    font-weight: 700;
  }

  .track {
    width: 100%;
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
