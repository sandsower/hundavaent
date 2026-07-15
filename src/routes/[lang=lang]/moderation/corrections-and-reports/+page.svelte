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

<main class="queue-shell" data-ui-mode="operations">
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
    width: min(100% - 2rem, var(--hv-content-wide));
    margin: var(--hv-space-section) auto 4rem;
  }
  h1 {
    margin: 0 0 1.5rem;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.03em;
  }
  .empty {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-fjord-soft);
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
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    padding: 1rem;
    box-shadow: var(--hv-shadow-raised);
  }
  .eyebrow {
    margin: 0;
    color: var(--hv-color-fjord);
    font-size: 0.8rem;
    font-weight: 950;
    text-transform: uppercase;
  }
  .safety {
    border: 1px solid var(--hv-color-danger);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-danger-soft);
    padding: 0.2rem 0.5rem;
    color: var(--hv-color-danger);
  }
  h2 {
    margin: 0.2rem 0;
  }
  li a {
    flex-shrink: 0;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    padding: 0.6rem 1rem;
    font-weight: 900;
  }
  a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  a.next,
  a.previous {
    display: inline-block;
    margin-top: 1.5rem;
    margin-right: 1rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
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
