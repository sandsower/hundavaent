<script lang="ts">
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizePlaceCategory } from '$i18n/structured-place';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const statusKey = (status: string): MessageKey => `suggestion.status.${status}` as MessageKey;
  const trustBadgeKey = (tier: string): MessageKey =>
    `contributor.queueBadge.${tier}` as MessageKey;
</script>

<svelte:head>
  <title>{data.copy['suggestion.moderationTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="queue-shell">
  <h1>{data.copy['suggestion.moderationTitle']}</h1>
  {#if data.suggestions.length === 0}
    <p class="empty">{data.copy['suggestion.moderationEmpty']}</p>
  {:else}
    <ul>
      {#each data.suggestions as item (item.suggestionId)}
        <li>
          <div>
            <p class="eyebrow">{data.copy[statusKey(item.outcome)]}</p>
            <h2>{data.lang === 'is' ? item.nameIs : item.nameEn}</h2>
            <p>
              {localizePlaceCategory(item.category, data.copy)} · {item.operatorName} ·
              {item.addressLine}, {item.locality}
            </p>
            {#if 'trustTier' in item && (item.trustTier === 'trusted_contributor' || item.trustTier === 'contributor')}
              <span class={`trust-badge ${item.trustTier}`}
                >{data.copy[trustBadgeKey(item.trustTier)]}</span
              >
            {/if}
          </div>
          <a
            href={resolve('/[lang=lang]/moderation/suggestions/[id]', {
              lang: data.lang,
              id: item.suggestionId
            })}>{data.copy['suggestion.review']}</a
          >
        </li>
      {/each}
    </ul>
    {#if data.nextCursor}
      <a
        class="next"
        href={resolve(
          `/[lang=lang]/moderation/suggestions?cursorRank=${data.nextCursor.queueRank}&cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.suggestionId)}`,
          { lang: data.lang }
        )}>{data.copy['suggestion.nextPage']}</a
      >
    {/if}
    {#if data.hasPrevious}
      <a class="previous" href={resolve('/[lang=lang]/moderation/suggestions', { lang: data.lang })}
        >{data.copy['suggestion.previousPage']}</a
      >
    {/if}
  {/if}
</main>

<style>
  .queue-shell {
    width: min(100% - 2rem, 64rem);
    margin: 3rem auto;
  }
  h1 {
    font-size: clamp(2.5rem, 7vw, 5rem);
    line-height: 0.95;
  }
  ul {
    display: grid;
    gap: 1rem;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    border: 2px solid var(--ink);
    border-radius: 1rem;
    background: var(--paper-raised);
    padding: 1rem;
    box-shadow: 0.25rem 0.3rem 0 var(--teal);
  }
  h2,
  p {
    margin: 0.2rem 0;
  }
  .eyebrow {
    color: var(--coral-dark);
    font-size: 0.8rem;
    font-weight: 950;
    text-transform: uppercase;
  }
  .trust-badge {
    display: inline-block;
    margin-top: 0.3rem;
    border-radius: 999px;
    background: var(--mint);
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    font-weight: 850;
  }
  .trust-badge.trusted_contributor {
    background: var(--sun);
  }
  a {
    flex: none;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.65rem 0.85rem;
    color: var(--ink);
    font-weight: 900;
  }
  .next,
  .previous {
    display: inline-block;
    margin-top: 1rem;
  }
  .previous {
    margin-left: 0.75rem;
  }
  a:focus-visible {
    outline: 4px solid var(--focus);
  }
  .empty {
    border: 2px solid var(--ink);
    border-radius: 1rem;
    background: var(--mint);
    padding: 1rem;
  }
  @media (max-width: 38rem) {
    li {
      display: grid;
    }
  }
</style>
