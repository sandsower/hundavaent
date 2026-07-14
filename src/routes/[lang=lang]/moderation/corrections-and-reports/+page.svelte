<script lang="ts">
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizePlaceField } from '$i18n/structured-place';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  function statusKey(status: string): MessageKey {
    return `flag.status.${status}` as MessageKey;
  }

  function kindKey(kind: string): MessageKey {
    return `flag.kind.${kind}` as MessageKey;
  }

  function name(item: (typeof data.flags)[number]): string {
    return data.lang === 'is' ? item.placeNameIs : item.placeNameEn;
  }

  function target(item: (typeof data.flags)[number]): string {
    return item.targetKind === 'place_field' && item.targetField
      ? localizePlaceField(item.targetField, data.copy)
      : data.copy['correction.targetAccessCondition'];
  }
</script>

<svelte:head>
  <title>{data.copy['flag.moderationTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="queue-shell">
  <h1>{data.copy['flag.moderationTitle']}</h1>

  {#if data.flags.length === 0}
    <p class="empty">{data.copy['flag.moderationEmpty']}</p>
  {:else}
    <ul>
      {#each data.flags as item (item.flagId)}
        <li>
          <div>
            <p class="eyebrow">
              {data.copy[kindKey(item.kind)]} · {data.copy[statusKey(item.outcome)]}
              {#if item.isSafetyConcern}
                <span class="safety">{data.copy['flag.safetyConcernBadge']}</span>
              {/if}
            </p>
            <h2>{name(item)}</h2>
            <p>{target(item)}</p>
          </div>
          <a
            href={resolve('/[lang=lang]/moderation/corrections-and-reports/[id]', {
              lang: data.lang,
              id: item.flagId
            })}>{data.copy['flag.review']}</a
          >
        </li>
      {/each}
    </ul>
  {/if}

  {#if data.nextCursor}
    <a
      class="next"
      href={resolve(
        `/[lang=lang]/moderation/corrections-and-reports?cursorPriority=${data.nextCursor.priority}&cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.flagId)}`,
        { lang: data.lang }
      )}>{data.copy['flag.nextPage']}</a
    >
  {/if}
  {#if data.hasPrevious}
    <a
      class="previous"
      href={resolve('/[lang=lang]/moderation/corrections-and-reports', { lang: data.lang })}
      >{data.copy['flag.previousPage']}</a
    >
  {/if}
</main>

<style>
  .queue-shell {
    width: min(100% - 2rem, 64rem);
    margin: 3rem auto;
  }
  h1 {
    margin: 0 0 1.5rem;
    font-size: clamp(2rem, 5vw, 3rem);
  }
  .empty {
    border: 2px solid var(--ink);
    border-radius: 1rem;
    background: var(--mint);
    padding: 1rem;
    font-weight: 850;
  }
  ul {
    display: grid;
    gap: 0.8rem;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    border: 2px solid var(--ink);
    border-radius: 1.1rem;
    background: var(--paper-raised);
    padding: 1rem;
    box-shadow: 0.25rem 0.3rem 0 var(--teal);
  }
  .eyebrow {
    margin: 0;
    color: var(--coral-dark);
    font-size: 0.8rem;
    font-weight: 950;
    text-transform: uppercase;
  }
  .safety {
    border-radius: 999px;
    background: var(--coral-soft);
    padding: 0.2rem 0.5rem;
    color: var(--coral-dark);
  }
  h2 {
    margin: 0.2rem 0;
  }
  li a {
    flex-shrink: 0;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    padding: 0.6rem 1rem;
    font-weight: 900;
  }
  a:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
  a.next,
  a.previous {
    display: inline-block;
    margin-top: 1.5rem;
    margin-right: 1rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    padding: 0.6rem 1rem;
    font-weight: 900;
  }
  @media (max-width: 38rem) {
    li {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
</style>
