<script lang="ts">
  import { afterNavigate, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizePlaceCategory } from '$i18n/structured-place';
  import type { PageProps } from './$types';
  import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
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

  let { data }: PageProps = $props();
  const name = (item: (typeof data.suggestions)[number]) =>
    data.lang === 'is' ? item.nameIs : item.nameEn;
  const statusKey = (status: string): MessageKey => `suggestion.status.${status}` as MessageKey;
  // Narrowed to Status's own Tone union (not exported from the design-system package, so named
  // literally here) rather than left as `string` - Status's tone prop rejects a bare string.
  const statusTone = (status: string): 'success' | 'attention' | 'error' | undefined => {
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

<PageShell width="narrow" class="suggestions-shell" aria-labelledby="suggestions-title">
  <PageHeader class="mb-section">
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle id="suggestions-title">{data.copy['suggestion.myTitle']}</PageTitle>
    <Meta>{data.copy['suggestion.myIntro']}</Meta>
    <div class="flex flex-wrap items-center gap-actions">
      <Button intent="primary" href={resolve('/[lang=lang]/suggest', { lang: data.lang })}>
        {data.copy['suggestion.new']}
      </Button>
    </div>
  </PageHeader>
  {#if data.recognition?.recognized}
    <WeeklyRhythmAcknowledgement recognition={data.recognition} copy={data.copy} />
  {:else if data.submitted}
    <Notice tone="success" as="p" class="notice-tight" role="status">
      {data.copy['suggestion.acknowledged']}
    </Notice>
  {/if}
  {#if data.suggestions.length === 0}
    <Notice tone="info" as="p" class="notice-tight">{data.copy['suggestion.empty']}</Notice>
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
          <Status
            tone={statusTone(item.outcome)}
            class="outcome-status"
            data-outcome={item.outcome}
          >
            {data.copy[statusKey(item.outcome)]}
          </Status>
          {#if data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            <p class="reason">
              {data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            </p>
          {/if}
        </Panel>
      {/each}
    </ul>
    {#if data.nextCursor}
      <Button
        intent="primary"
        class="next"
        href={resolve(
          `/[lang=lang]/account/suggestions?cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.suggestionId)}`,
          { lang: data.lang }
        )}>{data.copy['suggestion.nextPage']}</Button
      >
    {/if}
    {#if data.hasPrevious}
      <Button
        class="previous"
        href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}
        >{data.copy['suggestion.previousPage']}</Button
      >
    {/if}
  {/if}
</PageShell>

<style>
  .outcome-list {
    margin-block: calc(var(--hv-space-context) * 1.5);
  }

  .outcome-list :global(.outcome-card) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem var(--hv-space-panel);
  }

  .outcome-list :global(.outcome-card.highlighted) {
    border-color: var(--hv-color-fjord);
    box-shadow: 0 0 0 2px var(--hv-color-fjord-soft);
  }

  h2,
  p {
    margin: 0;
  }

  /* The acknowledged/empty notices render their <p> through Notice (a child component), so the
     bare `p { margin: 0 }` above cannot reach them - anchored through PageShell's own class hook
     (this route's own :global(), not a bare one) per the ancestor-scoped-:global pattern
     (moderation's .workspace-shell precedent). */
  :global(.suggestions-shell) :global(.notice-tight) {
    margin: 0;
  }

  .reason {
    grid-column: 1 / -1;
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 0.75rem;
    color: var(--hv-color-basalt-muted);
  }

  /* Status now renders the chip through a child component; the child combinator needs the
     whole compound wrapped in :global() since Svelte cannot prove the `>` relationship across
     the component boundary (same pattern as the trusted-verification task-card notes). */
  .outcome-list :global(.outcome-card > .outcome-status) {
    align-self: start;
    justify-self: end;
  }

  /* Both render through Button (a child component), so the margin hooks need :global(). */
  :global(.next),
  :global(.previous) {
    margin-top: 0.75rem;
  }

  :global(.previous) {
    margin-left: 0.5rem;
  }

  @media (max-width: 38rem) {
    .outcome-list :global(.outcome-card) {
      grid-template-columns: 1fr;
    }

    .outcome-list :global(.outcome-card > .outcome-status) {
      justify-self: start;
    }
  }
</style>
