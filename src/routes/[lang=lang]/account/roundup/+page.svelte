<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { catalogues } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import {
    roundupClickProperties,
    roundupPreferencesProperties,
    roundupViewProperties
  } from '$lib/roundup/analytics';
  import RoundupPreferencesForm from '$lib/roundup/RoundupPreferencesForm.svelte';
  import RoundupRecommendationCard from '$lib/roundup/RoundupRecommendationCard.svelte';
  import RoundupTrailIcon from '$lib/roundup/RoundupTrailIcon.svelte';
  import type { RoundupPreferences } from '$lib/roundup/types';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let settingsOpen = $state(false);

  const actionError = $derived(form && 'error' in form ? String(form.error) : null);
  const actionSaved = $derived(Boolean(form && 'success' in form && form.success));
  const roundupLocale = $derived(
    data.roundup.status === 'unavailable' || data.roundup.status === 'unconfigured'
      ? data.lang
      : data.roundup.preferences.roundupLocale
  );
  const roundupCopy = $derived(catalogues[roundupLocale]);

  const enhancePreferences: SubmitFunction = () => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'success' && isPreferenceActionResult(result.data)) {
        postHogAnalytics.capture(
          'roundup preferences completed',
          roundupPreferencesProperties(
            result.data.preferences.municipalities.length,
            result.data.preferences.categories.length > 0,
            result.data.preferences.emailInterest
          )
        );
        settingsOpen = false;
      }
      await update();
      submitting = false;
    };
  };

  onMount(() => {
    postHogAnalytics.capture(
      'roundup viewed',
      roundupViewProperties(
        data.roundup.status,
        data.roundup.status === 'unavailable' ? 0 : data.roundup.recommendations.length
      )
    );
  });

  function weekLabel(startsOn: string, endsOn: string): string {
    return roundupCopy['roundup.weekLabel']
      .replace('{start}', formatLocalizedDate(startsOn, roundupLocale))
      .replace('{end}', formatLocalizedDate(endsOn, roundupLocale));
  }

  function stateTitle(): string {
    if (data.roundup.status === 'populated') return roundupCopy['roundup.populatedTitle'];
    if (data.roundup.status === 'sparse') return roundupCopy['roundup.sparseTitle'];
    if (data.roundup.status === 'empty') return roundupCopy['roundup.emptyTitle'];
    if (data.roundup.status === 'unconfigured') return data.copy['roundup.unconfiguredTitle'];
    return data.copy['roundup.unavailableTitle'];
  }

  function stateBody(): string {
    if (data.roundup.status === 'populated') return roundupCopy['roundup.populatedBody'];
    if (data.roundup.status === 'sparse') return roundupCopy['roundup.sparseBody'];
    if (data.roundup.status === 'empty') return roundupCopy['roundup.emptyBody'];
    if (data.roundup.status === 'unconfigured') return data.copy['roundup.unconfiguredBody'];
    return data.copy['roundup.unavailableBody'];
  }

  function isPreferenceActionResult(value: unknown): value is { preferences: RoundupPreferences } {
    if (typeof value !== 'object' || value === null || !('preferences' in value)) return false;
    const preferences = value.preferences;
    return (
      typeof preferences === 'object' &&
      preferences !== null &&
      'municipalities' in preferences &&
      Array.isArray(preferences.municipalities) &&
      'categories' in preferences &&
      Array.isArray(preferences.categories) &&
      'emailInterest' in preferences &&
      typeof preferences.emailInterest === 'boolean'
    );
  }
</script>

<svelte:head>
  <title>{data.copy['roundup.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="roundup-shell hv-page-shell hv-stack" data-ui-mode="place" data-width="wide">
  <header class="roundup-header hv-panel">
    <div class="hero-icon"><RoundupTrailIcon kind="trail" size="large" /></div>
    <div class="hero-copy">
      <p class="hv-eyebrow">{data.copy['roundup.eyebrow']}</p>
      <h1 class="hv-page-title">{data.copy['roundup.title']}</h1>
      <p class="intro">{data.copy['roundup.intro']}</p>
      <p class="private-note">
        <RoundupTrailIcon kind="private" size="small" />
        <span>{data.copy['roundup.privateNote']}</span>
      </p>
    </div>
  </header>

  <section
    class:quiet-state={data.roundup.status === 'empty' ||
      data.roundup.status === 'unconfigured' ||
      data.roundup.status === 'unavailable'}
    class="roundup-state hv-stack"
    aria-labelledby="roundup-state-heading"
  >
    {#if actionSaved}
      <p class="hv-notice" data-tone="success" role="status">{data.copy['roundup.saved']}</p>
    {/if}

    <header class="state-heading">
      <div>
        {#if data.roundup.status !== 'unavailable'}
          <p class="week hv-eyebrow">
            {weekLabel(data.roundup.week.startsOn, data.roundup.week.endsOn)}
          </p>
        {/if}
        <h2 id="roundup-state-heading">{stateTitle()}</h2>
        <p>{stateBody()}</p>
      </div>
      {#if data.roundup.status === 'empty' || data.roundup.status === 'unconfigured' || data.roundup.status === 'unavailable'}
        <span class="state-icon">
          <RoundupTrailIcon
            kind={data.roundup.status === 'unavailable' ? 'private' : 'empty'}
            size="regular"
          />
        </span>
      {/if}
    </header>

    {#if data.roundup.status === 'populated' || data.roundup.status === 'sparse'}
      <div class="recommendations">
        {#each data.roundup.recommendations as recommendation, index (recommendation.placeId)}
          <RoundupRecommendationCard
            {recommendation}
            copy={roundupCopy}
            lang={roundupLocale}
            lead={index === 0}
            onselect={() =>
              postHogAnalytics.capture(
                'roundup recommendation clicked',
                roundupClickProperties(recommendation.rank, recommendation.reason)
              )}
          />
        {/each}
      </div>
    {/if}

    {#if data.roundup.status !== 'unavailable'}
      <div class="roundup-actions">
        <a
          class="hv-control"
          data-intent="primary"
          href={resolve('/[lang=lang]', { lang: roundupLocale })}
        >
          {roundupCopy['roundup.browse']}
        </a>
        {#if data.roundup.status !== 'unconfigured'}
          <button
            class="settings-toggle hv-control"
            type="button"
            aria-expanded={settingsOpen}
            aria-controls="roundup-preferences"
            onclick={() => (settingsOpen = !settingsOpen)}
          >
            {settingsOpen
              ? data.copy['roundup.closePreferences']
              : data.copy['roundup.editPreferences']}
          </button>
        {/if}
      </div>
    {/if}
  </section>

  {#if data.roundup.status !== 'unavailable' && (data.roundup.status === 'unconfigured' || settingsOpen)}
    <div id="roundup-preferences">
      <RoundupPreferencesForm
        preferences={data.roundup.preferences}
        copy={data.copy}
        {submitting}
        error={actionError}
        enhanceAction={enhancePreferences}
      />
    </div>
  {/if}

  <a class="account-link hv-control" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
    {data.copy['account.navSignedIn']}
  </a>
</main>

<style>
  .roundup-shell {
    --hv-space-context: 1.25rem;
    width: min(100%, 66rem);
    margin-inline: auto;
  }

  .roundup-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    padding: clamp(1.25rem, 5vw, 2.5rem);
    gap: clamp(1rem, 4vw, 2rem);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 92% 12%,
        color-mix(in srgb, var(--hv-color-sky) 28%, transparent),
        transparent 40%
      ),
      linear-gradient(
        145deg,
        var(--hv-color-snow-raised),
        color-mix(in srgb, var(--hv-color-moss) 5%, white)
      );
  }

  .hero-icon {
    display: grid;
    width: 5.5rem;
    height: 5.5rem;
    border-radius: 1.8rem;
    background: color-mix(in srgb, var(--hv-color-fjord) 11%, white);
    color: var(--hv-color-fjord);
    place-items: center;
  }

  .hero-copy > :global(*) {
    margin-block: 0;
  }

  .hero-copy h1 {
    margin-block-start: 0.2rem;
  }

  .intro {
    max-width: 48ch;
    margin-block-start: 0.5rem;
    color: var(--hv-color-basalt-muted);
    font-size: 1.05rem;
    line-height: 1.55;
  }

  .private-note {
    display: flex;
    max-width: fit-content;
    margin-block-start: 0.85rem;
    align-items: center;
    gap: 0.4rem;
    color: var(--hv-color-fjord);
    font-size: 0.88rem;
    font-weight: 800;
  }

  .roundup-state {
    --hv-space-context: 1rem;
  }

  .roundup-state.quiet-state {
    padding: clamp(1rem, 4vw, 1.5rem);
    border: 1px solid var(--hv-color-line);
    border-radius: 1rem;
    background: var(--hv-color-snow-raised);
  }

  .state-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .state-heading h2,
  .state-heading p {
    margin: 0;
  }

  .state-heading h2 {
    margin-block-start: 0.2rem;
    font-family: var(--hv-font-display);
    font-size: clamp(1.45rem, 4vw, 2rem);
  }

  .state-heading h2 + p {
    max-width: 52ch;
    margin-block-start: 0.45rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.55;
  }

  .state-icon {
    color: var(--hv-color-moss);
  }

  .recommendations {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .recommendations > :global(:first-child) {
    grid-column: 1 / -1;
  }

  .roundup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .settings-toggle,
  .account-link {
    border-color: var(--hv-color-fjord);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-fjord);
  }

  .account-link {
    justify-self: start;
  }

  @media (prefers-reduced-motion: no-preference) {
    .recommendations > :global(*) {
      animation: card-arrive 420ms ease-out both;
    }

    .recommendations > :global(:nth-child(2)) {
      animation-delay: 70ms;
    }

    .recommendations > :global(:nth-child(3)) {
      animation-delay: 120ms;
    }

    .recommendations > :global(:nth-child(n + 4)) {
      animation-delay: 170ms;
    }

    @keyframes card-arrive {
      from {
        transform: translateY(8px);
      }
    }
  }

  @media (max-width: 42rem) {
    .roundup-header {
      grid-template-columns: 1fr;
    }

    .hero-icon {
      width: 4.5rem;
      height: 4.5rem;
    }

    .recommendations {
      grid-template-columns: 1fr;
    }

    .recommendations > :global(:first-child) {
      grid-column: auto;
    }
  }
</style>
