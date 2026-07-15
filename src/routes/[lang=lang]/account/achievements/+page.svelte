<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
  import type { AchievementGroup, MyAchievement } from '$server/achievements/achievements';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const groupKey = (group: AchievementGroup): MessageKey =>
    `achievements.group.${group}` as MessageKey;
  const name = (achievement: MyAchievement): string =>
    data.lang === 'is' ? achievement.nameIs : achievement.nameEn;
  const description = (achievement: MyAchievement): string =>
    data.lang === 'is' ? achievement.descriptionIs : achievement.descriptionEn;
  const earnedLine = (earnedAt: string): string =>
    data.copy['achievements.earned'].replace('{date}', formatLocalizedDate(earnedAt, data.lang));

  // Group in catalogue order: the RPC returns entries sorted by display_order, so the first
  // appearance of each group preserves the catalogue's own group sequence.
  const groups = $derived(
    data.achievements.achievements
      .filter((achievement) => achievement.earnedAt !== null)
      .reduce<{ group: AchievementGroup; items: MyAchievement[] }[]>((accumulated, achievement) => {
        const existing = accumulated.find((candidate) => candidate.group === achievement.group);
        if (existing) {
          existing.items.push(achievement);
        } else {
          accumulated.push({ group: achievement.group, items: [achievement] });
        }
        return accumulated;
      }, [])
  );
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
    {#if groups.length === 0}
      <p class="empty hv-notice" data-tone="info">{data.copy['achievements.empty']}</p>
    {:else}
      {#each groups as { group, items } (group)}
        <section class="group hv-stack" aria-labelledby={`group-${group}`}>
          <h2 class="group-heading hv-eyebrow" id={`group-${group}`}>
            {data.copy[groupKey(group)]}
          </h2>
          <ul class="catalogue hv-list">
            {#each items as achievement (achievement.key)}
              <li class="achievement hv-panel hv-list-card">
                <p class="name-line">
                  <strong class="name">{name(achievement)}</strong>
                  {#if achievement.isNew}
                    <span class="new-badge hv-status">{data.copy['achievements.new']}</span>
                  {/if}
                </p>
                <p class="description">{description(achievement)}</p>
                <p class="earned">{earnedLine(achievement.earnedAt!)}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
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

  .group {
    --hv-space-context: 0.75rem;
  }

  .group-heading {
    margin: 0;
  }

  .achievement {
    border-inline-start: 0.3rem solid var(--hv-color-moss);
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

  @media (prefers-reduced-motion: no-preference) {
    .new-badge {
      animation: new-badge-settle 360ms ease-out 1;
    }

    @keyframes new-badge-settle {
      from {
        transform: scale(1.18);
      }
      to {
        transform: scale(1);
      }
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

  .empty {
    margin: 0;
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
