<script lang="ts">
  import { afterNavigate, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { MessageKey } from '$i18n';
  import { localizeFlagTarget } from '$i18n/structured-place';
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

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  function statusKey(status: string): MessageKey {
    return `flag.status.${status}` as MessageKey;
  }

  // Narrowed to Status's own Tone union (not exported from the design-system package, so named
  // literally here) rather than left as `string` - Status's tone prop rejects a bare string.
  function statusTone(status: string): 'success' | 'attention' | 'error' | undefined {
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
      <Button intent="primary" href={resolve('/[lang=lang]', { lang: data.lang })}
        >{data.copy['flag.newCorrection']}</Button
      >
    </div>
  </PageHeader>

  {#if data.recognition?.recognized}
    <WeeklyRhythmAcknowledgement recognition={data.recognition} copy={data.copy} />
  {:else if data.submitted}
    <Notice tone="success" as="p" role="status">
      {data.copy['flag.acknowledged']}
    </Notice>
  {/if}

  {#if data.flags.length === 0}
    <Notice tone="info" as="p">{data.copy['flag.empty']}</Notice>
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
          <Status tone={statusTone(item.outcome)} class="outcome-status">
            {data.copy[statusKey(item.outcome)]}
          </Status>
          {#if data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}
            <p class="reason">{data.lang === 'is' ? item.memberReasonIs : item.memberReasonEn}</p>
          {/if}
        </Panel>
      {/each}
    </ul>
  {/if}

  {#if data.nextCursor}
    <Button
      intent="primary"
      class="next"
      href={resolve(
        `/[lang=lang]/account/corrections-and-reports?cursorTime=${encodeURIComponent(data.nextCursor.submittedAt)}&cursorId=${encodeURIComponent(data.nextCursor.flagId)}`,
        { lang: data.lang }
      )}>{data.copy['flag.nextPage']}</Button
    >
  {/if}
  {#if data.hasPrevious}
    <Button
      class="previous"
      href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
      >{data.copy['flag.previousPage']}</Button
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

  /* Status now renders the chip through a child component; the child combinator needs the
     whole compound wrapped in :global() since Svelte cannot prove the `>` relationship across
     the component boundary. */
  .outcome-list :global(.outcome-card > .outcome-status) {
    align-self: start;
    justify-self: end;
  }

  /* Both render through Button (a child component), so the margin hooks need :global(). */
  :global(.next),
  :global(.previous) {
    margin-top: 0.75rem;
    margin-right: 0.5rem;
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
