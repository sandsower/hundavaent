<script lang="ts">
  import { afterNavigate, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizeFlagTarget } from '$i18n/structured-place';
  import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
  import {
    Eyebrow,
    Meta,
    PageHeader,
    PageShell,
    PageTitle,
    Panel
  } from '@hundavaent/design-system';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  function statusKey(status: string): MessageKey {
    return `flag.status.${status}` as MessageKey;
  }

  function statusTone(status: string): string | undefined {
    if (status === 'applied' || status === 'confirmed_useful') return 'success';
    if (status === 'rejected') return 'error';
    if (
      status === 'needs_information' ||
      status === 'dispute_opened' ||
      status === 'place_inactivated'
    ) {
      return 'attention';
    }
    return undefined;
  }

  function kindKey(kind: string): MessageKey {
    return `flag.kind.${kind}` as MessageKey;
  }

  function name(item: (typeof data.flags)[number]): string {
    return data.lang === 'is' ? item.placeNameIs : item.placeNameEn;
  }

  function target(item: (typeof data.flags)[number]): string {
    return localizeFlagTarget(item.targetKind, item.targetField, data.copy);
  }

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
  <title>{data.copy['flag.myTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<PageShell width="narrow" aria-labelledby="flags-title">
  <PageHeader class="mb-section">
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle id="flags-title">{data.copy['flag.myTitle']}</PageTitle>
    <Meta>{data.copy['flag.myIntro']}</Meta>
    <div class="flex flex-wrap items-center gap-actions">
      <a
        class="hv-control"
        data-intent="primary"
        href={resolve('/[lang=lang]', { lang: data.lang })}>{data.copy['flag.newCorrection']}</a
      >
    </div>
  </PageHeader>

  {#if data.recognition?.recognized}
    <WeeklyRhythmAcknowledgement recognition={data.recognition} copy={data.copy} />
  {:else if data.submitted}
    <p class="hv-notice" data-tone="success" role="status">
      {data.copy['flag.acknowledged']}
    </p>
  {/if}

  {#if data.flags.length === 0}
    <p class="hv-notice" data-tone="info">{data.copy['flag.empty']}</p>
  {:else}
    <ul class="outcome-list grid gap-context m-0 p-0 list-none">
      {#each data.flags as item (item.flagId)}
        <Panel
          as="li"
          padded
          class={`outcome-card${data.submitted === item.flagId ? ' highlighted' : ''}`}
        >
          <div class="grid gap-context">
            <Eyebrow class="kind-line">{data.copy[kindKey(item.kind)]} · {target(item)}</Eyebrow>
            <h2>{name(item)}</h2>
          </div>
          <strong class="hv-status" data-status={statusTone(item.outcome)}>
            {data.copy[statusKey(item.outcome)]}
          </strong>
          {#if data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            <p class="reason">{data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}</p>
          {/if}
        </Panel>
      {/each}
    </ul>
  {/if}

  {#if data.nextCursor}
    <a
      class="next hv-control"
      data-intent="primary"
      href={resolve(
        `/[lang=lang]/account/corrections-and-reports?cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.flagId)}`,
        { lang: data.lang }
      )}>{data.copy['flag.nextPage']}</a
    >
  {/if}
  {#if data.hasPrevious}
    <a
      class="previous hv-control"
      href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
      >{data.copy['flag.previousPage']}</a
    >
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

  .outcome-list :global(.outcome-card .kind-line) {
    margin: 0;
  }

  h2 {
    margin: 0;
  }

  .reason {
    grid-column: 1 / -1;
    margin: 0;
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 0.75rem;
    color: var(--hv-color-basalt-muted);
  }

  .outcome-list :global(.outcome-card > .hv-status) {
    align-self: start;
    justify-self: end;
  }

  .next,
  .previous {
    margin-top: 0.75rem;
    margin-right: 0.5rem;
  }

  @media (max-width: 38rem) {
    .outcome-list :global(.outcome-card) {
      grid-template-columns: 1fr;
    }

    .outcome-list :global(.outcome-card > .hv-status) {
      justify-self: start;
    }
  }
</style>
