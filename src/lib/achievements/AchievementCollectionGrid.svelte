<script lang="ts">
  import type { Catalogue, Locale } from '$i18n';
  import type {
    AchievementTier,
    EarnedTierAchievement,
    LockedTierAchievement,
    MyAchievement
  } from '$server/achievements/achievements';
  import AchievementIcon from './AchievementIcon.svelte';
  import AchievementTierCell from './AchievementTierCell.svelte';
  import { collectionDescription, collectionName } from './tier-copy';

  interface Props {
    achievements: MyAchievement[];
    lang: Locale;
    copy: Catalogue;
  }

  let { achievements, lang, copy }: Props = $props();

  type TierEntry = EarnedTierAchievement | LockedTierAchievement;

  const tierOrder: AchievementTier[] = ['bronze', 'silver', 'gold'];

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
      <p>{copy['achievements.collectionsIntro']}</p>
      <p class="spacing-note">{copy['achievements.spacingNote']}</p>
    </header>

    <ul class="collection-list hv-list">
      {#each collections as collection (collection.key)}
        <li class="collection hv-panel" aria-label={collectionName(collection.head, lang)}>
          <div class="collection-head">
            <span class="collection-icon" aria-hidden="true">
              <AchievementIcon
                achievementKey={collection.head.key}
                collection={collection.key}
                group={collection.head.group}
              />
            </span>
            <div>
              <h3>{collectionName(collection.head, lang)}</h3>
              <p class="collection-description">
                {collectionDescription(collection.head, lang)}
              </p>
            </div>
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
    display: grid;
    grid-template-columns: 2.6rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: start;
  }

  .collection-icon {
    display: grid;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--hv-color-fjord) 12%, white);
    color: var(--hv-color-fjord);
    padding: 0.55rem;
    place-items: center;
  }

  h3 {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: 1.08rem;
    line-height: 1.2;
  }

  .collection-description {
    max-width: 46ch;
    margin: 0.25rem 0 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .tier-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }

  @media (max-width: 30rem) {
    .tier-row {
      grid-template-columns: 1fr;
    }
  }
</style>
