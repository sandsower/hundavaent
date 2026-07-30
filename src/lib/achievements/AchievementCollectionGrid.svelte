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
  <section class="collections grid gap-context" aria-labelledby="achievement-collections-heading">
    <header class="section-header">
      <h2 id="achievement-collections-heading">{copy['achievements.collectionsTitle']}</h2>
      <p class="spacing-note">{copy['achievements.spacingNote']}</p>
    </header>

    <ul class="collection-list grid gap-context m-0 p-0 list-none">
      {#each collections as collection (collection.key)}
        <Panel as="li" padded class="collection" aria-label={collectionName(collection.head, lang)}>
          <div class="collection-head">
            <h3>{collectionName(collection.head, lang)}</h3>
            {#if collection.key === 'explorer_places' && collection.goldEarned && collection.progress?.total}
              {@const percentage = Math.floor(
                (100 * collection.progress.current) / Math.max(collection.progress.total, 15)
              )}
              <p class="continuation">
                {copy['achievements.coverage'].replace('{percentage}', String(percentage))}
              </p>
            {:else if collection.key === 'contributions' && collection.platinumEarned && collection.progress?.nextMilestone}
              <p class="continuation">
                {copy['achievements.contributionContinuation']
                  .replace('{current}', String(collection.progress.current))
                  .replace('{next}', String(collection.progress.nextMilestone))}
              </p>
            {/if}
          </div>

          <div class="tier-row">
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
  .collections {
    --hv-space-context: 1rem;
  }

  .section-header h2,
  .section-header p {
    margin: 0;
  }

  .section-header h2 {
    font-family: var(--hv-font-display);
    font-size: clamp(1.35rem, 4vw, 1.8rem);
  }

  .section-header p {
    max-width: 52ch;
    margin-block-start: 0.35rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  .spacing-note {
    font-size: 0.88rem;
  }

  .collection-list {
    --hv-space-context: 0.85rem;
  }

  /* .collection now renders through Panel (a child component), so the hook needs :global() -
     Panel's own border/radius/shadow/background/padding stay untouched; this only adds layout. */
  :global(.collection) {
    display: grid;
    gap: 0.85rem;
  }

  .collection-head {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: 1.08rem;
    line-height: 1.2;
  }

  .continuation {
    margin: 0;
    color: var(--hv-color-moss);
    font-size: 0.82rem;
    font-weight: 800;
    text-align: end;
  }

  .tier-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.6rem;
  }

  @media (max-width: 48rem) {
    .tier-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 30rem) {
    .tier-row {
      grid-template-columns: 1fr;
    }
  }
</style>
