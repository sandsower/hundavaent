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
  // The map has to open somewhere before anyone has answered, and the capital region is where.
  // This is a camera, not a pin: it is never submitted and never becomes a Location fact.
  const fallbackCamera = { latitude: 64.1466, longitude: -21.9426, zoom: 15 };
  // The pin question carries no standing hint: an unanswered question that has not been sent yet is
  // not an error, and a permanent red-adjacent line under the map read as one. The message exists
  // only after a blocked send, as the alert, so the description is wired to it only while it is
  // rendered - an aria-describedby pointing at nothing describes nothing.
  const pinRequiredMessageId = 'suggestion-location-required';
  // A pin the map entry point handed over in the query string is a real answer - the member chose
  // that camera or that place before following the link. Anything else has to be placed here.
  let pinLatitude = $state<number | null>(untrack(() => presetCoordinate(data.presetLatitude)));
  let pinLongitude = $state<number | null>(untrack(() => presetCoordinate(data.presetLongitude)));
  let pinAttempted = $state(false);
  let locationRegion = $state<HTMLFieldSetElement>();
  let mapAdapter = $state<MapAdapter>(
    untrack(() =>
      createMapLibreAdapter({
        style: data.mapStyleUrl ?? emptyMapLibreStyle,
        clusterLabel: (count) =>
          data.copy['directory.clusterCount'].replace('{count}', String(count))
      })
    )
  );

  // The Member vocabulary for where dogs are welcome. `other_bounded` is a Moderator value: it only
  // means anything alongside the note that states the boundary, and this form asks for no notes.
  const welcomeAreas = [
    { value: 'indoors', key: 'access.indoor' },
    { value: 'outdoors', key: 'access.outdoor' },
    { value: 'designated_area', key: 'access.designated' }
  ] as const;

  const pinAnswered = $derived(pinLatitude !== null && pinLongitude !== null);
  const pinMissing = $derived(pinAttempted && !pinAnswered);

  // The map hands the pin over as a query string, so it arrives as text.
  function presetCoordinate(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // The pin is the one answer with no native required control behind it, so the block lives here.
  // The server refuses the same submission on its own (`incomplete`), which is what a member with
  // no JavaScript meets; this only spares a member with JavaScript the round trip.
  const enhanceForm: SubmitFunction = ({ cancel }) => {
    if (!pinAnswered) {
      pinAttempted = true;
      cancel();
      locationRegion?.focus();
      return;
    }
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };
  const signInRequired = $derived(form?.error === 'authentication_required');
  const errorMessage = $derived(
    form?.error === 'policy_unavailable'
      ? data.copy['suggestion.policyUnavailable']
      : form?.error === 'rate_limited'
        ? data.copy['suggestion.rateLimited']
        : form?.error && form.error !== 'authentication_required'
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
    <div class="hv-page-heading">
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
    {#if pinMissing}
      <p class="hv-notice" data-tone="error" role="alert" id={pinRequiredMessageId}>
        {data.copy['suggestion.locationRequired']}
      </p>
    {:else if signInRequired}
      <div class="hv-notice sign-in-gate" data-tone="info" role="alert">
        <span>{data.copy['suggestion.signInRequired']}</span>
        <!-- A full navigation (not a client-side route transition) keeps the account page's own
             sign-in handoff deterministic instead of racing the SPA router's async goto(). -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- signInUrl is server-built by accountUrl() -->
        <a class="hv-control" data-intent="primary" href={data.signInUrl} data-sveltekit-reload>
          {data.copy['suggestion.signInAction']}
        </a>
      </div>
    {:else if errorMessage}
      <p class="hv-notice" data-tone="error" role="alert">{errorMessage}</p>
    {/if}

    <form class="hv-stack" method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <input type="hidden" name="commandId" value={data.commandId} />
      <fieldset class="answer-boundary hv-stack" disabled={submissionUnavailable}>
        <input type="hidden" name="purpose" value="dog_access_destination" />
        <input type="hidden" name="submissionProfile" value="minimal-v1" />

        <div class="hv-form-section hv-panel">
          <label class="hv-stack">
            {data.copy['suggestion.placeName']}
            <input class="hv-field" name="name" required />
          </label>
        </div>

        <fieldset
          class="hv-form-section hv-panel"
          role="region"
          aria-label={data.copy['suggestion.locationRegion']}
          aria-describedby={pinMissing ? pinRequiredMessageId : undefined}
          tabindex="-1"
          bind:this={locationRegion}
        >
          <legend>{data.copy['suggestion.location']}</legend>
          <SuggestionLocationPicker
            adapter={mapAdapter}
            copy={data.copy}
            {fallbackCamera}
            bind:latitude={pinLatitude}
            bind:longitude={pinLongitude}
          />
        </fieldset>

        <fieldset class="hv-form-section hv-panel">
          <legend>{data.copy['suggestion.welcomeArea']}</legend>
          <div class="choices">
            {#each welcomeAreas as area (area.value)}
              <label class="choice">
                <input type="radio" name="accessArea" value={area.value} required />
                <span>{data.copy[area.key]}</span>
              </label>
            {/each}
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
  .answer-boundary {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }

  /* Sending is not a fourth question, so it stands off from the three rather than queueing behind
     them at the same interval. */
  .answer-boundary > button[type='submit'] {
    margin-block-start: var(--hv-space-panel);
  }

  .sign-in-gate {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .choices {
    display: grid;
    gap: 0.5rem;
  }

  .choice {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.6rem;
    align-items: center;
    min-height: var(--hv-control-height);
    color: var(--hv-color-basalt);
    font-weight: 800;
  }

  .choice input {
    width: 1.25rem;
    height: 1.25rem;
  }
</style>
