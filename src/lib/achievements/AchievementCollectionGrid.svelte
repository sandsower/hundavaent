<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type {
    AchievementTier,
    EarnedTierAchievement,
    LockedTierAchievement,
    MyAchievement
  } from '$server/achievements/achievements';
  import AchievementTierCell from './AchievementTierCell.svelte';
  import { collectionName } from './tier-copy';

  interface Props {
    achievements: MyAchievement[];
    lang: Locale;
    copy: Catalogue;
  }

  let { achievements, lang, copy }: Props = $props();

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
          // The nearest unearned tier is the Member's one active target in this collection.
          activeKey: tiers.find((entry) => entry.kind === 'locked')?.key
        };
      })
  );
</script>

{#if collections.length > 0}
  <section class="collections hv-stack" aria-labelledby="achievement-collections-heading">
    <header class="section-header">
      <h2 id="achievement-collections-heading">{copy['achievements.collectionsTitle']}</h2>
      <p class="spacing-note">{copy['achievements.spacingNote']}</p>
    </header>

    <ul class="collection-list hv-list">
      {#each collections as collection (collection.key)}
        <li
          class="collection hv-panel hv-list-card"
          aria-label={collectionName(collection.head, lang)}
        >
          <div class="collection-head">
            <h3>{collectionName(collection.head, lang)}</h3>
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
        </li>
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

  .collection {
    display: grid;
    gap: 0.85rem;
  }

  .collection-head {
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: 1.08rem;
    line-height: 1.2;
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
