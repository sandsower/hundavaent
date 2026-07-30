<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import {
    Eyebrow,
    Meta,
    PageHeader,
    PageShell,
    PageTitle,
    Panel
  } from '@hundavaent/design-system';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
  import AchievementBadge from '$lib/achievements/AchievementBadge.svelte';
  import AchievementCelebration from '$lib/achievements/AchievementCelebration.svelte';
  import AchievementCollectionGrid from '$lib/achievements/AchievementCollectionGrid.svelte';
  import AchievementContinuationCelebration from '$lib/achievements/AchievementContinuationCelebration.svelte';
  import AchievementShare from '$lib/achievements/AchievementShare.svelte';
  import { publishAchievementAcknowledged } from '$lib/achievements/client';
  import type {
    AchievementGroup,
    ClaimedAchievement,
    ClaimedAchievementContinuation,
    EarnedBespokeAchievement
  } from '$server/achievements/achievements';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let claimForm = $state<HTMLFormElement>();
  let claimed = $state<ClaimedAchievement[]>([]);
  let continuations = $state<ClaimedAchievementContinuation[]>([]);

  $effect.pre(() => {
    if (hasClaimResult(form)) {
      claimed = form.claimed as ClaimedAchievement[];
      continuations = form.continuations as ClaimedAchievementContinuation[];
    }
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
      continuations = Array.isArray(result.data.continuations)
        ? (result.data.continuations as ClaimedAchievementContinuation[])
        : [];
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
    continuations: ClaimedAchievementContinuation[];
  } {
    return (
      value !== null &&
      'action' in value &&
      value.action === 'claimAchievements' &&
      'claimed' in value &&
      Array.isArray(value.claimed) &&
      'continuations' in value &&
      Array.isArray(value.continuations)
    );
  }
</script>

<svelte:head>
  <title>{data.copy['achievements.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<PageShell width="narrow" class="achievements-shell grid gap-context">
  <PageHeader>
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle>{data.copy['achievements.title']}</PageTitle>

    {#if data.achievements.enabled}
      <Meta class="intro">{data.copy['achievements.intro']}</Meta>
    {/if}
  </PageHeader>

  {#if data.achievements.enabled}
    <form
      class="claim-form"
      method="POST"
      action="?/claimAchievements"
      use:enhance={enhanceClaim}
      bind:this={claimForm}
      aria-hidden="true"
    ></form>

    {#if claimed.length > 0 || continuations.length > 0}
      <section class="celebrations grid gap-context" aria-live="polite">
        {#each claimed as achievement (achievement.key)}
          <AchievementCelebration {achievement} lang={data.lang} copy={data.copy} />
        {/each}
        {#each continuations as continuation (`${continuation.collection}-${continuation.milestone}`)}
          <AchievementContinuationCelebration {continuation} copy={data.copy} />
        {/each}
      </section>
    {/if}

    <AchievementCollectionGrid
      achievements={data.achievements.achievements}
      progress={data.collectionProgress}
      lang={data.lang}
      copy={data.copy}
    />

    {#if groups.length > 0}
      <section class="archive grid gap-context" aria-labelledby="achievement-archive-heading">
        <h2 id="achievement-archive-heading">{data.copy['achievements.archiveTitle']}</h2>
        {#each groups as { group, items } (group)}
          <section class="group grid gap-context" aria-labelledby={`group-${group}`}>
            <Eyebrow as="h3" class="group-heading" id={`group-${group}`}>
              {data.copy[groupKey(group)]}
            </Eyebrow>
            <ul class="catalogue grid gap-context m-0 p-0 list-none">
              {#each items as achievement (achievement.key)}
                <Panel as="li" padded class="achievement">
                  <span class="earned-badge">
                    <AchievementBadge
                      achievementKey={achievement.key}
                      group={achievement.group}
                      state="earned"
                    />
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
                    <AchievementShare
                      card={{
                        achievementKey: achievement.key,
                        collection: null,
                        group: achievement.group,
                        tier: null,
                        name: name(achievement),
                        description: description(achievement),
                        brand: data.copy['site.name'],
                        eyebrow: data.copy['achievements.share.cardEyebrow']
                      }}
                      copy={data.copy}
                    />
                  </div>
                </Panel>
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
</PageShell>

<style>
  :global(.intro) {
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

  :global(.achievement) {
    display: grid;
    grid-template-columns: 3.4rem minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
    border-inline-start: 0.3rem solid var(--hv-color-moss);
  }

  .earned-badge {
    display: block;
    width: 3.4rem;
    /* A small lift when the tile is revisited: the badge perks up without the words moving. */
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  :global(.achievement):hover .earned-badge {
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
