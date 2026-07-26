<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import {
    localizeAccessArea,
    localizePermission,
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
  const accessAreas = ['indoors', 'outdoors', 'designated_area', 'other_bounded'] as const;
  const restraints = [
    'leash_required',
    'off_leash_permitted',
    'carrier_required',
    'other_sourced'
  ] as const;
  const permissions = ['standing_permission', 'ask_on_arrival', 'advance_approval'] as const;

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
  let accessArea = $state<(typeof accessAreas)[number]>('indoors');
  let restraintCondition = $state<(typeof restraints)[number]>('leash_required');
  let availabilityState = $state<'whenever_open' | 'limited' | 'not_stated'>('not_stated');

  const selectedCondition = $derived(
    data.place?.accessConditions.find((condition) => condition.id === accessConditionId) ?? null
  );

  $effect(() => {
    if (selectedCondition) {
      accessArea = selectedCondition.accessArea;
      restraintCondition = selectedCondition.restraintCondition;
      availabilityState = selectedCondition.availabilityState ?? 'not_stated';
    }
  });

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
      ? data.copy['correction.policyUnavailable']
      : (form as ActionData)?.error === 'rate_limited'
        ? data.copy['correction.rateLimited']
        : (form as ActionData)?.error === 'incomplete'
          ? data.copy['correction.incomplete']
          : (form as ActionData)?.error
            ? data.copy['correction.invalid']
            : null
  );
  const submissionUnavailable = $derived((form as ActionData)?.error === 'policy_unavailable');
</script>

<svelte:head>
  <title>{data.copy['correction.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="hv-page-shell" data-ui-mode="place" data-width="wide">
  <header class="hv-page-header">
    <div class="hv-page-heading">
      <p class="hv-eyebrow">{data.place?.name}</p>
      <h1 class="hv-page-title">{data.copy['correction.title']}</h1>
      <p class="hv-meta">{data.copy['correction.intro']}</p>
    </div>
    <div class="hv-page-actions">
      <a
        class="hv-control"
        href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
        >{data.copy['flag.myTitle']}</a
      >
    </div>
  </header>

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

        {#if targetKind === 'place_field'}
          <fieldset class="hv-form-section hv-panel">
            <legend>{data.copy['correction.currentValue']}</legend>
            {#if targetField === 'name'}
              <p>{data.place.name}</p>
            {:else if targetField === 'description'}
              <p>{data.place.description}</p>
            {:else if targetField === 'website_url'}
              <p>{data.place.websiteUrl ?? data.copy['common.notAvailable']}</p>
            {:else if targetField === 'phone'}
              <p>{data.place.phone ?? data.copy['common.notAvailable']}</p>
            {:else if targetField === 'opening_hours'}
              <pre>{JSON.stringify(data.place.openingHours, null, 2)}</pre>
            {:else if targetField === 'dog_amenities'}
              <p>{data.place.dogAmenities.join(', ') || data.copy['common.notAvailable']}</p>
            {/if}
          </fieldset>

          <fieldset class="hv-form-section hv-panel">
            <legend>{data.copy['correction.proposedValue']}</legend>
            {#if targetField === 'name' || targetField === 'description'}
              <div class="hv-grid" data-columns="2">
                <label class="hv-stack">
                  {data.copy['correction.nameIs']}
                  <input class="hv-field" name="fieldValueIs" />
                </label>
                <label class="hv-stack">
                  {data.copy['correction.nameEn']}
                  <input class="hv-field" name="fieldValueEn" />
                </label>
              </div>
              <!-- Neither box is required on its own, because asking a Member for a language they
                   may not speak is what left description Corrections with no honest way to send.
                   The blank one is named for review and a Moderator fills it before it applies. -->
              <p class="hv-meta">{data.copy['correction.localeOptional']}</p>
            {:else if targetField === 'opening_hours'}
              <label class="hv-stack">
                {data.copy['correction.openingHoursJson']}
                <textarea class="hv-field" name="fieldValueJson" rows="4"></textarea>
              </label>
            {:else if targetField === 'dog_amenities'}
              <label class="hv-stack">
                {data.copy['correction.dogAmenitiesList']}
                <input class="hv-field" name="fieldValueList" />
              </label>
            {:else}
              <label class="hv-stack">
                {data.copy['correction.textValue']}
                <input class="hv-field" name="fieldValueText" />
              </label>
            {/if}
          </fieldset>
        {:else if selectedCondition}
          <fieldset class="hv-form-section hv-panel">
            <legend>{data.copy['correction.currentValue']}</legend>
            <dl>
              <div>
                <dt>{data.copy['correction.accessArea']}</dt>
                <dd>{localizeAccessArea(selectedCondition.accessArea, data.copy)}</dd>
              </div>
              <div>
                <dt>{data.copy['correction.restraint']}</dt>
                <dd>{localizeRestraint(selectedCondition.restraintCondition, data.copy)}</dd>
              </div>
              <div>
                <dt>{data.copy['correction.permission']}</dt>
                <dd>{localizePermission(selectedCondition.permissionRequirement, data.copy)}</dd>
              </div>
            </dl>
          </fieldset>

          <fieldset class="hv-form-section hv-panel">
            <legend>{data.copy['correction.proposedValue']}</legend>
            <div class="hv-grid" data-columns="3">
              <label class="hv-stack">
                {data.copy['correction.accessArea']}
                <select class="hv-field" name="accessArea" bind:value={accessArea}>
                  {#each accessAreas as area (area)}
                    <option value={area}>{localizeAccessArea(area, data.copy)}</option>
                  {/each}
                </select>
              </label>
              <label class="hv-stack">
                {data.copy['correction.restraint']}
                <select class="hv-field" name="restraintCondition" bind:value={restraintCondition}>
                  {#each restraints as restraint (restraint)}
                    <option value={restraint}>{localizeRestraint(restraint, data.copy)}</option>
                  {/each}
                </select>
              </label>
              <label class="hv-stack">
                {data.copy['correction.permission']}
                <select
                  class="hv-field"
                  name="permissionRequirement"
                  value={selectedCondition.permissionRequirement}
                >
                  {#each permissions as permission (permission)}
                    <option value={permission}>{localizePermission(permission, data.copy)}</option>
                  {/each}
                </select>
              </label>
            </div>
            {#if accessArea === 'other_bounded'}
              <label class="hv-stack">
                {data.copy['correction.accessAreaNote']}
                <input
                  class="hv-field"
                  name="accessAreaNote"
                  value={selectedCondition.accessAreaNote ?? ''}
                  required
                />
              </label>
            {/if}
            {#if restraintCondition === 'other_sourced'}
              <label class="hv-stack">
                {data.copy['correction.restraintNote']}
                <input
                  class="hv-field"
                  name="restraintNote"
                  value={selectedCondition.restraintNote ?? ''}
                  required
                />
              </label>
            {/if}
            <label class="hv-stack">
              {data.copy['moderation.availabilityStateLabel']}
              <select class="hv-field" name="availabilityState" bind:value={availabilityState}>
                <option value="not_stated">{data.copy['accessSymbols.notStated']}</option>
                <option value="whenever_open">{data.copy['accessSymbols.wheneverOpen']}</option>
                <option value="limited">{data.copy['accessSymbols.limited']}</option>
              </select>
            </label>
            {#if availabilityState === 'limited'}
              <div class="hv-grid" data-columns="2">
                <label class="hv-stack">
                  {data.copy['correction.availabilityStarts']}
                  <input
                    class="hv-field"
                    name="availabilityStartsAt"
                    type="time"
                    value={selectedCondition.availabilityWindow.startsAt ?? ''}
                  />
                </label>
                <label class="hv-stack">
                  {data.copy['correction.availabilityEnds']}
                  <input
                    class="hv-field"
                    name="availabilityEndsAt"
                    type="time"
                    value={selectedCondition.availabilityWindow.endsAt ?? ''}
                  />
                </label>
              </div>
              <label class="hv-stack">
                {data.copy['correction.availabilityDays']}
                <input
                  class="hv-field"
                  name="availabilityDays"
                  value={(selectedCondition.availabilityWindow.days ?? []).join(',')}
                />
              </label>
            {/if}
          </fieldset>
        {/if}

        <!-- No Evidence fieldset: the server synthesizes the Member report record the database
             requires, so a Member is never asked to fill in the Moderator's worksheet. -->
        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['correction.explanation']}</legend>
          <label class="hv-stack">
            {data.copy['correction.explanation']}
            <textarea class="hv-field" name="explanation" rows="3" required></textarea>
          </label>
          <p class="hv-meta">{data.copy['correction.dataUseNotice']}</p>
        </fieldset>

        <button
          class="hv-control"
          data-intent="primary"
          type="submit"
          disabled={submitting || submissionUnavailable}
        >
          {submitting ? data.copy['correction.sending'] : data.copy['correction.submit']}
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
  dl {
    display: grid;
    gap: 0.6rem;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 0.35fr) 1fr;
    gap: 1rem;
  }
  pre {
    max-width: 100%;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
