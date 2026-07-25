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
  //
  // The whole Place is the default. "This place is closed" is not a claim about a field or a
  // Condition, and a Member who arrives with nothing preselected is far likelier to have one of
  // those claims than to have come here to name a specific fact.
  let targetKind = $state<'place_field' | 'access_condition' | 'place'>(
    untrack(() =>
      data.presetConditionId ? 'access_condition' : data.presetField ? 'place_field' : 'place'
    )
  );
  let targetField = $state<(typeof placeFields)[number]>(
    untrack(() => (data.presetField as (typeof placeFields)[number] | null) ?? 'name')
  );
  let accessConditionId = $state(
    untrack(() => data.presetConditionId ?? data.place?.accessConditions[0]?.id ?? '')
  );
  let reportReason = $state<(typeof reportReasons)[number]>(
    untrack(() => (data.presetReason as (typeof reportReasons)[number] | null) ?? 'inaccurate')
  );

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
      <input type="hidden" name="commandId" value={data.commandId} />
      <fieldset class="availability-boundary hv-stack" disabled={submissionUnavailable}>
        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['correction.targetKind']}</legend>
          <label class="hv-stack">
            {data.copy['correction.targetKind']}
            <select class="hv-field" name="targetKind" bind:value={targetKind}>
              <option value="place">{data.copy['correction.targetWholePlace']}</option>
              <option value="place_field">{data.copy['correction.targetPlaceField']}</option>
              <option value="access_condition"
                >{data.copy['correction.targetAccessCondition']}</option
              >
            </select>
          </label>

          <!-- The whole Place carries neither a field nor a Condition, and the validator rejects
               it paired with either, so neither selector is offered while it is chosen. -->
          {#if targetKind === 'place_field'}
            <label class="hv-stack">
              {data.copy['correction.targetField']}
              <select class="hv-field" name="targetField" bind:value={targetField}>
                {#each placeFields as field (field)}
                  <option value={field}>{localizePlaceField(field, data.copy)}</option>
                {/each}
              </select>
            </label>
          {:else if targetKind === 'access_condition'}
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

        <!-- No Evidence fieldset: the server synthesizes the Member report record the database
             requires, so a Member is never asked to fill in the Moderator's worksheet. -->
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
