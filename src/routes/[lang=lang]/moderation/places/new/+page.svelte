<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick, untrack } from 'svelte';

  import {
    Button,
    Field,
    FormSection,
    Input,
    Notice,
    Select,
    Textarea
  } from '@hundavaent/design-system';
  import ModerationLocationEditor, {
    type ModerationLocationValue
  } from '$lib/moderation/ModerationLocationEditor.svelte';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let errorElement = $state<HTMLElement>();
  let conditions = $state([
    {
      accessArea: 'outdoors',
      accessAreaNote: '',
      restraintCondition: 'leash_required',
      restraintNote: '',
      maximumWeightKg: '',
      maximumDogs: '',
      eligibilityNotes: '',
      availabilityDays: '',
      availabilityStartsAt: '',
      availabilityEndsAt: '',
      availabilityStartsOn: '',
      availabilityEndsOn: '',
      availabilityState: 'not_stated',
      permissionRequirement: 'standing_permission'
    }
  ]);
  let evidenceRecords = $state(
    untrack(() => [
      {
        kind: 'official_website',
        sourceUrl: '',
        sourceCitation: '',
        sourceLabel: '',
        observedAt: data.defaultObservedAt
      }
    ])
  );
  let values = $state<Record<string, string>>(
    untrack(() => ({
      category: 'restaurant',
      wheelchairAccessibility: 'unknown',
      locality: 'Reykjavík',
      municipality: 'reykjavik',
      accessArea: 'outdoors',
      restraintCondition: 'leash_required',
      permissionRequirement: 'standing_permission',
      dogAmenities: '',
      ...((form && 'values' in form ? form.values : {}) ?? {})
    }))
  );
  let locationValue = $state<ModerationLocationValue>(
    untrack(() => ({
      addressLine: values.addressLine ?? '',
      locality: values.locality ?? 'Reykjavík',
      postalCode: values.postalCode ?? '',
      municipality: values.municipality ?? 'reykjavik',
      latitude: Number(values.latitude || 64.1466),
      longitude: Number(values.longitude || -21.9426),
      geometryPrecision: values.geometryPrecision || 'municipality_anchor_pending_geocode',
      geometrySource: values.geometrySource || 'Initial map centre, confirmation required'
    }))
  );
  let errorMessage = $derived(form && 'error' in form ? form.error : null);
  let succeeded = $derived(Boolean(form && 'success' in form && form.success));

  const enhanceCandidate: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  $effect(() => {
    if (errorMessage && errorElement) {
      void tick().then(() => errorElement?.focus());
    }
  });

  function addCondition(): void {
    conditions.push({
      accessArea: 'outdoors',
      accessAreaNote: '',
      restraintCondition: 'leash_required',
      restraintNote: '',
      maximumWeightKg: '',
      maximumDogs: '',
      eligibilityNotes: '',
      availabilityDays: '',
      availabilityStartsAt: '',
      availabilityEndsAt: '',
      availabilityStartsOn: '',
      availabilityEndsOn: '',
      availabilityState: 'not_stated',
      permissionRequirement: 'standing_permission'
    });
  }

  function removeCondition(index: number): void {
    if (conditions.length > 1) conditions.splice(index, 1);
  }

  function addEvidence(): void {
    evidenceRecords.push({
      kind: 'official_website',
      sourceUrl: '',
      sourceCitation: '',
      sourceLabel: '',
      observedAt: data.defaultObservedAt
    });
  }

  function removeEvidence(index: number): void {
    if (evidenceRecords.length > 1) evidenceRecords.splice(index, 1);
  }
</script>

<svelte:head>
  <title>{data.copy['moderation.candidateTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<main class="candidate-shell" data-ui-mode="operations">
  <header>
    <p class="eyebrow">{data.copy['nav.moderation']}</p>
    <h1>{data.copy['moderation.candidateTitle']}</h1>
    <p>{data.copy['moderation.candidateIntro']}</p>
  </header>

  {#if errorMessage}
    <p
      class="border rounded-panel p-panel border-danger bg-danger-soft text-danger font-extrabold focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-focus-ring focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
      role="alert"
      tabindex="-1"
      bind:this={errorElement}
    >
      {errorMessage}
    </p>
  {/if}

  {#if succeeded}
    <Notice as="section" tone="success" role="status" class="font-extrabold">
      <strong>{data.copy['moderation.candidateCreated']}</strong>
      <p class="mb-0">{data.copy['moderation.candidateCreatedDetails']}</p>
      {#if form && 'placeId' in form && form.placeId}
        <p class="mb-0">
          {data.copy['moderation.candidateId']}:
          <output aria-label={data.copy['moderation.candidateId']}>{form.placeId}</output>
        </p>
        <p class="mb-0">
          <a
            class="text-fjord font-extrabold focus-visible:rounded-control focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-focus-ring focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
            href={resolve('/[lang=lang]/moderation/places/[id]', {
              lang: data.lang,
              id: form.placeId
            })}
          >
            {data.copy['moderation.reviewTitle']}
          </a>
        </p>
      {/if}
    </Notice>
  {/if}

  <form method="POST" use:enhance={enhanceCandidate} aria-busy={submitting}>
    <FormSection legend={data.copy['moderation.identityHeading']}>
      <div class="field-grid">
        <Field label={data.copy['moderation.operatorLabel']}>
          <Input name="operatorName" required bind:value={values.operatorName} />
        </Field>
        <Field label={data.copy['place.category']}>
          <Select name="category" required bind:value={values.category}>
            <option value="restaurant">{data.copy['category.restaurant']}</option>
            <option value="cafe">{data.copy['category.cafe']}</option>
            <option value="bar">{data.copy['category.bar']}</option>
            <option value="shop">{data.copy['category.shop']}</option>
            <option value="shopping_centre">{data.copy['category.shoppingCentre']}</option>
            <option value="accommodation">{data.copy['category.accommodation']}</option>
            <option value="park">{data.copy['category.park']}</option>
            <option value="recreation">{data.copy['category.recreation']}</option>
            <option value="culture">{data.copy['category.culture']}</option>
            <option value="service">{data.copy['category.service']}</option>
            <option value="other">{data.copy['category.other']}</option>
          </Select>
        </Field>
        <Field
          label={data.copy['moderation.wheelchairAccessibilityLabel']}
          hint={data.copy['moderation.wheelchairAccessibilityHelp']}
        >
          <Select
            name="wheelchairAccessibility"
            required
            bind:value={values.wheelchairAccessibility}
          >
            <option value="accessible">{data.copy['wheelchairAccessibility.accessible']}</option>
            <option value="partially_accessible"
              >{data.copy['wheelchairAccessibility.partiallyAccessible']}</option
            >
            <option value="not_accessible"
              >{data.copy['wheelchairAccessibility.notAccessible']}</option
            >
            <option value="unknown">{data.copy['wheelchairAccessibility.unknown']}</option>
          </Select>
        </Field>
        <Field label={data.copy['moderation.websiteLabel']}>
          <Input name="websiteUrl" type="url" bind:value={values.websiteUrl} />
        </Field>
        <Field label={data.copy['moderation.phoneLabel']}>
          <Input name="phone" type="tel" bind:value={values.phone} />
        </Field>
        <Field
          label={data.copy['place.amenities']}
          hint={data.copy['moderation.amenitiesHelp']}
          class="wide"
        >
          <Input name="dogAmenities" bind:value={values.dogAmenities} />
        </Field>
        <Field label={data.copy['moderation.nameIsLabel']}>
          <Input name="nameIs" required lang="is" bind:value={values.nameIs} />
        </Field>
        <Field label={data.copy['moderation.nameEnLabel']}>
          <Input name="nameEn" required lang="en" bind:value={values.nameEn} />
        </Field>
        <Field label={data.copy['moderation.descriptionIsLabel']} class="wide">
          <Textarea name="descriptionIs" required lang="is" bind:value={values.descriptionIs}
          ></Textarea>
        </Field>
        <Field label={data.copy['moderation.descriptionEnLabel']} class="wide">
          <Textarea name="descriptionEn" required lang="en" bind:value={values.descriptionEn}
          ></Textarea>
        </Field>
      </div>
    </FormSection>

    <FormSection legend={data.copy['moderation.locationHeading']}>
      <ModerationLocationEditor
        copy={data.copy}
        bind:value={locationValue}
        markerName={values.nameIs ||
          values.nameEn ||
          values.operatorName ||
          data.copy['moderation.locationHeading']}
        mapStyleUrl={data.mapStyleUrl}
      />
    </FormSection>

    <FormSection legend={data.copy['moderation.evidenceHeading']}>
      <div class="evidence-list">
        {#each evidenceRecords as evidence, index (index)}
          <section class="condition-card" aria-labelledby={`evidence-${index}`}>
            <div class="condition-heading">
              <h2 id={`evidence-${index}`}>
                {data.copy['moderation.evidenceHeading']}
                {index + 1}
              </h2>
              {#if evidenceRecords.length > 1}
                <Button type="button" onclick={() => removeEvidence(index)}>
                  {data.copy['moderation.removeEvidence']}
                </Button>
              {/if}
            </div>
            <div class="field-grid">
              <Field label={data.copy['moderation.evidenceKindLabel']}>
                <Select name="evidenceKind" required bind:value={evidence.kind}>
                  <option value="official_website">{data.copy['evidence.officialWebsite']}</option>
                  <option value="venue_representative"
                    >{data.copy['evidence.venueRepresentative']}</option
                  >
                  <option value="member_report">{data.copy['evidence.memberReport']}</option>
                  <option value="direct_observation"
                    >{data.copy['evidence.directObservation']}</option
                  >
                  <option value="public_record">{data.copy['evidence.publicRecord']}</option>
                  <option value="other">{data.copy['evidence.other']}</option>
                </Select>
              </Field>
              <Field label={data.copy['moderation.evidenceUrlLabel']} class="wide">
                <Input name="evidenceUrl" type="url" bind:value={evidence.sourceUrl} />
              </Field>
              <Field label={data.copy['moderation.evidenceCitationLabel']} class="wide">
                <Input name="evidenceCitation" bind:value={evidence.sourceCitation} />
              </Field>
              <Field label={data.copy['moderation.evidenceSourceLabel']}>
                <Input name="evidenceSourceLabel" required bind:value={evidence.sourceLabel} />
              </Field>
              <Field label={data.copy['moderation.evidenceObservedAtLabel']}>
                <Input
                  name="evidenceObservedAt"
                  type="datetime-local"
                  required
                  bind:value={evidence.observedAt}
                />
              </Field>
            </div>
          </section>
        {/each}
      </div>
      <Button type="button" class="mt-4" onclick={addEvidence}>
        {data.copy['moderation.addAnotherEvidence']}
      </Button>
    </FormSection>

    <FormSection legend={data.copy['moderation.accessHeading']}>
      <div class="condition-list">
        {#each conditions as condition, index (index)}
          <section class="condition-card" aria-labelledby={`condition-${index}`}>
            <div class="condition-heading">
              <h2 id={`condition-${index}`}>
                {data.copy['place.conditionLabel'].replace('{number}', String(index + 1))}
              </h2>
              {#if conditions.length > 1}
                <Button type="button" onclick={() => removeCondition(index)}>
                  {data.copy['moderation.removeCondition']}
                </Button>
              {/if}
            </div>
            <div class="field-grid">
              <Field label={data.copy['place.accessArea']}>
                <Select name="accessArea" required bind:value={condition.accessArea}>
                  <option value="indoors">{data.copy['access.indoor']}</option>
                  <option value="outdoors">{data.copy['access.outdoor']}</option>
                  <option value="designated_area">{data.copy['access.designated']}</option>
                  <option value="other_bounded">{data.copy['access.otherBounded']}</option>
                </Select>
              </Field>
              <Field label={data.copy['moderation.areaNoteLabel']}>
                <Input name="accessAreaNote" bind:value={condition.accessAreaNote} />
              </Field>
              <Field label={data.copy['place.restraint']}>
                <Select
                  name="restraintCondition"
                  required
                  bind:value={condition.restraintCondition}
                >
                  <option value="leash_required">{data.copy['access.leashRequired']}</option>
                  <option value="off_leash_permitted">{data.copy['access.offLeash']}</option>
                  <option value="carrier_required">{data.copy['access.carrierRequired']}</option>
                  <option value="other_sourced">{data.copy['access.otherSourced']}</option>
                </Select>
              </Field>
              <Field label={data.copy['moderation.restraintNoteLabel']}>
                <Input name="restraintNote" bind:value={condition.restraintNote} />
              </Field>
              <Field label={data.copy['moderation.maximumWeightLabel']}>
                <Input
                  name="maximumWeightKg"
                  type="number"
                  min="0.1"
                  step="0.1"
                  bind:value={condition.maximumWeightKg}
                />
              </Field>
              <Field label={data.copy['moderation.maximumDogsLabel']}>
                <Input
                  name="maximumDogs"
                  type="number"
                  min="1"
                  step="1"
                  bind:value={condition.maximumDogs}
                />
              </Field>
              <Field label={data.copy['moderation.eligibilityNoteLabel']} class="wide">
                <Input name="eligibilityNotes" bind:value={condition.eligibilityNotes} />
              </Field>
              <Field label={data.copy['moderation.availabilityStateLabel']}>
                <Select name="availabilityState" required bind:value={condition.availabilityState}>
                  <option value="not_stated">{data.copy['accessSymbols.notStated']}</option>
                  <option value="whenever_open">{data.copy['accessSymbols.wheneverOpen']}</option>
                  <option value="limited">{data.copy['accessSymbols.limited']}</option>
                </Select>
              </Field>
              <Field label={data.copy['moderation.weekdaysLabel']}>
                <Input
                  name="availabilityDays"
                  placeholder="1,2,3"
                  pattern="[1-7](,[1-7])*"
                  bind:value={condition.availabilityDays}
                />
              </Field>
              <Field label={data.copy['moderation.startsAtLabel']}>
                <Input
                  name="availabilityStartsAt"
                  type="time"
                  bind:value={condition.availabilityStartsAt}
                />
              </Field>
              <Field label={data.copy['moderation.endsAtLabel']}>
                <Input
                  name="availabilityEndsAt"
                  type="time"
                  bind:value={condition.availabilityEndsAt}
                />
              </Field>
              <Field label={data.copy['moderation.startsOnLabel']}>
                <Input
                  name="availabilityStartsOn"
                  type="date"
                  bind:value={condition.availabilityStartsOn}
                />
              </Field>
              <Field label={data.copy['moderation.endsOnLabel']}>
                <Input
                  name="availabilityEndsOn"
                  type="date"
                  bind:value={condition.availabilityEndsOn}
                />
              </Field>
              <Field label={data.copy['place.permission']}>
                <Select
                  name="permissionRequirement"
                  required
                  bind:value={condition.permissionRequirement}
                >
                  <option value="standing_permission"
                    >{data.copy['access.standingPermission']}</option
                  >
                  <option value="ask_on_arrival">{data.copy['access.askOnArrival']}</option>
                  <option value="advance_approval">{data.copy['access.advanceApproval']}</option>
                </Select>
              </Field>
            </div>
          </section>
        {/each}
      </div>
      <Button type="button" class="mt-4" onclick={addCondition}>
        {data.copy['moderation.addAnotherCondition']}
      </Button>
    </FormSection>

    <Button type="submit" intent="primary" class="justify-self-start" disabled={submitting}>
      {submitting ? data.copy['common.loading'] : data.copy['moderation.createCandidate']}
    </Button>
  </form>
</main>

<style>
  .candidate-shell {
    width: min(100% - 2rem, var(--hv-content-wide));
    margin: 0 auto;
    padding: var(--hv-space-section) 0 5rem;
  }

  header {
    max-width: 48rem;
    margin-bottom: 2rem;
  }

  .eyebrow {
    color: var(--hv-color-fjord);
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.25rem 0;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2.2rem, 6vw, 3.8rem);
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.035em;
  }

  form {
    display: grid;
    gap: 1.25rem;
  }

  /* Field renders its own <label>, crossing this component's scoping boundary; :global() reaches
     it purely on the literal element, ancestor-scoped to .field-grid (not the whole form) so this
     never leaks into ModerationLocationEditor's own unrelated <label> elements, which sit inside
     the same <form> but outside every .field-grid this page renders. Weight is the one thing not
     approved to simplify away in this migration - Field intentionally carries no opinion on it,
     the same reach-through sign-in/+page.svelte's `form :global(label)` documents. */
  .field-grid :global(label) {
    font-weight: 750;
  }

  form :global(fieldset > legend) {
    padding: 0 0.5rem;
    color: var(--hv-color-fjord);
    font-size: 1.1rem;
    font-weight: 800;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .condition-list,
  .evidence-list {
    display: grid;
    gap: 1rem;
  }

  .condition-card {
    padding: 1rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow);
  }

  .condition-heading {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .condition-heading h2 {
    margin: 0;
    font-size: 1rem;
  }

  /* Field forwards this class onto the div it renders itself, so the literal string "wide" never
     appears on an element written directly in this template - Svelte's scoped-CSS analysis can't
     see that connection and would otherwise prune `.wide` as unused. Ancestor-scoped to
     .field-grid (real, local, hashed) reaching through to :global(.wide) (Field's div, unhashed
     from here) fixes that without a bare :global(.wide) that would leak into any unrelated "wide"
     class elsewhere in the app. */
  .field-grid :global(.wide) {
    grid-column: 1 / -1;
  }

  @media (max-width: 42rem) {
    .candidate-shell {
      padding-top: 2rem;
    }

    .field-grid {
      grid-template-columns: 1fr;
    }

    .field-grid :global(.wide) {
      grid-column: auto;
    }

    /* Buttons render through the package component, so the full-width mobile treatment the page
       always had reaches them through :global(). */
    form :global(button) {
      width: 100%;
    }
  }
</style>
