<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { untrack } from 'svelte';

  import SuggestionLocationPicker from '$lib/map/SuggestionLocationPicker.svelte';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter } from '$lib/map/types';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let accessArea = $state('outdoors');
  let restraintCondition = $state('leash_required');
  let scheduleOpen = $state(false);
  let mapAdapter = $state<MapAdapter>(
    untrack(() =>
      createMapLibreAdapter({
        style: data.mapStyleUrl ?? emptyMapLibreStyle,
        clusterLabel: (count) =>
          data.copy['directory.clusterCount'].replace('{count}', String(count))
      })
    )
  );

  const enhanceForm: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };
  const errorMessage = $derived(
    form?.error === 'policy_unavailable'
      ? data.copy['suggestion.policyUnavailable']
      : form?.error === 'rate_limited'
        ? data.copy['suggestion.rateLimited']
        : form?.error
          ? data.copy['suggestion.invalid']
          : null
  );
  const submissionUnavailable = $derived(form?.error === 'policy_unavailable');
</script>

<svelte:head>
  <title>{data.copy['suggestion.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="suggestion-shell">
  <div class="title-row">
    <div>
      <p class="eyebrow">{data.copy['suggestion.nav']}</p>
      <h1>{data.copy['suggestion.title']}</h1>
      <p>{data.copy['suggestion.intro']}</p>
    </div>
    <a href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}>
      {data.copy['suggestion.myTitle']}
    </a>
  </div>

  {#if data.unavailable}
    <p class="message error" role="alert">{data.copy['error.unexpectedBody']}</p>
  {:else}
    {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}
    <form method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <fieldset class="availability-boundary" disabled={submissionUnavailable}>
        <input type="hidden" name="purpose" value="dog_access_destination" />
        <input type="hidden" name="submissionProfile" value="simple-v1" />

        <fieldset>
          <legend>{data.copy['suggestion.placeSection']}</legend>
          <label>{data.copy['suggestion.placeName']}<input name="name" required /></label>
          <label>
            {data.copy['suggestion.category']}
            <select name="category" required>
              <option value="cafe">{data.copy['category.cafe']}</option>
              <option value="restaurant">{data.copy['category.restaurant']}</option>
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
          <label
            >{data.copy['suggestion.detailsOptional']}<textarea name="description" rows="3"
            ></textarea></label
          >
        </fieldset>

        <fieldset role="region" aria-label={data.copy['suggestion.locationRegion']}>
          <legend>{data.copy['suggestion.location']}</legend>
          <label
            >{data.copy['suggestion.locationNote']}<input
              id="suggestion-location-note"
              name="locationNote"
              required
            /></label
          >
          <SuggestionLocationPicker
            adapter={mapAdapter}
            copy={data.copy}
            initialLatitude={Number(data.presetLatitude ?? 64.1466)}
            initialLongitude={Number(data.presetLongitude ?? -21.9426)}
          />
        </fieldset>

        <fieldset>
          <legend>{data.copy['suggestion.access']}</legend>
          <div class="grid two">
            <label>
              {data.copy['suggestion.welcomeArea']}
              <select name="accessArea" required bind:value={accessArea}>
                <option value="outdoors">{data.copy['access.outdoor']}</option>
                <option value="indoors">{data.copy['access.indoor']}</option>
                <option value="designated_area">{data.copy['access.designated']}</option>
                <option value="other_bounded">{data.copy['access.otherBounded']}</option>
              </select>
            </label>
            <label>
              {data.copy['suggestion.welcomeRestraint']}
              <select name="restraintCondition" required bind:value={restraintCondition}>
                <option value="leash_required">{data.copy['access.leashRequired']}</option>
                <option value="off_leash_permitted">{data.copy['access.offLeash']}</option>
                <option value="carrier_required">{data.copy['access.carrierRequired']}</option>
                <option value="other_sourced">{data.copy['access.otherSourced']}</option>
              </select>
            </label>
            {#if accessArea === 'other_bounded'}
              <label
                >{data.copy['moderation.areaNoteLabel']}<input
                  name="accessAreaNote"
                  required
                /></label
              >
            {/if}
            {#if restraintCondition === 'other_sourced'}
              <label
                >{data.copy['moderation.restraintNoteLabel']}<input
                  name="restraintNote"
                  required
                /></label
              >
            {/if}
            <label class="wide confirmation">
              <input name="allDogsWelcome" type="checkbox" value="confirmed" required />
              <span>{data.copy['suggestion.allDogsWelcome']}</span>
            </label>
            <label class="wide">
              {data.copy['suggestion.welcomePermission']}
              <select name="permissionRequirement" required>
                <option value="standing_permission">{data.copy['access.standingPermission']}</option
                >
                <option value="ask_on_arrival">{data.copy['access.askOnArrival']}</option>
                <option value="advance_approval">{data.copy['access.advanceApproval']}</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            class="text-toggle"
            aria-expanded={scheduleOpen}
            onclick={() => (scheduleOpen = !scheduleOpen)}
          >
            {data.copy['suggestion.scheduleToggle']}
          </button>
          {#if scheduleOpen}
            <div class="grid three schedule-fields">
              <label
                >{data.copy['suggestion.scheduleDays']}<input
                  name="availabilityDays"
                  placeholder="1,2,3,4,5"
                /></label
              >
              <label
                >{data.copy['suggestion.scheduleStarts']}<input
                  name="availabilityStartsAt"
                  type="time"
                /></label
              >
              <label
                >{data.copy['suggestion.scheduleEnds']}<input
                  name="availabilityEndsAt"
                  type="time"
                /></label
              >
            </div>
          {/if}
        </fieldset>

        <fieldset>
          <legend>{data.copy['suggestion.howKnow']}</legend>
          <div class="grid two">
            <label>
              {data.copy['suggestion.howKnowKind']}
              <select name="evidenceKind" required>
                <option value="direct_observation"
                  >{data.copy['suggestion.evidenceKind.directObservation']}</option
                >
                <option value="official_website"
                  >{data.copy['suggestion.evidenceKind.officialWebsite']}</option
                >
                <option value="venue_representative"
                  >{data.copy['suggestion.evidenceKind.venueRepresentative']}</option
                >
                <option value="member_report"
                  >{data.copy['suggestion.evidenceKind.memberReport']}</option
                >
                <option value="public_record"
                  >{data.copy['suggestion.evidenceKind.publicRecord']}</option
                >
                <option value="other">{data.copy['suggestion.evidenceKind.other']}</option>
              </select>
            </label>
            <label
              >{data.copy['suggestion.howKnowUrl']}<input name="evidenceUrl" type="url" /></label
            >
            <label
              >{data.copy['suggestion.howKnowDate']}<input
                name="evidenceObservedDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                required
              /></label
            >
            <label class="wide"
              >{data.copy['suggestion.howKnowExplanation']}<textarea
                name="evidenceExplanation"
                rows="4"
                required></textarea></label
            >
          </div>
        </fieldset>

        <button type="submit" disabled={submitting || submissionUnavailable}>
          {submitting ? data.copy['suggestion.sending'] : data.copy['suggestion.submit']}
        </button>
      </fieldset>
    </form>
  {/if}
</main>

<style>
  .suggestion-shell {
    width: min(100% - 2rem, 68rem);
    margin: 2rem auto 5rem;
  }
  .availability-boundary {
    display: grid;
    gap: 1rem;
    min-width: 0;
    border: 0;
    padding: 0;
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
  .confirmation {
    grid-template-columns: auto 1fr;
    align-items: start;
  }
  .confirmation input {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.1rem;
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
  .wide {
    grid-column: 1 / -1;
  }
  .text-toggle {
    width: fit-content;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--coral-dark);
    box-shadow: none;
    text-decoration: underline;
  }
  .schedule-fields {
    padding-top: 0.25rem;
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
