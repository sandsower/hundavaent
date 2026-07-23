<script lang="ts">
  import { afterNavigate, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizePlaceCategory } from '$i18n/structured-place';
  import type { PageProps } from './$types';
  import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';

  let { data }: PageProps = $props();
  const name = (item: (typeof data.suggestions)[number]) =>
    data.lang === 'is' ? item.nameIs : item.nameEn;
  const statusKey = (status: string): MessageKey => `suggestion.status.${status}` as MessageKey;
  const statusTone = (status: string): string | undefined => {
    if (status === 'accepted') return 'success';
    if (status === 'needs_information') return 'attention';
    if (status === 'rejected') return 'error';
    return undefined;
  };

  afterNavigate(() => {
    if (data.recognition) applyWeeklyRhythmRecognition(data.recognition);
    const url = new URL(window.location.href);
    let needsCleanup = false;
    for (const key of [
      'weeklyAction',
      'weeklyRecognized',
      'weeklyActivated',
      'weeklyStartsOn',
      'weeklyEndsOn',
      'weeklyActive'
    ]) {
      needsCleanup ||= url.searchParams.has(key);
      url.searchParams.delete(key);
    }
    if (needsCleanup) {
      requestAnimationFrame(() => {
        // eslint-disable-next-line svelte/no-navigation-without-resolve -- this only removes transient fields from the already-resolved current URL
        replaceState(`${url.pathname}${url.search}${url.hash}`, {});
      });
    }
  });
</script>

<svelte:head>
  <title>{data.copy['suggestion.myTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main
  class="hv-page-shell"
  data-width="narrow"
  data-ui-mode="place"
  aria-labelledby="suggestions-title"
>
  <header class="hv-page-header">
    <div class="hv-stack">
      <p class="hv-eyebrow">{data.copy['site.name']}</p>
      <h1 id="suggestions-title" class="hv-page-title">{data.copy['suggestion.myTitle']}</h1>
      <p class="hv-meta">{data.copy['suggestion.myIntro']}</p>
    </div>
    <div class="hv-page-actions">
      <a
        class="hv-control"
        data-intent="primary"
        href={resolve('/[lang=lang]/suggest', { lang: data.lang })}
      >
        {data.copy['suggestion.new']}
      </a>
    </div>
  </header>
  {#if data.recognition?.recognized}
    <WeeklyRhythmAcknowledgement recognition={data.recognition} copy={data.copy} />
  {:else if data.submitted}
    <p class="hv-notice" data-tone="success" role="status">
      {data.copy['suggestion.acknowledged']}
    </p>
  {/if}
  {#if data.suggestions.length === 0}
    <p class="hv-notice" data-tone="info">{data.copy['suggestion.empty']}</p>
  {:else}
    <ul class="hv-list outcome-list">
      {#each data.suggestions as item (item.suggestionId)}
        <li
          class="outcome-card hv-list-card hv-panel"
          class:highlighted={data.submitted === item.suggestionId}
        >
          <div class="hv-stack">
            <h2>{name(item)}</h2>
            <p class="hv-meta">
              {localizePlaceCategory(item.category, data.copy)} · {item.locality}
            </p>
          </div>
          <strong
            class="hv-status"
            data-status={statusTone(item.outcome)}
            data-outcome={item.outcome}
          >
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
        class="next hv-control"
        data-intent="primary"
        href={resolve(
          `/[lang=lang]/account/suggestions?cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.suggestionId)}`,
          { lang: data.lang }
        )}>{data.copy['suggestion.nextPage']}</a
      >
    {/if}
    {#if data.hasPrevious}
      <a
        class="previous hv-control"
        href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}
        >{data.copy['suggestion.previousPage']}</a
      >
    {/if}
  {/if}
</main>

<style>
  .hv-page-header + .hv-notice,
  .hv-page-header + .outcome-list {
    margin-top: calc(var(--hv-space-context) * 1.5);
  }

  .outcome-list {
    margin-block: calc(var(--hv-space-context) * 1.5);
  }

  .outcome-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem var(--hv-space-panel);
  }

  .outcome-card.highlighted {
    border-color: var(--hv-color-fjord);
    box-shadow: 0 0 0 2px var(--hv-color-fjord-soft);
  }

  h2,
  p {
    margin: 0;
  }

  .reason {
    grid-column: 1 / -1;
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 0.75rem;
    color: var(--hv-color-basalt-muted);
  }

  .outcome-card > .hv-status {
    align-self: start;
    justify-self: end;
  }

  .next,
  .previous {
    margin-top: 0.75rem;
  }

  .previous {
    margin-left: 0.5rem;
  }

  @media (max-width: 38rem) {
    .outcome-card {
      grid-template-columns: 1fr;
    }

    .outcome-card > .hv-status {
      justify-self: start;
    }
  }
</style>
