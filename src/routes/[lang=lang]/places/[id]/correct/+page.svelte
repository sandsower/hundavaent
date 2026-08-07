<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import {
    Button,
    Eyebrow,
    Field,
    FormSection,
    Input,
    Meta,
    Notice,
    PageHeader,
    PageShell,
    PageTitle,
    Select,
    Textarea
  } from '@hundavaent/design-system';
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

<PageShell>
  <PageHeader class="mb-section">
    <Eyebrow>{data.place?.name}</Eyebrow>
    <PageTitle>{data.copy['correction.title']}</PageTitle>
    <Meta>{data.copy['correction.intro']}</Meta>
    <div class="flex flex-wrap items-center gap-actions">
      <Button href={resolve('/[lang=lang]/account/corrections-and-reports', { lang: data.lang })}>
        {data.copy['flag.myTitle']}
      </Button>
    </div>
  </PageHeader>

  {#if data.signInUrl}
    <Notice as="p" tone="info" role="status">{data.copy['common.loading']}</Notice>
  {:else if data.unavailable}
    <Notice as="p" tone="error" role="alert">{data.copy['error.unexpectedBody']}</Notice>
  {:else if data.place}
    {#if errorMessage}<Notice as="p" tone="error" role="alert">{errorMessage}</Notice>{/if}

    <form class="grid gap-context" method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <input type="hidden" name="commandId" value={data.commandId} />
      <fieldset
        class="availability-boundary grid gap-context min-w-0 m-0 [border:0] p-0"
        disabled={submissionUnavailable}
      >
        <FormSection legend={data.copy['correction.targetKind']}>
          <Field label={data.copy['correction.targetKind']}>
            <Select name="targetKind" bind:value={targetKind}>
              <option value="place_field">{data.copy['correction.targetPlaceField']}</option>
              <option value="access_condition"
                >{data.copy['correction.targetAccessCondition']}</option
              >
            </Select>
          </Field>

          {#if targetKind === 'place_field'}
            <Field label={data.copy['correction.targetField']}>
              <Select name="targetField" bind:value={targetField}>
                {#each placeFields as field (field)}
                  <option value={field}>{localizePlaceField(field, data.copy)}</option>
                {/each}
              </Select>
            </Field>
          {:else}
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

        {#if targetKind === 'place_field'}
          <FormSection legend={data.copy['correction.currentValue']}>
            {#if targetField === 'name'}
              <p>{data.place.name}</p>
            {:else if targetField === 'description'}
              <p>{data.place.description}</p>
            {:else if targetField === 'website_url'}
              <p>{data.place.websiteUrl ?? data.copy['common.notAvailable']}</p>
            {:else if targetField === 'phone'}
              <p>{data.place.phone ?? data.copy['common.notAvailable']}</p>
            {:else if targetField === 'opening_hours'}
              <pre class="max-w-full wrap-anywhere whitespace-pre-wrap">{JSON.stringify(
                  data.place.openingHours,
                  null,
                  2
                )}</pre>
            {:else if targetField === 'dog_amenities'}
              <p>{data.place.dogAmenities.join(', ') || data.copy['common.notAvailable']}</p>
            {/if}
          </FormSection>

          <FormSection legend={data.copy['correction.proposedValue']}>
            {#if targetField === 'name' || targetField === 'description'}
              <div class="grid grid-cols-2 gap-context max-narrow:grid-cols-1">
                <Field label={data.copy['correction.nameIs']}>
                  <Input name="fieldValueIs" />
                </Field>
                <Field label={data.copy['correction.nameEn']}>
                  <Input name="fieldValueEn" />
                </Field>
              </div>
              <!-- Neither box is required on its own, because asking a Member for a language they
                   may not speak is what left description Corrections with no honest way to send.
                   The blank one is named for review and a Moderator fills it before it applies.
                   This hint sits below the pair rather than inside one Field's hint, exactly as
                   it did before migration: it is not about either box alone. -->
              <Meta class="my-[1em]">{data.copy['correction.localeOptional']}</Meta>
            {:else if targetField === 'opening_hours'}
              <Field label={data.copy['correction.openingHoursJson']}>
                <Textarea name="fieldValueJson"></Textarea>
              </Field>
            {:else if targetField === 'dog_amenities'}
              <Field label={data.copy['correction.dogAmenitiesList']}>
                <Input name="fieldValueList" />
              </Field>
            {:else}
              <Field label={data.copy['correction.textValue']}>
                <Input name="fieldValueText" />
              </Field>
            {/if}
          </FormSection>
        {:else if selectedCondition}
          <FormSection legend={data.copy['correction.currentValue']}>
            <dl class="grid gap-[0.6rem]">
              <div class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] gap-4">
                <dt>{data.copy['correction.accessArea']}</dt>
                <dd>{localizeAccessArea(selectedCondition.accessArea, data.copy)}</dd>
              </div>
              <div class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] gap-4">
                <dt>{data.copy['correction.restraint']}</dt>
                <dd>{localizeRestraint(selectedCondition.restraintCondition, data.copy)}</dd>
              </div>
              <div class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] gap-4">
                <dt>{data.copy['correction.permission']}</dt>
                <dd>{localizePermission(selectedCondition.permissionRequirement, data.copy)}</dd>
              </div>
            </dl>
          </FormSection>

          <FormSection legend={data.copy['correction.proposedValue']}>
            <div class="grid grid-cols-3 gap-context max-narrow:grid-cols-1">
              <Field label={data.copy['correction.accessArea']}>
                <Select name="accessArea" bind:value={accessArea}>
                  {#each accessAreas as area (area)}
                    <option value={area}>{localizeAccessArea(area, data.copy)}</option>
                  {/each}
                </Select>
              </Field>
              <Field label={data.copy['correction.restraint']}>
                <Select name="restraintCondition" bind:value={restraintCondition}>
                  {#each restraints as restraint (restraint)}
                    <option value={restraint}>{localizeRestraint(restraint, data.copy)}</option>
                  {/each}
                </Select>
              </Field>
              <Field label={data.copy['correction.permission']}>
                <Select
                  name="permissionRequirement"
                  value={selectedCondition.permissionRequirement}
                >
                  {#each permissions as permission (permission)}
                    <option value={permission}>{localizePermission(permission, data.copy)}</option>
                  {/each}
                </Select>
              </Field>
            </div>
            {#if accessArea === 'other_bounded'}
              <Field label={data.copy['correction.accessAreaNote']}>
                <Input
                  name="accessAreaNote"
                  value={selectedCondition.accessAreaNote ?? ''}
                  required
                />
              </Field>
            {/if}
            {#if restraintCondition === 'other_sourced'}
              <Field label={data.copy['correction.restraintNote']}>
                <Input
                  name="restraintNote"
                  value={selectedCondition.restraintNote ?? ''}
                  required
                />
              </Field>
            {/if}
            <Field label={data.copy['moderation.availabilityStateLabel']}>
              <Select name="availabilityState" bind:value={availabilityState}>
                <option value="not_stated">{data.copy['accessSymbols.notStated']}</option>
                <option value="whenever_open">{data.copy['accessSymbols.wheneverOpen']}</option>
                <option value="limited">{data.copy['accessSymbols.limited']}</option>
              </Select>
            </Field>
            {#if availabilityState === 'limited'}
              <div class="grid grid-cols-2 gap-context max-narrow:grid-cols-1">
                <Field label={data.copy['correction.availabilityStarts']}>
                  <Input
                    name="availabilityStartsAt"
                    type="time"
                    value={selectedCondition.availabilityWindow.startsAt ?? ''}
                  />
                </Field>
                <Field label={data.copy['correction.availabilityEnds']}>
                  <Input
                    name="availabilityEndsAt"
                    type="time"
                    value={selectedCondition.availabilityWindow.endsAt ?? ''}
                  />
                </Field>
              </div>
              <Field label={data.copy['correction.availabilityDays']}>
                <Input
                  name="availabilityDays"
                  value={(selectedCondition.availabilityWindow.days ?? []).join(',')}
                />
              </Field>
            {/if}
          </FormSection>
        {/if}

        <!-- No Evidence fieldset: the server synthesizes the Member report record the database
             requires, so a Member is never asked to fill in the Moderator's worksheet. -->
        <FormSection legend={data.copy['correction.explanation']}>
          <Field label={data.copy['correction.explanation']}>
            <Textarea name="explanation" required></Textarea>
          </Field>
          <Meta class="my-[1em]">{data.copy['correction.dataUseNotice']}</Meta>
        </FormSection>

        <Button intent="primary" type="submit" disabled={submitting || submissionUnavailable}>
          {submitting ? data.copy['correction.sending'] : data.copy['correction.submit']}
        </Button>
      </fieldset>
    </form>
  {/if}
</PageShell>
