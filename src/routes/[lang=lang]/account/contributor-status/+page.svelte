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
    <p class="explanation">{data.copy[explanationKey(data.contributor.status)]}</p>
    {#if since}
      <Meta class="since">{since}</Meta>
    {/if}
    {#if data.contributor.status === 'trusted_contributor'}
      <aside class="trusted-note" aria-labelledby="trusted-note-heading">
        <span class="trusted-icon">
          <AchievementBadge
            achievementKey="sustained_quality_contributor"
            group="contribution_quality"
            state="earned"
          />
        </span>
        <span>
          <strong id="trusted-note-heading">{data.copy['contributor.trustedNote.title']}</strong>
          <span>{data.copy['contributor.trustedNote.body']}</span>
        </span>
      </aside>
    {/if}
  </Panel>

  <Button
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
    intent="quiet"
    class="back-link"
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

  .explanation {
    margin: 0;
    line-height: 1.55;
  }

  .trusted-note {
    display: grid;
    grid-template-columns: 2.8rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--hv-color-moss) 32%, transparent);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-success-soft);
    padding: 0.9rem;
  }

  .trusted-note > span:last-child {
    display: grid;
    gap: 0.2rem;
    line-height: 1.45;
  }

  .trusted-note strong {
    color: var(--hv-color-moss);
  }

  .trusted-icon {
    display: block;
    width: 2.8rem;
  }

  /* Renders through Button (a child component), so the layout hook needs :global(); the fjord
     border/text this used to hand-roll is now Button's quiet intent. */
  :global(.back-link) {
    justify-self: start;
  }
</style>
