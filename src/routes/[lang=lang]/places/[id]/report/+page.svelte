<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import {
    localizeAccessArea,
    localizePlaceField,
    localizeRestraint
  } from '$i18n/structured-place';

  import type { ActionData, PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const placeFields = [
    'name',
    'description',
    'website_url',
    'phone',
    'opening_hours',
    'dog_amenities'
  ] as const;
  const reportReasons = [
    'inaccurate',
    'unsafe',
    'misleading',
    'obsolete',
    'closed',
    'moved',
    'successor_place'
  ] as const;

  let submitting = $state(false);
  // The target selector starts from the query-string preset (set once, from the link the Member
  // followed) and is thereafter freely editable, so the initial read is intentionally untracked.
  let targetKind = $state<'place_field' | 'access_condition'>(
    untrack(() => (data.presetConditionId ? 'access_condition' : 'place_field'))
  );
  let targetField = $state<(typeof placeFields)[number]>(
    untrack(() => (data.presetField as (typeof placeFields)[number] | null) ?? 'name')
  );
  let accessConditionId = $state(
    untrack(() => data.presetConditionId ?? data.place?.accessConditions[0]?.id ?? '')
  );
  let reportReason = $state<(typeof reportReasons)[number]>('inaccurate');

  $effect(() => {
    // Signed out visitors reach this page (rather than a server redirect) so the preselected
    // target survives in the URL; hand off to sign-in once mounted.
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- signInUrl is server-built by accountRedirectUrl()
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
    (form as ActionData)?.error === 'policy_unavailable'
      ? data.copy['report.policyUnavailable']
      : (form as ActionData)?.error === 'rate_limited'
        ? data.copy['report.rateLimited']
        : (form as ActionData)?.error === 'incomplete'
          ? data.copy['report.incomplete']
          : (form as ActionData)?.error
            ? data.copy['report.invalid']
            : null
  );
  const submissionUnavailable = $derived((form as ActionData)?.error === 'policy_unavailable');
</script>

<svelte:head>
  <title>{data.copy['report.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="report-shell">
  <div class="title-row">
    <div>
      <p class="eyebrow">{data.place?.name}</p>
      <h1>{data.copy['report.title']}</h1>
      <p class="intro">{data.copy['report.intro']}</p>
    </div>
    <a href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
      >{data.copy['flag.myTitle']}</a
    >
  </div>

  <p class="disclaimer" role="note">{data.copy['report.safetyDisclaimer']}</p>

  {#if data.signInUrl}
    <p class="message" role="status">{data.copy['common.loading']}</p>
  {:else if data.unavailable}
    <p class="message error" role="alert">{data.copy['error.unexpectedBody']}</p>
  {:else if data.place}
    {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}

    <form method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <fieldset class="availability-boundary" disabled={submissionUnavailable}>
        <fieldset>
          <legend>{data.copy['correction.targetKind']}</legend>
          <label>
            {data.copy['correction.targetKind']}
            <select name="targetKind" bind:value={targetKind}>
              <option value="place_field">{data.copy['correction.targetPlaceField']}</option>
              <option value="access_condition"
                >{data.copy['correction.targetAccessCondition']}</option
              >
            </select>
          </label>

          {#if targetKind === 'place_field'}
            <label>
              {data.copy['correction.targetField']}
              <select name="targetField" bind:value={targetField}>
                {#each placeFields as field (field)}
                  <option value={field}>{localizePlaceField(field, data.copy)}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label>
              {data.copy['correction.targetCondition']}
              <select name="accessConditionId" bind:value={accessConditionId}>
                {#each data.place.accessConditions as condition (condition.id)}
                  <option value={condition.id}>
                    {localizeAccessArea(condition.accessArea, data.copy)} ·
                    {localizeRestraint(condition.restraintCondition, data.copy)}
                  </option>
                {/each}
              </select>
            </label>
          {/if}
        </fieldset>

        <fieldset>
          <legend>{data.copy['report.reason']}</legend>
          <label>
            {data.copy['report.reason']}
            <select name="reportReason" bind:value={reportReason}>
              {#each reportReasons as reason (reason)}
                <option value={reason}
                  >{data.copy[
                    `reportReason.${reason === 'successor_place' ? 'successorPlace' : reason}`
                  ]}</option
                >
              {/each}
            </select>
          </label>
          <label class="checkbox">
            <input type="checkbox" name="isSafetyConcern" />
            {data.copy['report.safetyConcern']}
          </label>
          {#if reportReason === 'successor_place'}
            <label>
              {data.copy['report.successorPlaceId']}
              <input name="successorPlaceId" />
            </label>
          {/if}
        </fieldset>

        <fieldset>
          <legend>{data.copy['evidenceField.section']}</legend>
          <div class="grid two">
            <label>
              {data.copy['evidenceField.kind']}
              <select name="evidenceKind" required>
                <option value="official_website">official_website</option>
                <option value="venue_representative">venue_representative</option>
                <option value="member_report">member_report</option>
                <option value="direct_observation">direct_observation</option>
                <option value="public_record">public_record</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              {data.copy['evidenceField.label']}
              <input name="evidenceSourceLabel" required />
            </label>
          </div>
          <div class="grid two">
            <label>
              {data.copy['evidenceField.url']}
              <input name="evidenceUrl" type="url" />
            </label>
            <label>
              {data.copy['evidenceField.citation']}
              <input name="evidenceCitation" />
            </label>
          </div>
          <label>
            {data.copy['evidenceField.observedAt']}
            <input name="evidenceObservedAt" type="datetime-local" required />
          </label>
        </fieldset>

        <fieldset>
          <legend>{data.copy['report.explanation']}</legend>
          <label>
            {data.copy['report.explanation']}
            <textarea name="explanation" rows="3" required></textarea>
          </label>
          <p class="notice">{data.copy['report.dataUseNotice']}</p>
        </fieldset>

        <button type="submit" disabled={submitting || submissionUnavailable}>
          {submitting ? data.copy['report.sending'] : data.copy['report.submit']}
        </button>
      </fieldset>
    </form>
  {/if}
</main>

<style>
  .report-shell {
    width: min(100% - 2rem, 68rem);
    margin: 2rem auto 5rem;
  }
  .title-row {
    display: flex;
    gap: 2rem;
    align-items: start;
    justify-content: space-between;
  }
  .title-row a,
  button {
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    padding: 0.75rem 1rem;
    font-weight: 900;
    box-shadow: 0 0.2rem 0 var(--ink);
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
    gap: 1rem;
    margin: 0;
    border: 2px solid var(--ink);
    border-radius: 1.25rem;
    background: var(--paper-raised);
    padding: 1.2rem;
    box-shadow: 0.3rem 0.35rem 0 var(--teal);
  }
  legend {
    padding: 0 0.5rem;
    font-size: 1.2rem;
    font-weight: 950;
  }
  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 800;
  }
  label.checkbox {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
  }
  label.checkbox input {
    width: auto;
  }
  input,
  textarea,
  select {
    width: 100%;
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    background: white;
    padding: 0.7rem;
    color: var(--ink);
    font: inherit;
  }
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
  .grid {
    display: grid;
    gap: 1rem;
  }
  .two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .notice {
    margin: 0;
    color: var(--ink-soft);
    font-weight: 700;
  }
  @media (max-width: 48rem) {
    .title-row {
      display: grid;
    }
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>
