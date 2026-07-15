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
  let availabilityState = $state<'whenever_open' | 'limited' | 'not_stated'>('not_stated');
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

<main class="hv-page-shell" data-ui-mode="place" data-width="wide">
  <header class="hv-page-header">
    <div>
      <p class="hv-eyebrow">{data.copy['suggestion.nav']}</p>
      <h1 class="hv-page-title">{data.copy['suggestion.title']}</h1>
      <p class="hv-meta">{data.copy['suggestion.intro']}</p>
    </div>
    <div class="hv-page-actions">
      <a class="hv-control" href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}>
        {data.copy['suggestion.myTitle']}
      </a>
    </div>
  </header>

  {#if data.unavailable}
    <p class="hv-notice" data-tone="error" role="alert">{data.copy['error.unexpectedBody']}</p>
  {:else}
    {#if errorMessage}<p class="hv-notice" data-tone="error" role="alert">{errorMessage}</p>{/if}
    <form class="hv-stack" method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <fieldset class="availability-boundary hv-stack" disabled={submissionUnavailable}>
        <input type="hidden" name="purpose" value="dog_access_destination" />
        <input type="hidden" name="submissionProfile" value="simple-v1" />

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['suggestion.placeSection']}</legend>
          <label class="hv-stack"
            >{data.copy['suggestion.placeName']}<input
              class="hv-field"
              name="name"
              required
            /></label
          >
          <label class="hv-stack">
            {data.copy['suggestion.category']}
            <select class="hv-field" name="category" required>
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
          <label class="hv-stack"
            >{data.copy['suggestion.detailsOptional']}<textarea
              class="hv-field"
              name="description"
              rows="3"></textarea></label
          >
        </fieldset>

        <fieldset
          class="hv-form-section hv-panel"
          role="region"
          aria-label={data.copy['suggestion.locationRegion']}
        >
          <legend>{data.copy['suggestion.location']}</legend>
          <label class="hv-stack"
            >{data.copy['suggestion.locationNote']}<input
              class="hv-field"
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

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['suggestion.access']}</legend>
          <div class="hv-grid" data-columns="2">
            <label class="hv-stack">
              {data.copy['suggestion.welcomeArea']}
              <select class="hv-field" name="accessArea" required bind:value={accessArea}>
                <option value="outdoors">{data.copy['access.outdoor']}</option>
                <option value="indoors">{data.copy['access.indoor']}</option>
                <option value="designated_area">{data.copy['access.designated']}</option>
                <option value="other_bounded">{data.copy['access.otherBounded']}</option>
              </select>
            </label>
            <label class="hv-stack">
              {data.copy['suggestion.welcomeRestraint']}
              <select
                class="hv-field"
                name="restraintCondition"
                required
                bind:value={restraintCondition}
              >
                <option value="leash_required">{data.copy['access.leashRequired']}</option>
                <option value="off_leash_permitted">{data.copy['access.offLeash']}</option>
                <option value="carrier_required">{data.copy['access.carrierRequired']}</option>
                <option value="other_sourced">{data.copy['access.otherSourced']}</option>
              </select>
            </label>
            {#if accessArea === 'other_bounded'}
              <label class="hv-stack"
                >{data.copy['moderation.areaNoteLabel']}<input
                  class="hv-field"
                  name="accessAreaNote"
                  required
                /></label
              >
            {/if}
            {#if restraintCondition === 'other_sourced'}
              <label class="hv-stack"
                >{data.copy['moderation.restraintNoteLabel']}<input
                  class="hv-field"
                  name="restraintNote"
                  required
                /></label
              >
            {/if}
            <label class="wide confirmation">
              <input name="allDogsWelcome" type="checkbox" value="confirmed" required />
              <span>{data.copy['suggestion.allDogsWelcome']}</span>
            </label>
            <label class="wide hv-stack">
              {data.copy['suggestion.welcomePermission']}
              <select class="hv-field" name="permissionRequirement" required>
                <option value="standing_permission">{data.copy['access.standingPermission']}</option
                >
                <option value="ask_on_arrival">{data.copy['access.askOnArrival']}</option>
                <option value="advance_approval">{data.copy['access.advanceApproval']}</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            class="hv-control text-toggle"
            aria-expanded={scheduleOpen}
            onclick={() => {
              scheduleOpen = !scheduleOpen;
              if (scheduleOpen && availabilityState === 'not_stated') {
                availabilityState = 'limited';
              }
            }}
          >
            {data.copy['suggestion.scheduleToggle']}
          </button>
          {#if scheduleOpen}
            <label class="hv-stack">
              {data.copy['moderation.availabilityStateLabel']}
              <select class="hv-field" name="availabilityState" bind:value={availabilityState}>
                <option value="not_stated">{data.copy['accessSymbols.notStated']}</option>
                <option value="whenever_open">{data.copy['accessSymbols.wheneverOpen']}</option>
                <option value="limited">{data.copy['accessSymbols.limited']}</option>
              </select>
            </label>
            {#if availabilityState === 'limited'}
              <div class="hv-grid schedule-fields" data-columns="3">
                <label class="hv-stack"
                  >{data.copy['suggestion.scheduleDays']}<input
                    class="hv-field"
                    name="availabilityDays"
                    placeholder="1,2,3,4,5"
                  /></label
                >
                <label class="hv-stack"
                  >{data.copy['suggestion.scheduleStarts']}<input
                    class="hv-field"
                    name="availabilityStartsAt"
                    type="time"
                  /></label
                >
                <label class="hv-stack"
                  >{data.copy['suggestion.scheduleEnds']}<input
                    class="hv-field"
                    name="availabilityEndsAt"
                    type="time"
                  /></label
                >
              </div>
            {/if}
          {/if}
        </fieldset>

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['suggestion.howKnow']}</legend>
          <div class="hv-grid" data-columns="2">
            <label class="hv-stack">
              {data.copy['suggestion.howKnowKind']}
              <select class="hv-field" name="evidenceKind" required>
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
            <label class="hv-stack"
              >{data.copy['suggestion.howKnowUrl']}<input
                class="hv-field"
                name="evidenceUrl"
                type="url"
              /></label
            >
            <label class="hv-stack"
              >{data.copy['suggestion.howKnowDate']}<input
                class="hv-field"
                name="evidenceObservedDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                required
              /></label
            >
            <label class="wide hv-stack"
              >{data.copy['suggestion.howKnowExplanation']}<textarea
                class="hv-field"
                name="evidenceExplanation"
                rows="4"
                required></textarea></label
            >
          </div>
        </fieldset>

        <button
          class="hv-control"
          data-intent="primary"
          type="submit"
          disabled={submitting || submissionUnavailable}
        >
          {submitting ? data.copy['suggestion.sending'] : data.copy['suggestion.submit']}
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
  .confirmation {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.5rem;
  }
  .confirmation input {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.1rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .text-toggle {
    width: fit-content;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--hv-color-fjord);
    box-shadow: none;
    text-decoration: underline;
  }
  .schedule-fields {
    padding-top: 0.25rem;
  }
</style>
