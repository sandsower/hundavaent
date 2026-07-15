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

<main class="hv-page-shell" data-ui-mode="place" data-width="wide">
  <header class="hv-page-header">
    <div>
      <p class="hv-eyebrow">{data.place?.name}</p>
      <h1 class="hv-page-title">{data.copy['report.title']}</h1>
      <p class="hv-meta">{data.copy['report.intro']}</p>
    </div>
    <div class="hv-page-actions">
      <a
        class="hv-control"
        href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
        >{data.copy['flag.myTitle']}</a
      >
    </div>
  </header>

  <p class="hv-notice" data-tone="info" role="note">{data.copy['report.safetyDisclaimer']}</p>

  {#if data.signInUrl}
    <p class="hv-notice" data-tone="info" role="status">{data.copy['common.loading']}</p>
  {:else if data.unavailable}
    <p class="hv-notice" data-tone="error" role="alert">{data.copy['error.unexpectedBody']}</p>
  {:else if data.place}
    {#if errorMessage}<p class="hv-notice" data-tone="error" role="alert">{errorMessage}</p>{/if}

    <form class="hv-stack" method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <fieldset class="availability-boundary hv-stack" disabled={submissionUnavailable}>
        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['correction.targetKind']}</legend>
          <label class="hv-stack">
            {data.copy['correction.targetKind']}
            <select class="hv-field" name="targetKind" bind:value={targetKind}>
              <option value="place_field">{data.copy['correction.targetPlaceField']}</option>
              <option value="access_condition"
                >{data.copy['correction.targetAccessCondition']}</option
              >
            </select>
          </label>

          {#if targetKind === 'place_field'}
            <label class="hv-stack">
              {data.copy['correction.targetField']}
              <select class="hv-field" name="targetField" bind:value={targetField}>
                {#each placeFields as field (field)}
                  <option value={field}>{localizePlaceField(field, data.copy)}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label class="hv-stack">
              {data.copy['correction.targetCondition']}
              <select class="hv-field" name="accessConditionId" bind:value={accessConditionId}>
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

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['report.reason']}</legend>
          <label class="hv-stack">
            {data.copy['report.reason']}
            <select class="hv-field" name="reportReason" bind:value={reportReason}>
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
            <label class="hv-stack">
              {data.copy['report.successorPlaceId']}
              <input class="hv-field" name="successorPlaceId" />
            </label>
          {/if}
        </fieldset>

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['evidenceField.section']}</legend>
          <div class="hv-grid" data-columns="2">
            <label class="hv-stack">
              {data.copy['evidenceField.kind']}
              <select class="hv-field" name="evidenceKind" required>
                <option value="official_website">{data.copy['evidence.officialWebsite']}</option>
                <option value="venue_representative"
                  >{data.copy['evidence.venueRepresentative']}</option
                >
                <option value="member_report">{data.copy['evidence.memberReport']}</option>
                <option value="direct_observation">{data.copy['evidence.directObservation']}</option
                >
                <option value="public_record">{data.copy['evidence.publicRecord']}</option>
                <option value="other">{data.copy['evidence.other']}</option>
              </select>
            </label>
            <label class="hv-stack">
              {data.copy['evidenceField.label']}
              <input class="hv-field" name="evidenceSourceLabel" required />
            </label>
          </div>
          <div class="hv-grid" data-columns="2">
            <label class="hv-stack">
              {data.copy['evidenceField.url']}
              <input class="hv-field" name="evidenceUrl" type="url" />
            </label>
            <label class="hv-stack">
              {data.copy['evidenceField.citation']}
              <input class="hv-field" name="evidenceCitation" />
            </label>
          </div>
          <label class="hv-stack">
            {data.copy['evidenceField.observedAt']}
            <input class="hv-field" name="evidenceObservedAt" type="datetime-local" required />
          </label>
        </fieldset>

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['report.explanation']}</legend>
          <label class="hv-stack">
            {data.copy['report.explanation']}
            <textarea class="hv-field" name="explanation" rows="3" required></textarea>
          </label>
          <p class="hv-meta">{data.copy['report.dataUseNotice']}</p>
        </fieldset>

        <button
          class="hv-control"
          data-intent="primary"
          type="submit"
          disabled={submitting || submissionUnavailable}
        >
          {submitting ? data.copy['report.sending'] : data.copy['report.submit']}
        </button>
      </fieldset>
    </form>
  {/if}
</main>

<style>
  .availability-boundary {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
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
</style>
