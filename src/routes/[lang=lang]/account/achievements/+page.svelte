<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
  import AchievementCelebration from '$lib/achievements/AchievementCelebration.svelte';
  import AchievementCollectionGrid from '$lib/achievements/AchievementCollectionGrid.svelte';
  import AchievementIcon from '$lib/achievements/AchievementIcon.svelte';
  import { publishAchievementAcknowledged } from '$lib/achievements/client';
  import type {
    AchievementGroup,
    ClaimedAchievement,
    EarnedBespokeAchievement
  } from '$server/achievements/achievements';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let claimForm = $state<HTMLFormElement>();
  let claimed = $state<ClaimedAchievement[]>([]);

  $effect.pre(() => {
    if (hasClaimResult(form)) claimed = form.claimed as ClaimedAchievement[];
  });

  const groupKey = (group: AchievementGroup): MessageKey =>
    `achievements.group.${group}` as MessageKey;
  const name = (achievement: EarnedBespokeAchievement): string =>
    data.lang === 'is' ? achievement.nameIs : achievement.nameEn;
  const description = (achievement: EarnedBespokeAchievement): string =>
    data.lang === 'is' ? achievement.descriptionIs : achievement.descriptionEn;
  const earnedLine = (earnedAt: string): string =>
    data.copy['achievements.earned'].replace('{date}', formatLocalizedDate(earnedAt, data.lang));

  // The archive holds only the bespoke Achievements. Tiers live in the grid above, where their
  // locked siblings are the point.
  const earnedBespoke = $derived(
    data.achievements.achievements.filter(
      (achievement): achievement is EarnedBespokeAchievement =>
        achievement.kind === 'earned' && achievement.entry === 'bespoke'
    )
  );
  const claimedKeys = $derived(new Set(claimed.map((achievement) => achievement.key)));

  // Group in catalogue order: the RPC returns entries sorted by display_order, so the first
  // appearance of each group preserves the catalogue's own group sequence.
  const groups = $derived(
    earnedBespoke.reduce<{ group: AchievementGroup; items: EarnedBespokeAchievement[] }[]>(
      (accumulated, achievement) => {
        const existing = accumulated.find((candidate) => candidate.group === achievement.group);
        if (existing) {
          existing.items.push(achievement);
        } else {
          accumulated.push({ group: achievement.group, items: [achievement] });
        }
        return accumulated;
      },
      []
    )
  );

  const enhanceClaim: SubmitFunction = () => {
    return async ({ result }) => {
      if (
        result.type !== 'success' ||
        !result.data ||
        result.data.action !== 'claimAchievements' ||
        !Array.isArray(result.data.claimed)
      ) {
        return;
      }

      claimed = result.data.claimed as ClaimedAchievement[];
      publishAchievementAcknowledged();
    };
  };

  onMount(() => {
    if (data.achievements.enabled && !hasClaimResult(form)) {
      claimForm?.requestSubmit();
    }
  });

  function hasClaimResult(value: PageProps['form']): value is NonNullable<PageProps['form']> & {
    action: 'claimAchievements';
    claimed: ClaimedAchievement[];
  } {
    return (
      value !== null &&
      'action' in value &&
      value.action === 'claimAchievements' &&
      'claimed' in value &&
      Array.isArray(value.claimed)
    );
  }
</script>

<svelte:head>
  <title>{data.copy['achievements.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="achievements-shell hv-page-shell hv-stack" data-ui-mode="place" data-width="narrow">
  <header class="hv-page-header">
    <p class="hv-eyebrow">{data.copy['site.name']}</p>
    <h1 class="hv-page-title">{data.copy['achievements.title']}</h1>

    {#if data.achievements.enabled}
      <p class="intro hv-meta">{data.copy['achievements.intro']}</p>
    {/if}
  </header>

  {#if data.achievements.enabled}
    <form
      class="claim-form"
      method="POST"
      action="?/claimAchievements"
      use:enhance={enhanceClaim}
      bind:this={claimForm}
      aria-hidden="true"
    ></form>

    {#if claimed.length > 0}
      <section class="celebrations hv-stack" aria-live="polite">
        {#each claimed as achievement (achievement.key)}
          <AchievementCelebration {achievement} lang={data.lang} copy={data.copy} />
        {/each}
      </section>
    {/if}

    <AchievementCollectionGrid
      achievements={data.achievements.achievements}
      lang={data.lang}
      copy={data.copy}
    />

    {#if groups.length > 0}
      <section class="archive hv-stack" aria-labelledby="achievement-archive-heading">
        <h2 id="achievement-archive-heading">{data.copy['achievements.archiveTitle']}</h2>
        {#each groups as { group, items } (group)}
          <section class="group hv-stack" aria-labelledby={`group-${group}`}>
            <h3 class="group-heading hv-eyebrow" id={`group-${group}`}>
              {data.copy[groupKey(group)]}
            </h3>
            <ul class="catalogue hv-list">
              {#each items as achievement (achievement.key)}
                <li class="achievement hv-panel hv-list-card">
                  <span class="earned-icon" aria-hidden="true">
                    <AchievementIcon achievementKey={achievement.key} group={achievement.group} />
                  </span>
                  <div>
                    <p class="name-line">
                      <strong class="name">{name(achievement)}</strong>
                      {#if claimedKeys.has(achievement.key)}
                        <span class="new-badge hv-status">{data.copy['achievements.new']}</span>
                      {/if}
                    </p>
                    <p class="description">{description(achievement)}</p>
                    <p class="earned">{earnedLine(achievement.earnedAt)}</p>
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </section>
    {/if}
  {:else}
    <section class="disabled-card hv-notice" data-tone="info">
      <p>{data.copy['achievements.disabled']}</p>
    </section>
  {/if}

  <a class="back-link hv-control" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
    {data.copy['account.navSignedIn']}
  </a>
</main>

<style>
  .intro {
    max-width: 46ch;
  }

  .claim-form {
    display: none;
  }

  .celebrations,
  .archive {
    --hv-space-context: 1rem;
  }

  .archive > h2 {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: clamp(1.35rem, 4vw, 1.8rem);
  }

  .group {
    --hv-space-context: 0.75rem;
  }

  .group-heading {
    margin: 0;
  }

  .achievement {
    display: grid;
    grid-template-columns: 2.8rem minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
    border-inline-start: 0.3rem solid var(--hv-color-moss);
  }

  .earned-icon {
    display: grid;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: 0.95rem;
    background: color-mix(in srgb, var(--hv-color-moss) 13%, white);
    color: var(--hv-color-moss);
    padding: 0.58rem;
    place-items: center;
    /* A small lift when the tile is revisited: the badge perks up without the words moving. */
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  .achievement:hover .earned-icon {
    transform: translateY(-0.2rem) rotate(-4deg);
  }

  .name-line {
    display: flex;
    align-items: center;
    margin: 0;
    gap: 0.6rem;
  }
  .name {
    font-weight: 900;
  }

  .new-badge {
    text-transform: uppercase;
  }

  .new-badge {
    animation: new-badge-settle var(--hv-motion-celebrate) var(--hv-ease-settle) 1;
  }

  @keyframes new-badge-settle {
    from {
      transform: scale(1.18);
    }
    to {
      transform: scale(1);
    }
  }

  .description {
    margin: 0.4rem 0 0;
    line-height: 1.5;
  }

  .earned {
    margin: 0.5rem 0 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .disabled-card p {
    margin: 0;
    line-height: 1.55;
  }

  .back-link {
    border-color: var(--hv-color-fjord);
    justify-self: start;
    color: var(--hv-color-fjord);
  }
</style>
