<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type {
    AchievementTier,
    AchievementCollectionProgress,
    EarnedTierAchievement,
    LockedTierAchievement,
    MyAchievement
  } from '$server/achievements/achievements';
  import { Panel } from '@hundavaent/design-system';
  import AchievementTierCell from './AchievementTierCell.svelte';
  import { collectionName } from './tier-copy';

  interface Props {
    achievements: MyAchievement[];
    lang: Locale;
    copy: Catalogue;
    progress?: AchievementCollectionProgress[];
  }

  let { achievements, lang, copy, progress = [] }: Props = $props();

  type TierEntry = EarnedTierAchievement | LockedTierAchievement;

  const tierOrder: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];

  // Collections keep the order the RPC returned, which is display_order, so the first appearance of
  // each collection preserves the catalogue's own sequence.
  const collections = $derived(
    achievements
      .filter((achievement): achievement is TierEntry => achievement.entry === 'tier')
      .reduce<{ key: string; head: TierEntry; tiers: TierEntry[] }[]>((accumulated, entry) => {
        const existing = accumulated.find((candidate) => candidate.key === entry.collection);
        if (existing) {
          existing.tiers.push(entry);
        } else {
          accumulated.push({ key: entry.collection, head: entry, tiers: [entry] });
        }
        return accumulated;
      }, [])
      .map((collection) => {
        const tiers = tierOrder
          .map((tier) => collection.tiers.find((entry) => entry.tier === tier))
          .filter((entry): entry is TierEntry => entry !== undefined);
        return {
          ...collection,
          tiers,
          progress: progress.find((entry) => entry.collection === collection.key),
          // The nearest unearned tier is the Member's one active target in this collection.
          activeKey: tiers.find((entry) => entry.kind === 'locked')?.key,
          goldEarned: tiers.some((entry) => entry.tier === 'gold' && entry.kind === 'earned'),
          platinumEarned: tiers.some(
            (entry) => entry.tier === 'platinum' && entry.kind === 'earned'
          )
        };
      })
  );
</script>

{#if collections.length > 0}
  <section
    class="collections grid gap-context [--hv-space-context:1rem]"
    aria-labelledby="achievement-collections-heading"
  >
    <header class="section-header">
      <h2
        id="achievement-collections-heading"
        class="m-0 font-display text-[clamp(1.35rem,_4vw,_1.8rem)]"
      >
        {copy['achievements.collectionsTitle']}
      </h2>
      <p
        class="spacing-note max-w-[52ch] mx-0 mt-[0.35rem] mb-0 text-[0.88rem] leading-normal text-basalt-muted"
      >
        {copy['achievements.spacingNote']}
      </p>
    </header>

    <ul class="collection-list grid gap-context m-0 p-0 list-none [--hv-space-context:0.85rem]">
      {#each collections as collection (collection.key)}
        <Panel as="li" padded class="collection" aria-label={collectionName(collection.head, lang)}>
          <div class="collection-head flex items-baseline justify-between min-w-0 gap-3">
            <h3 class="m-0 font-display text-[1.08rem] leading-[1.2]">
              {collectionName(collection.head, lang)}
            </h3>
            {#if collection.key === 'explorer_places' && collection.goldEarned && collection.progress?.total}
              {@const percentage = Math.floor(
                (100 * collection.progress.current) / Math.max(collection.progress.total, 15)
              )}
              <p class="continuation m-0 text-[0.82rem] font-extrabold text-end text-moss">
                {copy['achievements.coverage'].replace('{percentage}', String(percentage))}
              </p>
            {:else if collection.key === 'contributions' && collection.platinumEarned && collection.progress?.nextMilestone}
              <p class="continuation m-0 text-[0.82rem] font-extrabold text-end text-moss">
                {copy['achievements.contributionContinuation']
                  .replace('{current}', String(collection.progress.current))
                  .replace('{next}', String(collection.progress.nextMilestone))}
              </p>
            {/if}
          </div>

          <div class="tier-row grid grid-cols-[repeat(auto-fit,_minmax(7.5rem,_1fr))] gap-[0.7rem]">
            {#each collection.tiers as entry (entry.key)}
              <AchievementTierCell
                {entry}
                active={entry.key === collection.activeKey}
                {lang}
                {copy}
              />
            {/each}
          </div>
        </Panel>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* .collection now renders through Panel (a child component), so the hook needs :global() -
     Panel's own border/radius/shadow/background/padding stay untouched; this only adds layout.
     Anchored through the locally-hashed .collection-list rather than left bare so the generic
     name cannot leak once this component's CSS is injected app-wide. */
  .collection-list :global(.collection) {
    display: grid;
    gap: 0.85rem;
  }
</style>
