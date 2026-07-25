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

  const enhanceForm: SubmitFunction = () => {
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
    {#if signInRequired}
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
        >
          <legend>{data.copy['suggestion.location']}</legend>
          <SuggestionLocationPicker
            adapter={mapAdapter}
            copy={data.copy}
            initialLatitude={Number(data.presetLatitude ?? 64.1466)}
            initialLongitude={Number(data.presetLongitude ?? -21.9426)}
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
