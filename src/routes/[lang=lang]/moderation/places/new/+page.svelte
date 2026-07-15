<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick, untrack } from 'svelte';

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
      locality: 'Reykjavík',
      municipality: 'reykjavik',
      accessArea: 'outdoors',
      restraintCondition: 'leash_required',
      permissionRequirement: 'standing_permission',
      dogAmenities: '',
      ...((form && 'values' in form ? form.values : {}) ?? {})
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
    <p class="message error" role="alert" tabindex="-1" bind:this={errorElement}>
      {errorMessage}
    </p>
  {/if}

  {#if succeeded}
    <section class="message success" role="status">
      <strong>{data.copy['moderation.candidateCreated']}</strong>
      <p>{data.copy['moderation.candidateCreatedDetails']}</p>
      {#if form && 'placeId' in form && form.placeId}
        <p>
          {data.copy['moderation.candidateId']}:
          <output aria-label={data.copy['moderation.candidateId']}>{form.placeId}</output>
        </p>
        <p>
          <a
            href={resolve('/[lang=lang]/moderation/places/[id]', {
              lang: data.lang,
              id: form.placeId
            })}
          >
            {data.copy['moderation.reviewTitle']}
          </a>
        </p>
      {/if}
    </section>
  {/if}

  <form method="POST" use:enhance={enhanceCandidate} aria-busy={submitting}>
    <fieldset>
      <legend>{data.copy['moderation.identityHeading']}</legend>
      <div class="field-grid">
        <label>
          {data.copy['moderation.operatorLabel']}
          <input name="operatorName" required bind:value={values.operatorName} />
        </label>
        <label>
          {data.copy['place.category']}
          <select name="category" required bind:value={values.category}>
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
          </select>
        </label>
        <label>
          {data.copy['moderation.websiteLabel']}
          <input name="websiteUrl" type="url" bind:value={values.websiteUrl} />
        </label>
        <label>
          {data.copy['moderation.phoneLabel']}
          <input name="phone" type="tel" bind:value={values.phone} />
        </label>
        <label class="wide">
          {data.copy['place.amenities']}
          <input
            name="dogAmenities"
            bind:value={values.dogAmenities}
            aria-describedby="amenities-help"
          />
          <small id="amenities-help">{data.copy['moderation.amenitiesHelp']}</small>
        </label>
        <label>
          {data.copy['moderation.nameIsLabel']}
          <input name="nameIs" required lang="is" bind:value={values.nameIs} />
        </label>
        <label>
          {data.copy['moderation.nameEnLabel']}
          <input name="nameEn" required lang="en" bind:value={values.nameEn} />
        </label>
        <label class="wide">
          {data.copy['moderation.descriptionIsLabel']}
          <textarea name="descriptionIs" required lang="is" bind:value={values.descriptionIs}
          ></textarea>
        </label>
        <label class="wide">
          {data.copy['moderation.descriptionEnLabel']}
          <textarea name="descriptionEn" required lang="en" bind:value={values.descriptionEn}
          ></textarea>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>{data.copy['moderation.locationHeading']}</legend>
      <div class="field-grid">
        <label class="wide">
          {data.copy['moderation.addressLabel']}
          <input name="addressLine" required bind:value={values.addressLine} />
        </label>
        <label>
          {data.copy['moderation.localityLabel']}
          <input name="locality" required bind:value={values.locality} />
        </label>
        <label>
          {data.copy['moderation.postalCodeLabel']}
          <input
            name="postalCode"
            required
            inputmode="numeric"
            pattern="[0-9][0-9][0-9]"
            bind:value={values.postalCode}
          />
        </label>
        <label>
          {data.copy['moderation.municipalityLabel']}
          <select
            name="municipality"
            required
            bind:value={values.municipality}
            aria-label={data.copy['moderation.municipalityLabel']}
          >
            <option value="reykjavik">Reykjavík</option>
            <option value="kopavogur">Kópavogur</option>
            <option value="seltjarnarnes">Seltjarnarnes</option>
            <option value="gardabaer">Garðabær</option>
            <option value="hafnarfjordur">Hafnarfjörður</option>
            <option value="mosfellsbaer">Mosfellsbær</option>
            <option value="kjosarhreppur">Kjósarhreppur</option>
          </select>
        </label>
        <label>
          {data.copy['moderation.latitudeLabel']}
          <input name="latitude" required inputmode="decimal" bind:value={values.latitude} />
        </label>
        <label>
          {data.copy['moderation.longitudeLabel']}
          <input name="longitude" required inputmode="decimal" bind:value={values.longitude} />
        </label>
        <label>
          {data.copy['moderation.geometryPrecisionLabel']}
          <select
            name="geometryPrecision"
            required
            bind:value={values.geometryPrecision}
            aria-label={data.copy['moderation.geometryPrecisionLabel']}
          >
            <option value="">{data.copy['moderation.geometryPrecisionChoose']}</option>
            <option value="moderator_confirmed_point"
              >{data.copy['moderation.geometryPrecision.moderatorConfirmed']}</option
            >
            <option value="official_address_point"
              >{data.copy['moderation.geometryPrecision.officialAddress']}</option
            >
            <option value="official_representative_centroid"
              >{data.copy['moderation.geometryPrecision.officialCentroid']}</option
            >
            <option value="municipality_anchor_pending_geocode"
              >{data.copy['moderation.geometryPrecision.pending']}</option
            >
          </select>
        </label>
        <label class="wide">
          {data.copy['moderation.geometrySourceLabel']}
          <input
            name="geometrySource"
            required
            bind:value={values.geometrySource}
            aria-label={data.copy['moderation.geometrySourceLabel']}
            aria-describedby="geometry-source-help"
          />
          <small id="geometry-source-help">{data.copy['moderation.geometrySourceHelp']}</small>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>{data.copy['moderation.evidenceHeading']}</legend>
      <div class="evidence-list">
        {#each evidenceRecords as evidence, index (index)}
          <section class="condition-card" aria-labelledby={`evidence-${index}`}>
            <div class="condition-heading">
              <h2 id={`evidence-${index}`}>
                {data.copy['moderation.evidenceHeading']}
                {index + 1}
              </h2>
              {#if evidenceRecords.length > 1}
                <button class="secondary" type="button" onclick={() => removeEvidence(index)}>
                  {data.copy['moderation.removeEvidence']}
                </button>
              {/if}
            </div>
            <div class="field-grid">
              <label>
                {data.copy['moderation.evidenceKindLabel']}
                <select name="evidenceKind" required bind:value={evidence.kind}>
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
                </select>
              </label>
              <label class="wide">
                {data.copy['moderation.evidenceUrlLabel']}
                <input name="evidenceUrl" type="url" bind:value={evidence.sourceUrl} />
              </label>
              <label class="wide">
                {data.copy['moderation.evidenceCitationLabel']}
                <input name="evidenceCitation" bind:value={evidence.sourceCitation} />
              </label>
              <label>
                {data.copy['moderation.evidenceSourceLabel']}
                <input name="evidenceSourceLabel" required bind:value={evidence.sourceLabel} />
              </label>
              <label>
                {data.copy['moderation.evidenceObservedAtLabel']}
                <input
                  name="evidenceObservedAt"
                  type="datetime-local"
                  required
                  bind:value={evidence.observedAt}
                />
              </label>
            </div>
          </section>
        {/each}
      </div>
      <button class="secondary add-condition" type="button" onclick={addEvidence}>
        {data.copy['moderation.addAnotherEvidence']}
      </button>
    </fieldset>

    <fieldset>
      <legend>{data.copy['moderation.accessHeading']}</legend>
      <div class="condition-list">
        {#each conditions as condition, index (index)}
          <section class="condition-card" aria-labelledby={`condition-${index}`}>
            <div class="condition-heading">
              <h2 id={`condition-${index}`}>
                {data.copy['place.conditionLabel'].replace('{number}', String(index + 1))}
              </h2>
              {#if conditions.length > 1}
                <button class="secondary" type="button" onclick={() => removeCondition(index)}>
                  {data.copy['moderation.removeCondition']}
                </button>
              {/if}
            </div>
            <div class="field-grid">
              <label>
                {data.copy['place.accessArea']}
                <select name="accessArea" required bind:value={condition.accessArea}>
                  <option value="indoors">{data.copy['access.indoor']}</option>
                  <option value="outdoors">{data.copy['access.outdoor']}</option>
                  <option value="designated_area">{data.copy['access.designated']}</option>
                  <option value="other_bounded">{data.copy['access.otherBounded']}</option>
                </select>
              </label>
              <label>
                {data.copy['moderation.areaNoteLabel']}
                <input name="accessAreaNote" bind:value={condition.accessAreaNote} />
              </label>
              <label>
                {data.copy['place.restraint']}
                <select
                  name="restraintCondition"
                  required
                  bind:value={condition.restraintCondition}
                >
                  <option value="leash_required">{data.copy['access.leashRequired']}</option>
                  <option value="off_leash_permitted">{data.copy['access.offLeash']}</option>
                  <option value="carrier_required">{data.copy['access.carrierRequired']}</option>
                  <option value="other_sourced">{data.copy['access.otherSourced']}</option>
                </select>
              </label>
              <label>
                {data.copy['moderation.restraintNoteLabel']}
                <input name="restraintNote" bind:value={condition.restraintNote} />
              </label>
              <label>
                {data.copy['moderation.maximumWeightLabel']}
                <input
                  name="maximumWeightKg"
                  type="number"
                  min="0.1"
                  step="0.1"
                  bind:value={condition.maximumWeightKg}
                />
              </label>
              <label>
                {data.copy['moderation.maximumDogsLabel']}
                <input
                  name="maximumDogs"
                  type="number"
                  min="1"
                  step="1"
                  bind:value={condition.maximumDogs}
                />
              </label>
              <label class="wide">
                {data.copy['moderation.eligibilityNoteLabel']}
                <input name="eligibilityNotes" bind:value={condition.eligibilityNotes} />
              </label>
              <label>
                {data.copy['moderation.weekdaysLabel']}
                <input
                  name="availabilityDays"
                  placeholder="1,2,3"
                  pattern="[1-7](,[1-7])*"
                  bind:value={condition.availabilityDays}
                />
              </label>
              <label>
                {data.copy['moderation.startsAtLabel']}
                <input
                  name="availabilityStartsAt"
                  type="time"
                  bind:value={condition.availabilityStartsAt}
                />
              </label>
              <label>
                {data.copy['moderation.endsAtLabel']}
                <input
                  name="availabilityEndsAt"
                  type="time"
                  bind:value={condition.availabilityEndsAt}
                />
              </label>
              <label>
                {data.copy['moderation.startsOnLabel']}
                <input
                  name="availabilityStartsOn"
                  type="date"
                  bind:value={condition.availabilityStartsOn}
                />
              </label>
              <label>
                {data.copy['moderation.endsOnLabel']}
                <input
                  name="availabilityEndsOn"
                  type="date"
                  bind:value={condition.availabilityEndsOn}
                />
              </label>
              <label>
                {data.copy['place.permission']}
                <select
                  name="permissionRequirement"
                  required
                  bind:value={condition.permissionRequirement}
                >
                  <option value="standing_permission"
                    >{data.copy['access.standingPermission']}</option
                  >
                  <option value="ask_on_arrival">{data.copy['access.askOnArrival']}</option>
                  <option value="advance_approval">{data.copy['access.advanceApproval']}</option>
                </select>
              </label>
            </div>
          </section>
        {/each}
      </div>
      <button class="secondary add-condition" type="button" onclick={addCondition}>
        {data.copy['moderation.addAnotherCondition']}
      </button>
    </fieldset>

    <button type="submit" disabled={submitting}>
      {submitting ? data.copy['common.loading'] : data.copy['moderation.createCandidate']}
    </button>
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

  fieldset {
    margin: 0;
    padding: clamp(1rem, 3vw, 2rem);
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
  }

  legend {
    padding: 0 0.5rem;
    color: var(--hv-color-fjord);
    font-size: 1.1rem;
    font-weight: 900;
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

  .secondary {
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
  }

  .add-condition {
    margin-top: 1rem;
  }

  label {
    display: grid;
    gap: 0.4rem;
    font-weight: 750;
  }

  .wide {
    grid-column: 1 / -1;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-height: 3rem;
    box-sizing: border-box;
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--hv-border-strong);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: inherit;
    font: inherit;
  }

  textarea {
    min-height: 6rem;
    resize: vertical;
  }

  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  button:focus-visible,
  .message:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  button {
    justify-self: start;
    min-height: 3.2rem;
    padding: 0.7rem 1.5rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    font: inherit;
    font-weight: 850;
    box-shadow: none;
  }

  .message {
    padding: 1rem 1.2rem;
    border: 1px solid;
    border-radius: var(--hv-radius-panel);
  }

  .message p {
    margin-bottom: 0;
  }

  .error {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }

  .success {
    border-color: var(--hv-color-success);
    background: var(--hv-color-success-soft);
    color: var(--hv-color-success);
  }

  a {
    color: var(--hv-color-fjord);
    font-weight: 850;
  }

  a:focus-visible {
    border-radius: var(--hv-radius-control);
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  @media (max-width: 42rem) {
    .candidate-shell {
      padding-top: 2rem;
    }

    .field-grid {
      grid-template-columns: 1fr;
    }

    .wide {
      grid-column: auto;
    }

    button {
      width: 100%;
    }
  }
</style>
