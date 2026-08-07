<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import {
    Button,
    Eyebrow,
    Meta,
    Notice,
    PageHeader,
    PageShell,
    PageTitle,
    Panel,
    Status
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
      <Meta class="achievements-intro">{data.copy['achievements.intro']}</Meta>
    {/if}
  </PageHeader>

  {#if data.achievements.enabled}
    <form
      class="claim-form hidden"
      method="POST"
      action="?/claimAchievements"
      use:enhance={enhanceClaim}
      bind:this={claimForm}
      aria-hidden="true"
    ></form>

    {#if claimed.length > 0 || continuations.length > 0}
      <section class="celebrations grid gap-context [--hv-space-context:1rem]" aria-live="polite">
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
      <section
        class="archive grid gap-context [--hv-space-context:1rem]"
        aria-labelledby="achievement-archive-heading"
      >
        <h2
          id="achievement-archive-heading"
          class="m-0 font-display text-[clamp(1.35rem,_4vw,_1.8rem)]"
        >
          {data.copy['achievements.archiveTitle']}
        </h2>
        {#each groups as { group, items } (group)}
          <section
            class="group grid gap-context [--hv-space-context:0.75rem]"
            aria-labelledby={`group-${group}`}
          >
            <Eyebrow as="h3" class="group-heading" id={`group-${group}`}>
              {data.copy[groupKey(group)]}
            </Eyebrow>
            <ul class="catalogue grid gap-context m-0 p-0 list-none">
              {#each items as achievement (achievement.key)}
                <Panel as="li" padded class="achievement group/achievement">
                  <!-- A small lift when the tile is revisited: the badge perks up without the
                       words moving. -->
                  <span
                    class="earned-badge block w-[3.4rem] transition-transform duration-[var(--hv-motion-quick)] ease-settle group-hover/achievement:transform-[translateY(-0.2rem)_rotate(-4deg)]"
                  >
                    <AchievementBadge
                      achievementKey={achievement.key}
                      group={achievement.group}
                      state="earned"
                    />
                  </span>
                  <div>
                    <p class="name-line flex items-center m-0 gap-[0.6rem]">
                      <strong class="name font-black">{name(achievement)}</strong>
                      {#if claimedKeys.has(achievement.key)}
                        <Status class="new-badge">{data.copy['achievements.new']}</Status>
                      {/if}
                    </p>
                    <p class="description mx-0 mt-[0.4rem] mb-0 leading-normal">
                      {description(achievement)}
                    </p>
                    <p class="earned mx-0 mt-2 mb-0 text-[0.9rem] font-bold text-basalt-muted">
                      {earnedLine(achievement.earnedAt)}
                    </p>
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
    <Notice as="section" tone="info" class="disabled-card">
      <!-- .disabled-card renders through Notice (a child component), which is why an ancestor hook
           on it would need :global(); this <p> is still authored literally in this file, so it
           keeps its normal scope hash and its own reset lands as utilities on the element. -->
      <p class="m-0 leading-[1.55]">{data.copy['achievements.disabled']}</p>
    </Notice>
  {/if}

  <Button
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
    intent="quiet"
    class="achievements-back-link"
  >
    {data.copy['account.navSignedIn']}
  </Button>
</PageShell>

<style>
  :global(.achievements-intro) {
    max-width: 46ch;
  }

  :global(.achievement) {
    display: grid;
    grid-template-columns: 3.4rem minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
    border-inline-start: 0.3rem solid var(--hv-color-moss);
  }

  /* Renders through Status (a child component), so the hook class needs :global(). */
  :global(.new-badge) {
    text-transform: uppercase;
  }

  :global(.new-badge) {
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

  /* Renders through Button (a child component), so the layout hook needs :global(); the fjord
     border/text this used to hand-roll is now Button's quiet intent. */
  :global(.achievements-back-link) {
    justify-self: start;
  }
</style>
