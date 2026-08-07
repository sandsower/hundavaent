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
  import { Button, Eyebrow, Notice, Panel, PageShell, PageTitle } from '@hundavaent/design-system';

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

<PageShell class="roundup-shell grid gap-context">
  <Panel as="header" class="roundup-header">
    <div
      class="hero-icon grid place-items-center w-[5.5rem] h-[5.5rem] rounded-[1.8rem] bg-[color-mix(in_srgb,var(--hv-color-fjord)_11%,white)] text-fjord max-narrow:w-[4.5rem] max-narrow:h-[4.5rem]"
    >
      <RoundupTrailIcon kind="trail" size="large" />
    </div>
    <!-- The blanket `> *` margin-block reset this wrapper used to carry is gone: Eyebrow and
         PageTitle already own their own zero, and the two local paragraphs below state their
         own margin-block outright. Keeping it would have out-ranked those utilities, since
         scoped CSS is unlayered. -->
    <div class="hero-copy">
      <Eyebrow>{data.copy['roundup.eyebrow']}</Eyebrow>
      <PageTitle>{data.copy['roundup.title']}</PageTitle>
      <p
        class="intro max-w-[48ch] [margin-block:0.5rem_0] text-[1.05rem] leading-[1.55] text-basalt-muted"
      >
        {data.copy['roundup.intro']}
      </p>
      <p
        class="private-note flex items-center max-w-fit gap-[0.4rem] [margin-block:0.85rem_0] text-[0.88rem] font-extrabold text-fjord"
      >
        <RoundupTrailIcon kind="private" size="small" />
        <span>{data.copy['roundup.privateNote']}</span>
      </p>
    </div>
  </Panel>

  <!-- data-quiet-state mirrors the class:quiet-state flag so the quiet-state-only rule can be a
       data variant; the class itself stays, since it is this surface's own semantic hook. -->
  <section
    class:quiet-state={data.roundup.status === 'empty' ||
      data.roundup.status === 'unconfigured' ||
      data.roundup.status === 'unavailable'}
    data-quiet-state={data.roundup.status === 'empty' ||
      data.roundup.status === 'unconfigured' ||
      data.roundup.status === 'unavailable'}
    class="roundup-state grid gap-context [--hv-space-context:1rem] data-[quiet-state=true]:p-[clamp(1rem,_4vw,_1.5rem)] data-[quiet-state=true]:border data-[quiet-state=true]:border-border-subtle data-[quiet-state=true]:rounded-[1rem] data-[quiet-state=true]:bg-snow-raised"
    aria-labelledby="roundup-state-heading"
  >
    {#if actionSaved}
      <Notice tone="success" as="p" role="status">{data.copy['roundup.saved']}</Notice>
    {/if}

    <header class="state-heading flex items-start justify-between gap-4">
      <div>
        {#if data.roundup.status !== 'unavailable'}
          <Eyebrow>
            {weekLabel(data.roundup.week.startsOn, data.roundup.week.endsOn)}
          </Eyebrow>
        {/if}
        <h2
          id="roundup-state-heading"
          class="mx-0 mt-[0.2rem] mb-0 font-display text-[clamp(1.45rem,_4vw,_2rem)]"
        >
          {stateTitle()}
        </h2>
        <p class="max-w-[52ch] mx-0 mt-[0.45rem] mb-0 leading-[1.55] text-basalt-muted">
          {stateBody()}
        </p>
      </div>
      {#if data.roundup.status === 'empty' || data.roundup.status === 'unconfigured' || data.roundup.status === 'unavailable'}
        <span class="state-icon text-moss">
          <RoundupTrailIcon
            kind={data.roundup.status === 'unavailable' ? 'private' : 'empty'}
            size="regular"
          />
        </span>
      {/if}
    </header>

    {#if data.roundup.status === 'populated' || data.roundup.status === 'sparse'}
      <div class="recommendations grid grid-cols-2 gap-[0.85rem] max-narrow:grid-cols-[1fr]">
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
      <div class="roundup-actions flex flex-wrap gap-[0.65rem]">
        <Button intent="primary" href={resolve('/[lang=lang]', { lang: roundupLocale })}>
          {roundupCopy['roundup.browse']}
        </Button>
        {#if data.roundup.status !== 'unconfigured'}
          <Button
            type="button"
            intent="quiet"
            aria-expanded={settingsOpen}
            aria-controls="roundup-preferences"
            onclick={() => (settingsOpen = !settingsOpen)}
          >
            {settingsOpen
              ? data.copy['roundup.closePreferences']
              : data.copy['roundup.editPreferences']}
          </Button>
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

  <Button
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
    intent="quiet"
    class="roundup-account-link"
  >
    {data.copy['account.navSignedIn']}
  </Button>
</PageShell>

<style>
  /* Re-anchored: .roundup-shell now sits on PageShell's class prop, and .roundup-header on the
     hero Panel's - neither literal element exists in this template anymore. */
  /* The width override must out-rank PageShell's own scoped .shell rule (two classes of
     specificity); a bare :global(.roundup-shell) at one class silently loses and the page
     grows to the 72rem wide container. main + the doubled class computes to 0-2-1 and wins
     deterministically. The custom-property line needs no rank (nothing else sets it), but it
     rides along rather than splitting the rule. */
  :global(main.roundup-shell.roundup-shell) {
    --hv-space-context: 1.25rem;
    width: min(100%, 66rem);
    margin-inline: auto;
  }

  :global(.roundup-header) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    padding: clamp(1.25rem, 5vw, 2.5rem);
    gap: clamp(1rem, 4vw, 2rem);
    overflow: hidden;
    background: linear-gradient(
      145deg,
      var(--hv-color-snow-raised),
      color-mix(in srgb, var(--hv-color-moss) 5%, white)
    );
  }

  /* The title is now PageTitle - no literal h1 remains locally, so the descendant needs :global;
     the ancestor stays scoped since .hero-copy is still a plain local div. */
  .hero-copy > :global(h1) {
    margin-block-start: 0.2rem;
  }

  .recommendations > :global(:first-child) {
    grid-column: 1 / -1;
  }

  /* Renders through Button (a child component), so the layout hook needs :global(); the fjord
     border/background/text this used to hand-roll is now Button's quiet intent. */
  :global(.roundup-account-link) {
    justify-self: start;
  }

  .recommendations > :global(*) {
    animation: card-arrive var(--hv-motion-celebrate) var(--hv-ease-settle) both;
  }

  .recommendations > :global(:nth-child(2)) {
    animation-delay: var(--hv-motion-stagger);
  }

  .recommendations > :global(:nth-child(3)) {
    animation-delay: calc(var(--hv-motion-stagger) * 2);
  }

  .recommendations > :global(:nth-child(n + 4)) {
    animation-delay: calc(var(--hv-motion-stagger) * 3);
  }

  @keyframes card-arrive {
    from {
      transform: translateY(8px);
    }
  }

  @media (max-width: 42rem) {
    :global(.roundup-header) {
      grid-template-columns: 1fr;
    }

    .recommendations > :global(:first-child) {
      grid-column: auto;
    }
  }
</style>
