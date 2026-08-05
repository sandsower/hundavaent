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

<!-- Each medal sits centred over its own caption rather than beside it. Side by side, the badge
     column plus a wrapping label made the four rungs different heights and clipped the longest
     threshold line; stacked, the row keeps its rhythm at any width. -->
<div
  class="cell group grid grid-cols-[minmax(0,1fr)] justify-items-center min-w-0 gap-[0.55rem] pt-4 px-[0.7rem] pb-[0.85rem] border border-[color-mix(in_srgb,var(--hv-color-fjord)_22%,transparent)] rounded-[0.9rem] text-center data-[tier-state=locked]:border-dashed data-[tier-state=locked]:bg-transparent data-[tier-state=started]:bg-[color-mix(in_srgb,var(--hv-color-fjord)_4%,var(--hv-color-snow-raised))] data-[tier-state=earned]:border-[color-mix(in_srgb,var(--hv-color-moss)_42%,transparent)] data-[tier-state=earned]:bg-[color-mix(in_srgb,var(--hv-color-moss)_11%,var(--hv-color-snow-raised))]"
  data-achievement-tier={entry.tier}
  data-tier-state={state}
>
  <span class="tier-badge block w-[3.4rem]">
    <AchievementBadge
      achievementKey={entry.key}
      collection={entry.collection}
      group={entry.group}
      tier={entry.tier}
      {state}
      progress={entry.kind === 'locked' ? entry.progress.current / entry.progress.target : 1}
    />
  </span>

  <div class="tier-copy grid content-center justify-items-center w-full min-w-0 gap-[0.4rem]">
    <!-- Letter-spacing increases across the row, so the four rungs read as a progression without
         colour. -->
    <p
      class="tier-label m-0 text-[0.68rem] font-black tracking-[0.09em] uppercase text-basalt-muted group-data-[tier-state=earned]:text-moss group-data-[achievement-tier=silver]:tracking-[0.11em] group-data-[achievement-tier=gold]:tracking-[0.13em] group-data-[achievement-tier=platinum]:tracking-[0.15em]"
    >
      {label}
    </p>

    {#if entry.kind === 'earned'}
      <p class="detail m-0 text-[0.8rem] font-bold leading-[1.35] wrap-anywhere">
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
          class="track w-full h-[0.4rem] rounded-[999px] overflow-hidden bg-[color-mix(in_srgb,var(--hv-color-fjord)_14%,var(--hv-color-snow))]"
          role="progressbar"
          aria-label={line}
          aria-valuemin="0"
          aria-valuemax={entry.progress.target}
          aria-valuenow={entry.progress.current}
        >
          <!-- A growing width is a size change the eye reads as movement, so it belongs to the motion
               family rather than the fade family. The token already collapses to zero under reduced
               motion, which is why there is no local prefers-reduced-motion query here. -->
          <span
            class="fill block h-full rounded-[inherit] bg-fjord transition-[width] duration-[var(--hv-motion-quick)] ease-settle"
            style:width={`${Math.round((entry.progress.current / entry.progress.target) * 100)}%`}
          ></span>
        </div>
        <p class="detail m-0 text-[0.8rem] font-bold leading-[1.35] wrap-anywhere">{line}</p>
      {:else}
        <p
          class="detail muted m-0 text-[0.8rem] font-bold leading-[1.35] wrap-anywhere text-basalt-muted"
        >
          {targetLabel(entry.progress.kind, entry.progress.target, copy)}
        </p>
      {/if}
    {/if}
  </div>
</div>
