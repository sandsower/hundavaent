<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    Button,
    Eyebrow,
    Meta,
    PageHeader,
    PageShell,
    PageTitle,
    Panel,
    Status
  } from '@hundavaent/design-system';
  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
  import AchievementBadge from '$lib/achievements/AchievementBadge.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const statusKey = (status: string): MessageKey => `contributor.status.${status}` as MessageKey;
  const explanationKey = (status: string): MessageKey =>
    `contributor.explanation.${status}` as MessageKey;
  const since = $derived(
    data.contributor.statusSince
      ? data.copy['contributor.since'].replace(
          '{date}',
          formatLocalizedDate(data.contributor.statusSince, data.lang)
        )
      : null
  );
</script>

<svelte:head>
  <title>{data.copy['contributor.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<PageShell width="narrow" class="status-shell grid gap-context">
  <PageHeader>
    <Eyebrow>{data.copy['site.name']}</Eyebrow>
    <PageTitle>{data.copy['contributor.title']}</PageTitle>
    <Meta class="status-intro">{data.copy['contributor.intro']}</Meta>
  </PageHeader>

  <Panel
    as="section"
    padded
    class="status-card grid gap-panel min-w-0"
    aria-labelledby="status-heading"
  >
    <Eyebrow id="status-heading">{data.copy['site.name']}</Eyebrow>
    <Status
      class={`tier ${data.contributor.status}`}
      tone={data.contributor.status === 'trusted_contributor' ? 'verified' : undefined}
    >
      {data.copy[statusKey(data.contributor.status)]}
    </Status>
    <p class="explanation m-0 leading-[1.55]">
      {data.copy[explanationKey(data.contributor.status)]}
    </p>
    {#if since}
      <Meta class="since">{since}</Meta>
    {/if}
    {#if data.contributor.status === 'trusted_contributor'}
      <aside
        class="trusted-note grid grid-cols-[2.8rem_minmax(0,1fr)] items-center gap-[0.8rem] p-[0.9rem] border border-[color-mix(in_srgb,var(--hv-color-moss)_32%,transparent)] rounded-panel bg-success-soft"
        aria-labelledby="trusted-note-heading"
      >
        <span class="trusted-icon block w-[2.8rem]">
          <AchievementBadge
            achievementKey="sustained_quality_contributor"
            group="contribution_quality"
            state="earned"
          />
        </span>
        <span class="grid gap-[0.2rem] leading-[1.45]">
          <strong id="trusted-note-heading" class="text-moss"
            >{data.copy['contributor.trustedNote.title']}</strong
          >
          <span>{data.copy['contributor.trustedNote.body']}</span>
        </span>
      </aside>
    {/if}
  </Panel>

  <Button
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
    intent="quiet"
    class="status-back-link"
  >
    {data.copy['account.navSignedIn']}
  </Button>
</PageShell>

<style>
  :global(.status-intro) {
    max-width: 46ch;
  }

  :global(.status-card) {
    border-inline-start: 0.3rem solid var(--hv-color-moss);
    padding: clamp(1.25rem, 4vw, 2rem);
  }

  /* Renders through Status (a child component), so the layout hook needs :global(). */
  :global(.tier) {
    justify-self: start;
  }

  /* Renders through Button (a child component), so the layout hook needs :global(); the fjord
     border/text this used to hand-roll is now Button's quiet intent. */
  :global(.status-back-link) {
    justify-self: start;
  }
</style>
