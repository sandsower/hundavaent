<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import {
    Button,
    Choice,
    Field,
    FormSection,
    Input,
    Select,
    Textarea
  } from '@hundavaent/design-system';
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
    <div class="hv-page-heading">
      <p class="hv-eyebrow">{data.place?.name}</p>
      <h1 class="hv-page-title">{data.copy['report.title']}</h1>
      <p class="hv-meta">{data.copy['report.intro']}</p>
    </div>
    <div class="hv-page-actions">
      <Button href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}>
        {data.copy['flag.myTitle']}
      </Button>
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
        <FormSection legend={data.copy['correction.targetKind']}>
          <Field label={data.copy['correction.targetKind']}>
            <Select name="targetKind" bind:value={targetKind}>
              <option value="place">{data.copy['correction.targetWholePlace']}</option>
              <option value="place_field">{data.copy['correction.targetPlaceField']}</option>
              <option value="access_condition"
                >{data.copy['correction.targetAccessCondition']}</option
              >
            </Select>
          </Field>

          <!-- The whole Place carries neither a field nor a Condition, and the validator rejects
               it paired with either, so neither selector is offered while it is chosen. -->
          {#if targetKind === 'place_field'}
            <Field label={data.copy['correction.targetField']}>
              <Select name="targetField" bind:value={targetField}>
                {#each placeFields as field (field)}
                  <option value={field}>{localizePlaceField(field, data.copy)}</option>
                {/each}
              </Select>
            </Field>
          {:else if targetKind === 'access_condition'}
            <Field label={data.copy['correction.targetCondition']}>
              <Select name="accessConditionId" bind:value={accessConditionId}>
                {#each data.place.accessConditions as condition (condition.id)}
                  <option value={condition.id}>
                    {localizeAccessArea(condition.accessArea, data.copy)} ·
                    {localizeRestraint(condition.restraintCondition, data.copy)}
                  </option>
                {/each}
              </Select>
            </Field>
          {/if}
        </FormSection>

        <FormSection legend={data.copy['report.reason']}>
          <Field label={data.copy['report.reason']}>
            <Select name="reportReason" bind:value={reportReason}>
              {#each reportReasons as reason (reason)}
                <option value={reason}
                  >{data.copy[
                    `reportReason.${reason === 'successor_place' ? 'successorPlace' : reason}`
                  ]}</option
                >
              {/each}
            </Select>
          </Field>
          <Choice type="checkbox" name="isSafetyConcern">
            {data.copy['report.safetyConcern']}
          </Choice>
          {#if reportReason === 'successor_place'}
            <Field label={data.copy['report.successorPlaceId']}>
              <Input name="successorPlaceId" />
            </Field>
          {/if}
        </FormSection>

        <!-- No Evidence fieldset: the server synthesizes the Member report record the database
             requires, so a Member is never asked to fill in the Moderator's worksheet. -->
        <FormSection legend={data.copy['report.explanation']}>
          <Field label={data.copy['report.explanation']}>
            <Textarea name="explanation" required></Textarea>
          </Field>
          <p class="hv-meta">{data.copy['report.dataUseNotice']}</p>
        </FormSection>

        <Button intent="primary" type="submit" disabled={submitting || submissionUnavailable}>
          {submitting ? data.copy['report.sending'] : data.copy['report.submit']}
        </Button>
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
</style>
