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

<main class="achievements-shell">
  <h1>{data.copy['achievements.title']}</h1>

  {#if data.achievements.enabled}
    <p class="intro">{data.copy['achievements.intro']}</p>

    {#if groups.length === 0}
      <p class="empty">{data.copy['achievements.empty']}</p>
    {:else}
      {#each groups as { group, items } (group)}
        <section class="group" aria-labelledby={`group-${group}`}>
          <h2 class="group-heading" id={`group-${group}`}>{data.copy[groupKey(group)]}</h2>
          <ul class="catalogue">
            {#each items as achievement (achievement.key)}
              <li class="achievement">
                <p class="name-line">
                  <strong class="name">{name(achievement)}</strong>
                  {#if achievement.isNew}
                    <span class="new-badge">{data.copy['achievements.new']}</span>
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
    <section class="disabled-card">
      <p>{data.copy['achievements.disabled']}</p>
    </section>
  {/if}

  <a class="back-link" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
    {data.copy['account.navSignedIn']}
  </a>
</main>

<style>
  .achievements-shell {
    width: min(100% - 2rem, 40rem);
    margin: 3rem auto;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: clamp(2.2rem, 7vw, 4rem);
    line-height: 0.98;
  }
  .intro {
    max-width: 46ch;
    margin: 0 0 1.5rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .group {
    margin: 0 0 1.75rem;
  }
  .group-heading {
    margin: 0 0 0.75rem;
    color: var(--coral-dark);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .catalogue {
    display: grid;
    margin: 0;
    padding: 0;
    gap: 0.75rem;
    list-style: none;
  }
  .achievement {
    border: 2px solid var(--ink);
    border-radius: 1.4rem 0.7rem 1.4rem 0.7rem;
    background: var(--paper-light);
    padding: 1rem 1.25rem;
    box-shadow: 0.35rem 0.35rem 0 var(--teal);
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
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.1rem 0.55rem;
    color: var(--ink);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
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
    font-size: 0.9rem;
  }
  .earned {
    color: var(--ink);
    font-weight: 700;
  }
  .empty {
    color: var(--ink-soft);
  }
  .disabled-card {
    border: 2px solid var(--ink);
    border-radius: 1.4rem 0.7rem 1.4rem 0.7rem;
    background: var(--paper-light);
    padding: clamp(1.25rem, 4vw, 2rem);
    box-shadow: 0.6rem 0.6rem 0 var(--teal);
  }
  .disabled-card p {
    margin: 0;
    line-height: 1.55;
  }
  .back-link {
    display: inline-block;
    margin-top: 1.5rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.7rem 1.15rem;
    color: var(--ink);
    font-weight: 850;
    text-decoration: none;
  }
</style>
