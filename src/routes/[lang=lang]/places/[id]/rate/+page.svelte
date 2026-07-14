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

<main class="rating-shell">
  <div class="title-row">
    <div>
      <p class="eyebrow">{data.place?.name}</p>
      <h1>{data.copy['rating.title']}</h1>
      <p class="intro">{data.copy['rating.intro']}</p>
    </div>
  </div>

  <p class="disclaimer" role="note">{data.copy['rating.notAReview']}</p>

  {#if data.myRating?.excluded}
    <p class="message" role="status">{data.copy['rating.summary.myRatingExcluded']}</p>
  {/if}

  {#if data.signInUrl}
    <p class="message" role="status">{data.copy['common.loading']}</p>
  {:else if data.unavailable}
    <p class="message error" role="alert">{data.copy['error.unexpectedBody']}</p>
  {:else if data.place}
    {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}

    <form method="POST" action="?/save" use:enhance={enhanceForm} aria-busy={submitting}>
      {#each dimensions as dimension (dimension)}
        <fieldset>
          <legend>{data.copy[`rating.dimension.${dimension}.label` as MessageKey]}</legend>
          <p class="dimension-explanation">
            {data.copy[`rating.dimension.${dimension}.explanation` as MessageKey]}
          </p>
          <label>
            {data.copy[`rating.dimension.${dimension}.label` as MessageKey]}
            <select name={`${dimension}Score`} bind:value={scores[dimension]}>
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
        <fieldset class="note-fieldset">
          <legend>{data.copy['ratingNote.heading']}</legend>
          <p class="dimension-explanation">{data.copy['ratingNote.intro']}</p>
          <input type="hidden" name="noteFieldsetTouched" value="true" />

          <fieldset class="classification-group">
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

          <label>
            {data.copy['ratingNote.textLabel']}
            <textarea name="privateRatingNote" rows="4" bind:value={noteText}></textarea>
          </label>

          {#if data.myRating?.privateNote}
            <button
              type="submit"
              name="noteAction"
              value="clear"
              class="secondary"
              disabled={submitting}
            >
              {data.copy['ratingNote.clearAction']}
            </button>
          {/if}
        </fieldset>
      {/if}

      <button type="submit" disabled={submitting}>
        {submitting ? data.copy['rating.saving'] : data.copy['rating.submit']}
      </button>
    </form>

    {#if showReportOffer}
      <section class="report-offer" aria-labelledby="report-offer-heading">
        <h2 id="report-offer-heading">{data.copy['ratingNote.reportPromptHeading']}</h2>
        <p>{data.copy['ratingNote.reportPromptIntro']}</p>
        {#if reportActionMessage}<p class="message" role="status">{reportActionMessage}</p>{/if}
        <div class="report-offer-actions">
          <form method="POST" action="?/createReport" use:enhance={enhanceForm}>
            <button type="submit" disabled={submitting}>
              {data.copy['ratingNote.createReportAction']}
            </button>
          </form>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- continueUrl carries a place query string resolve() cannot express -->
          <a href={continueUrl} data-sveltekit-preload-data="hover" class="secondary-link">
            {data.copy['ratingNote.notNowAction']}
          </a>
        </div>
      </section>
    {:else if reportActionMessage}
      <p class="message" role="status">{reportActionMessage}</p>
    {/if}
  {/if}
</main>

<style>
  .rating-shell {
    width: min(100% - 2rem, 68rem);
    margin: 2rem auto 5rem;
  }
  .title-row {
    display: flex;
    gap: 2rem;
    align-items: start;
    justify-content: space-between;
  }
  button {
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    padding: 0.75rem 1rem;
    font-weight: 900;
    box-shadow: 0 0.2rem 0 var(--ink);
  }
  button.secondary {
    background: var(--paper-raised);
    box-shadow: none;
  }
  .secondary-link {
    font-weight: 800;
    color: var(--ink-soft);
  }
  .eyebrow {
    color: var(--coral-dark);
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  h1 {
    margin: 0.25rem 0;
    font-size: clamp(2.25rem, 6vw, 4.5rem);
    line-height: 0.95;
  }
  .disclaimer {
    margin-top: 1.5rem;
    border: 2px solid var(--ink);
    border-radius: 0.9rem;
    background: var(--mint);
    padding: 0.9rem;
    font-weight: 800;
  }
  form {
    display: grid;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  fieldset {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    border: 2px solid var(--ink);
    border-radius: 1.25rem;
    background: var(--paper-raised);
    padding: 1.2rem;
    box-shadow: 0.3rem 0.35rem 0 var(--teal);
  }
  fieldset.note-fieldset {
    box-shadow: 0.3rem 0.35rem 0 var(--coral-dark);
  }
  fieldset.classification-group {
    box-shadow: none;
    padding: 0.75rem;
    gap: 0.4rem;
  }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
  }
  legend {
    padding: 0 0.5rem;
    font-size: 1.2rem;
    font-weight: 950;
  }
  .classification-group legend {
    font-size: 1rem;
  }
  .dimension-explanation {
    margin: 0;
    color: var(--ink-soft);
    font-weight: 700;
  }
  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 800;
  }
  select,
  textarea {
    width: 100%;
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    background: white;
    padding: 0.7rem;
    color: var(--ink);
    font: inherit;
  }
  select:focus-visible,
  textarea:focus-visible,
  button:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
  .message {
    border: 2px solid var(--ink);
    border-radius: 0.75rem;
    padding: 0.9rem;
    font-weight: 850;
  }
  .error {
    background: var(--coral-soft);
  }
  .report-offer {
    margin-top: 1.5rem;
    display: grid;
    gap: 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 1.25rem;
    background: var(--coral-soft);
    padding: 1.2rem;
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
  @media (max-width: 48rem) {
    .title-row {
      display: grid;
    }
  }
</style>
