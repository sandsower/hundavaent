<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';

  import type { MessageKey } from '$i18n';

  import type { ActionData, PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const dimensions = ['welcome', 'clarity', 'comfort', 'thoughtfulness'] as const;
  type DimensionName = (typeof dimensions)[number];
  const classifications = ['subjective', 'inaccurate_info', 'safety_concern'] as const;

  let submitting = $state(false);

  function initialScore(dimension: DimensionName): string {
    const value = data.myRating?.scores[dimension];
    return value == null ? 'na' : String(value);
  }

  // The form starts from the Member's existing Rating (read once) and is thereafter freely
  // editable, so the initial read is intentionally untracked.
  let scores = $state<Record<DimensionName, string>>(
    untrack(() => ({
      welcome: initialScore('welcome'),
      clarity: initialScore('clarity'),
      comfort: initialScore('comfort'),
      thoughtfulness: initialScore('thoughtfulness')
    }))
  );
  let noteText = $state(untrack(() => data.myRating?.privateNote ?? ''));
  let noteClassification = $state(untrack(() => data.myRating?.privateNoteClassification ?? ''));

  // The note prompt appears only when the configured policy is enabled and at least one
  // currently-selected score meets the low-score threshold -- purely a UX convenience; the server
  // re-validates both conditions independently and never trusts this client-side gate.
  const lowScoreThreshold = $derived(data.notePolicy?.lowScoreThreshold ?? null);
  const isLowScore = $derived(
    Boolean(data.notePolicy?.enabled) &&
      lowScoreThreshold !== null &&
      dimensions.some((dimension) => {
        const value = scores[dimension];
        return value !== 'na' && Number(value) <= lowScoreThreshold;
      })
  );

  const actionData = $derived(form as ActionData);

  // A just-saved Rating (or the Member's already-stored Rating on a normal page load) whose note
  // qualifies for the explicit Report path, and does not already have one, offers that second,
  // deliberate action. Never automatic.
  const reportOfferRating = $derived(
    actionData && 'rating' in actionData && actionData.rating ? actionData.rating : data.myRating
  );
  const showReportOffer = $derived(
    Boolean(
      reportOfferRating &&
      (reportOfferRating.privateNoteClassification === 'inaccurate_info' ||
        reportOfferRating.privateNoteClassification === 'safety_concern') &&
      reportOfferRating.linkedReportId === null
    )
  );

  $effect(() => {
    // Signed out visitors reach this page (rather than a server redirect) so the return context
    // survives in the URL; hand off to sign-in once mounted.
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- signInUrl is server-built
    if (data.signInUrl) void goto(data.signInUrl);
  });

  const enhanceForm = () => {
    submitting = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      submitting = false;
    };
  };

  const errorMessage = $derived(
    actionData?.error === 'incomplete'
      ? data.copy['rating.incomplete']
      : actionData?.error === 'invalid'
        ? data.copy['rating.invalid']
        : actionData?.error === 'conflict'
          ? data.copy['rating.conflict']
          : actionData?.error && (!('action' in actionData) || actionData.action !== 'createReport')
            ? data.copy['rating.unavailable']
            : null
  );

  const reportActionMessage = $derived(
    actionData && 'action' in actionData && actionData.action === 'createReport'
      ? actionData.error === 'invalid'
        ? data.copy['ratingNote.reportInvalid']
        : actionData.error === 'conflict'
          ? data.copy['ratingNote.reportConflict']
          : actionData.error
            ? data.copy['ratingNote.reportUnavailable']
            : actionData.success
              ? data.copy['ratingNote.reportCreated']
              : null
      : null
  );

  const continueUrl = $derived(
    data.place ? `/${data.lang}?place=${encodeURIComponent(data.place.placeId)}` : `/${data.lang}`
  );
</script>

<svelte:head>
  <title>{data.copy['rating.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="hv-page-shell" data-ui-mode="place" data-width="wide">
  <header class="hv-page-header">
    <div>
      <p class="hv-eyebrow">{data.place?.name}</p>
      <h1 class="hv-page-title">{data.copy['rating.title']}</h1>
      <p class="hv-meta">{data.copy['rating.intro']}</p>
    </div>
  </header>

  <p class="hv-notice" data-tone="info" role="note">{data.copy['rating.notAReview']}</p>

  {#if data.myRating?.excluded}
    <p class="hv-notice" data-tone="info" role="status">
      {data.copy['rating.summary.myRatingExcluded']}
    </p>
  {/if}

  {#if data.signInUrl}
    <p class="hv-notice" data-tone="info" role="status">{data.copy['common.loading']}</p>
  {:else if data.unavailable}
    <p class="hv-notice" data-tone="error" role="alert">{data.copy['error.unexpectedBody']}</p>
  {:else if data.place}
    {#if errorMessage}<p class="hv-notice" data-tone="error" role="alert">{errorMessage}</p>{/if}

    <form
      class="hv-stack"
      method="POST"
      action="?/save"
      use:enhance={enhanceForm}
      aria-busy={submitting}
    >
      {#each dimensions as dimension (dimension)}
        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy[`rating.dimension.${dimension}.label` as MessageKey]}</legend>
          <p class="hv-meta dimension-explanation">
            {data.copy[`rating.dimension.${dimension}.explanation` as MessageKey]}
          </p>
          <label class="hv-stack">
            {data.copy[`rating.dimension.${dimension}.label` as MessageKey]}
            <select class="hv-field" name={`${dimension}Score`} bind:value={scores[dimension]}>
              <option value="na">{data.copy['rating.notApplicable']}</option>
              <option value="1">1 · {data.copy['rating.scoreLow']}</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 · {data.copy['rating.scoreHigh']}</option>
            </select>
          </label>
        </fieldset>
      {/each}

      {#if isLowScore}
        <fieldset class="hv-form-section hv-panel note-fieldset">
          <legend>{data.copy['ratingNote.heading']}</legend>
          <p class="hv-meta dimension-explanation">{data.copy['ratingNote.intro']}</p>
          <input type="hidden" name="noteFieldsetTouched" value="true" />

          <fieldset class="classification-group hv-stack">
            <legend>{data.copy['ratingNote.classificationLabel']}</legend>
            {#each classifications as classification (classification)}
              <label class="radio-option">
                <input
                  type="radio"
                  name="privateRatingNoteClassification"
                  value={classification}
                  bind:group={noteClassification}
                  required={noteText.trim().length > 0}
                />
                {data.copy[`ratingNote.classification.${classification}` as MessageKey]}
              </label>
            {/each}
          </fieldset>

          <label class="hv-stack">
            {data.copy['ratingNote.textLabel']}
            <textarea class="hv-field" name="privateRatingNote" rows="4" bind:value={noteText}
            ></textarea>
          </label>

          {#if data.myRating?.privateNote}
            <button
              type="submit"
              name="noteAction"
              value="clear"
              class="hv-control secondary"
              disabled={submitting}
            >
              {data.copy['ratingNote.clearAction']}
            </button>
          {/if}
        </fieldset>
      {/if}

      <button class="hv-control" data-intent="primary" type="submit" disabled={submitting}>
        {submitting ? data.copy['rating.saving'] : data.copy['rating.submit']}
      </button>
    </form>

    {#if showReportOffer}
      <section class="report-offer hv-panel hv-stack" aria-labelledby="report-offer-heading">
        <h2 id="report-offer-heading">{data.copy['ratingNote.reportPromptHeading']}</h2>
        <p>{data.copy['ratingNote.reportPromptIntro']}</p>
        {#if reportActionMessage}
          <p class="hv-notice" data-tone="info" role="status">{reportActionMessage}</p>
        {/if}
        <div class="report-offer-actions">
          <form class="hv-stack" method="POST" action="?/createReport" use:enhance={enhanceForm}>
            <button class="hv-control" data-intent="primary" type="submit" disabled={submitting}>
              {data.copy['ratingNote.createReportAction']}
            </button>
          </form>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- continueUrl carries a place query string resolve() cannot express -->
          <a
            href={continueUrl}
            data-sveltekit-preload-data="hover"
            class="hv-control secondary-link"
          >
            {data.copy['ratingNote.notNowAction']}
          </a>
        </div>
      </section>
    {:else if reportActionMessage}
      <p class="hv-notice" data-tone="info" role="status">{reportActionMessage}</p>
    {/if}
  {/if}
</main>

<style>
  button.secondary {
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    box-shadow: none;
  }
  .secondary-link {
    color: var(--hv-color-fjord);
  }
  fieldset.classification-group {
    margin: 0;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.75rem;
  }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
  }
  .classification-group legend {
    font-size: 1rem;
  }
  .dimension-explanation {
    margin: 0;
  }
  .report-offer {
    margin-top: 1.5rem;
    padding: var(--hv-space-panel);
  }
  .report-offer h2 {
    margin: 0;
    font-size: 1.3rem;
  }
  .report-offer-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
</style>
