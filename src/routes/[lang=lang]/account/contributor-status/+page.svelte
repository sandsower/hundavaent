<script lang="ts">
  import { resolve } from '$app/paths';
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

<main class="status-shell hv-page-shell hv-stack" data-ui-mode="place" data-width="narrow">
  <header class="hv-page-header">
    <p class="hv-eyebrow">{data.copy['site.name']}</p>
    <h1 class="hv-page-title">{data.copy['contributor.title']}</h1>
    <p class="intro hv-meta">{data.copy['contributor.intro']}</p>
  </header>

  <section class="status-card hv-panel hv-form-section" aria-labelledby="status-heading">
    <p class="eyebrow hv-eyebrow" id="status-heading">{data.copy['site.name']}</p>
    <strong
      class={`tier hv-status ${data.contributor.status}`}
      data-status={data.contributor.status === 'trusted_contributor' ? 'verified' : undefined}
    >
      {data.copy[statusKey(data.contributor.status)]}
    </strong>
    <p class="explanation">{data.copy[explanationKey(data.contributor.status)]}</p>
    {#if since}
      <p class="since hv-meta">{since}</p>
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
  </section>

  <a class="back-link hv-control" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
    {data.copy['account.navSignedIn']}
  </a>
</main>

<style>
  .intro {
    max-width: 46ch;
  }

  .status-card {
    border-inline-start: 0.3rem solid var(--hv-color-moss);
    padding: clamp(1.25rem, 4vw, 2rem);
  }

  .eyebrow {
    margin: 0;
  }

  .tier {
    justify-self: start;
  }

  .explanation {
    margin: 0;
    line-height: 1.55;
  }

  .since {
    margin: 0;
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

  .back-link {
    border-color: var(--hv-color-fjord);
    justify-self: start;
    color: var(--hv-color-fjord);
  }
</style>
