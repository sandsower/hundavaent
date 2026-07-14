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

  const selectedCondition = $derived(
    data.place?.accessConditions.find((condition) => condition.id === accessConditionId) ?? null
  );

  $effect(() => {
    if (selectedCondition) {
      accessArea = selectedCondition.accessArea;
      restraintCondition = selectedCondition.restraintCondition;
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

<main class="correction-shell">
  <div class="title-row">
    <div>
      <p class="eyebrow">{data.place?.name}</p>
      <h1>{data.copy['correction.title']}</h1>
      <p class="intro">{data.copy['correction.intro']}</p>
    </div>
    <a href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}
      >{data.copy['flag.myTitle']}</a
    >
  </div>

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

        {#if targetKind === 'place_field'}
          <fieldset>
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

          <fieldset>
            <legend>{data.copy['correction.proposedValue']}</legend>
            {#if targetField === 'name' || targetField === 'description'}
              <div class="grid two">
                <label>
                  {data.copy['correction.nameIs']}
                  <input name="fieldValueIs" required />
                </label>
                <label>
                  {data.copy['correction.nameEn']}
                  <input name="fieldValueEn" required />
                </label>
              </div>
            {:else if targetField === 'opening_hours'}
              <label>
                {data.copy['correction.openingHoursJson']}
                <textarea name="fieldValueJson" rows="4"></textarea>
              </label>
            {:else if targetField === 'dog_amenities'}
              <label>
                {data.copy['correction.dogAmenitiesList']}
                <input name="fieldValueList" />
              </label>
            {:else}
              <label>
                {data.copy['correction.textValue']}
                <input name="fieldValueText" />
              </label>
            {/if}
          </fieldset>
        {:else if selectedCondition}
          <fieldset>
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

          <fieldset>
            <legend>{data.copy['correction.proposedValue']}</legend>
            <div class="grid three">
              <label>
                {data.copy['correction.accessArea']}
                <select name="accessArea" bind:value={accessArea}>
                  {#each accessAreas as area (area)}
                    <option value={area}>{localizeAccessArea(area, data.copy)}</option>
                  {/each}
                </select>
              </label>
              <label>
                {data.copy['correction.restraint']}
                <select name="restraintCondition" bind:value={restraintCondition}>
                  {#each restraints as restraint (restraint)}
                    <option value={restraint}>{localizeRestraint(restraint, data.copy)}</option>
                  {/each}
                </select>
              </label>
              <label>
                {data.copy['correction.permission']}
                <select
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
              <label>
                {data.copy['correction.accessAreaNote']}
                <input
                  name="accessAreaNote"
                  value={selectedCondition.accessAreaNote ?? ''}
                  required
                />
              </label>
            {/if}
            {#if restraintCondition === 'other_sourced'}
              <label>
                {data.copy['correction.restraintNote']}
                <input
                  name="restraintNote"
                  value={selectedCondition.restraintNote ?? ''}
                  required
                />
              </label>
            {/if}
            <div class="grid two">
              <label>
                {data.copy['correction.availabilityStarts']}
                <input
                  name="availabilityStartsAt"
                  type="time"
                  value={selectedCondition.availabilityWindow.startsAt ?? ''}
                />
              </label>
              <label>
                {data.copy['correction.availabilityEnds']}
                <input
                  name="availabilityEndsAt"
                  type="time"
                  value={selectedCondition.availabilityWindow.endsAt ?? ''}
                />
              </label>
            </div>
            <label>
              {data.copy['correction.availabilityDays']}
              <input
                name="availabilityDays"
                value={(selectedCondition.availabilityWindow.days ?? []).join(',')}
              />
            </label>
          </fieldset>
        {/if}

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
          <legend>{data.copy['correction.explanation']}</legend>
          <label>
            {data.copy['correction.explanation']}
            <textarea name="explanation" rows="3" required></textarea>
          </label>
          <p class="notice">{data.copy['correction.dataUseNotice']}</p>
        </fieldset>

        <button type="submit" disabled={submitting || submissionUnavailable}>
          {submitting ? data.copy['correction.sending'] : data.copy['correction.submit']}
        </button>
      </fieldset>
    </form>
  {/if}
</main>

<style>
  .correction-shell {
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
  form {
    display: grid;
    gap: 1rem;
    margin-top: 2rem;
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
  .three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
  @media (max-width: 48rem) {
    .title-row {
      display: grid;
    }
    .two,
    .three {
      grid-template-columns: 1fr;
    }
  }
</style>
