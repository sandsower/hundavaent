<script lang="ts">
  import { afterNavigate, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizePlaceCategory } from '$i18n/structured-place';
  import type { PageProps } from './$types';
  import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
  import { Eyebrow, Meta, PageHeader, PageShell, PageTitle, Panel } from '@hundavaent/design-system';

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

<PageShell width="narrow" aria-labelledby="suggestions-title">
  <PageHeader class="mb-section">
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle id="suggestions-title">{data.copy['suggestion.myTitle']}</PageTitle>
    <Meta>{data.copy['suggestion.myIntro']}</Meta>
    <div class="flex flex-wrap items-center gap-actions">
      <a
        class="hv-control"
        data-intent="primary"
        href={resolve('/[lang=lang]/suggest', { lang: data.lang })}
      >
        {data.copy['suggestion.new']}
      </a>
    </div>
  </PageHeader>
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
    <ul class="outcome-list grid gap-context m-0 p-0 list-none">
      {#each data.suggestions as item (item.suggestionId)}
        <Panel
          as="li"
          padded
          class={`outcome-card${data.submitted === item.suggestionId ? ' highlighted' : ''}`}
        >
          <div class="grid gap-context">
            <h2>{name(item)}</h2>
            <Meta>
              {localizePlaceCategory(item.category, data.copy)} · {item.locality}
            </Meta>
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
        </Panel>
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
</PageShell>

<style>
  .outcome-list {
    margin-block: calc(var(--hv-space-context) * 1.5);
  }

  :global(.outcome-card) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem var(--hv-space-panel);
  }

  :global(.outcome-card.highlighted) {
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

  :global(.outcome-card > .hv-status) {
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
    :global(.outcome-card) {
      grid-template-columns: 1fr;
    }

    :global(.outcome-card > .hv-status) {
      justify-self: start;
    }
  }
</style>
