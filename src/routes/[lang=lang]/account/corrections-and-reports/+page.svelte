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
  <title>{data.copy['flag.myTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="outcome-shell">
  <div class="heading">
    <div>
      <h1>{data.copy['flag.myTitle']}</h1>
      <p>{data.copy['flag.myIntro']}</p>
    </div>
    <div class="new-links">
      <a href={resolve('/[lang=lang]', { lang: data.lang })}>{data.copy['flag.newCorrection']}</a>
    </div>
  </div>

  {#if data.submitted}
    <p class="ack" role="status">{data.copy['flag.acknowledged']}</p>
  {/if}

  {#if data.flags.length === 0}
    <p class="empty">{data.copy['flag.empty']}</p>
  {:else}
    <ul>
      {#each data.flags as item (item.flagId)}
        <li class:highlighted={data.submitted === item.flagId}>
          <div>
            <p class="eyebrow">{data.copy[kindKey(item.kind)]} · {target(item)}</p>
            <h2>{name(item)}</h2>
          </div>
          <strong class={`status ${item.outcome}`}>{data.copy[statusKey(item.outcome)]}</strong>
          {#if data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            <p class="reason">{data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if data.nextCursor}
    <a
      class="next"
      href={resolve(
        `/[lang=lang]/account/corrections-and-reports?cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.flagId)}`,
        { lang: data.lang }
      )}>{data.copy['flag.nextPage']}</a
    >
  {/if}
  {#if data.hasPrevious}
    <a
      class="previous"
      href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
      >{data.copy['flag.previousPage']}</a
    >
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
    align-items: start;
    justify-content: space-between;
  }
  .new-links a {
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    padding: 0.75rem 1rem;
    font-weight: 900;
    box-shadow: 0 0.2rem 0 var(--ink);
  }
  h1 {
    margin: 0.25rem 0;
    font-size: clamp(2rem, 5vw, 3rem);
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
    gap: 0.8rem;
    margin-top: 2rem;
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
  .eyebrow {
    margin: 0;
    color: var(--coral-dark);
    font-size: 0.8rem;
    font-weight: 950;
    text-transform: uppercase;
  }
  h2 {
    margin: 0.2rem 0;
  }
  .status {
    align-self: start;
    border-radius: 999px;
    background: var(--mint);
    padding: 0.4rem 0.65rem;
    font-size: 0.85rem;
  }
  .status.rejected {
    background: var(--coral-soft);
  }
  .reason {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--ink-soft);
  }
  a:focus-visible,
  a.next:focus-visible,
  a.previous:focus-visible {
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
    .heading,
    li {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
</style>
