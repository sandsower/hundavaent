<script lang="ts">
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizePlaceCategory } from '$i18n/structured-place';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const name = (item: (typeof data.suggestions)[number]) =>
    data.lang === 'is' ? item.nameIs : item.nameEn;
  const statusKey = (status: string): MessageKey => `suggestion.status.${status}` as MessageKey;
</script>

<svelte:head>
  <title>{data.copy['suggestion.myTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="outcome-shell">
  <div class="heading">
    <div>
      <h1>{data.copy['suggestion.myTitle']}</h1>
      <p>{data.copy['suggestion.myIntro']}</p>
    </div>
    <a href={resolve('/[lang=lang]/suggest', { lang: data.lang })}>
      {data.copy['suggestion.new']}
    </a>
  </div>
  {#if data.submitted}
    <p class="ack" role="status">{data.copy['suggestion.acknowledged']}</p>
  {/if}
  {#if data.suggestions.length === 0}
    <p class="empty">{data.copy['suggestion.empty']}</p>
  {:else}
    <ul>
      {#each data.suggestions as item (item.suggestionId)}
        <li class:highlighted={data.submitted === item.suggestionId}>
          <div>
            <h2>{name(item)}</h2>
            <p>{localizePlaceCategory(item.category, data.copy)} · {item.locality}</p>
          </div>
          <strong class={`status ${item.outcome}`} data-outcome={item.outcome}>
            <span aria-hidden="true"></span>
            {data.copy[statusKey(item.outcome)]}
          </strong>
          {#if data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            <p class="reason">
              {data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if data.nextCursor}
      <a
        class="next"
        href={resolve(
          `/[lang=lang]/account/suggestions?cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.suggestionId)}`,
          { lang: data.lang }
        )}>{data.copy['suggestion.nextPage']}</a
      >
    {/if}
    {#if data.hasPrevious}
      <a class="previous" href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}
        >{data.copy['suggestion.previousPage']}</a
      >
    {/if}
  {/if}
</main>

<style>
  .outcome-shell {
    width: min(100% - 2rem, 60rem);
    margin: 3rem auto;
  }
  .heading {
    display: flex;
    gap: 2rem;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 7vw, 5rem);
    line-height: 0.95;
  }
  .heading a,
  .next,
  .previous {
    flex: none;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.75rem 1rem;
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
  .ack,
  .empty {
    margin-top: 2rem;
    border: 2px solid var(--ink);
    border-radius: 1rem;
    background: var(--mint);
    padding: 1rem;
    font-weight: 850;
  }
  ul {
    display: grid;
    gap: 1rem;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem 1rem;
    border: 2px solid var(--ink);
    border-radius: 1.1rem;
    background: var(--paper-raised);
    padding: 1rem;
    box-shadow: 0.25rem 0.3rem 0 var(--sun);
  }
  li.highlighted {
    box-shadow: 0.25rem 0.3rem 0 var(--teal);
  }
  h2,
  p {
    margin: 0.15rem 0;
  }
  .status {
    display: inline-flex;
    gap: 0.4rem;
    align-self: start;
    align-items: center;
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 0.4rem 0.65rem;
    line-height: 1.1;
  }
  .status span {
    display: inline-grid;
    width: 1.25rem;
    height: 1.25rem;
    flex: none;
    place-items: center;
    border-radius: 50%;
    background: rgb(255 255 255 / 65%);
    font-size: 0.9rem;
  }
  .status.submitted {
    background: var(--sun);
  }
  .status.submitted span::before {
    content: '↑';
  }
  .status.needs_information {
    background: #ffe3a1;
  }
  .status.needs_information span::before {
    content: '?';
  }
  .status.accepted {
    background: var(--mint);
  }
  .status.accepted span::before {
    content: '✓';
  }
  .status.duplicate {
    background: #c9e4ee;
  }
  .status.duplicate span::before {
    content: '≡';
  }
  .status.rejected {
    background: var(--coral-soft);
  }
  .status.rejected span::before {
    content: '×';
  }
  .reason {
    grid-column: 1 / -1;
    border-top: 1px solid var(--ink);
    padding-top: 0.7rem;
  }
  @media (max-width: 38rem) {
    .heading,
    li {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
</style>
