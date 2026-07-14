<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
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

<main class="status-shell">
  <h1>{data.copy['contributor.title']}</h1>
  <p class="intro">{data.copy['contributor.intro']}</p>

  <section class="status-card" aria-labelledby="status-heading">
    <p class="eyebrow" id="status-heading">{data.copy['site.name']}</p>
    <strong class={`tier ${data.contributor.status}`}>
      {data.copy[statusKey(data.contributor.status)]}
    </strong>
    <p class="explanation">{data.copy[explanationKey(data.contributor.status)]}</p>
    {#if since}
      <p class="since">{since}</p>
    {/if}
  </section>

  <a class="back-link" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
    {data.copy['account.navSignedIn']}
  </a>
</main>

<style>
  .status-shell {
    width: min(100% - 2rem, 40rem);
    margin: 3rem auto;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: clamp(2.2rem, 7vw, 4rem);
    line-height: 0.98;
  }
  .intro {
    max-width: 46ch;
    margin: 0 0 1.5rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .status-card {
    border: 2px solid var(--ink);
    border-radius: 1.4rem 0.7rem 1.4rem 0.7rem;
    background: var(--paper-light);
    padding: clamp(1.25rem, 4vw, 2rem);
    box-shadow: 0.6rem 0.6rem 0 var(--teal);
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    color: var(--coral-dark);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .tier {
    display: inline-block;
    border-radius: 999px;
    background: var(--mint);
    padding: 0.5rem 0.9rem;
    font-weight: 900;
  }
  .tier.trusted_contributor {
    background: var(--sun);
  }
  .tier.none {
    background: var(--paper-deep);
  }
  .explanation {
    margin: 1rem 0 0;
    line-height: 1.55;
  }
  .since {
    margin: 0.75rem 0 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .back-link {
    display: inline-block;
    margin-top: 1.5rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.7rem 1.15rem;
    color: var(--ink);
    font-weight: 850;
    text-decoration: none;
  }
</style>
