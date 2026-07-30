<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { untrack } from 'svelte';

  import {
    Button,
    Choice,
    Eyebrow,
    Field,
    FormSection,
    Input,
    Meta,
    PageHeader,
    PageShell,
    PageTitle
  } from '@hundavaent/design-system';
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

<PageShell>
  <PageHeader class="mb-section">
    <Eyebrow>{data.copy['suggestion.nav']}</Eyebrow>
    <PageTitle>{data.copy['suggestion.title']}</PageTitle>
    <Meta>{data.copy['suggestion.intro']}</Meta>
    <div class="flex flex-wrap items-center gap-actions">
      <Button href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}>
        {data.copy['suggestion.myTitle']}
      </Button>
    </div>
  </PageHeader>

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
             sign-in handoff deterministic instead of racing the SPA router's async goto(). The
             eslint-disable for svelte/no-navigation-without-resolve now lives inside Button.svelte
             itself, next to the anchor the rule actually inspects. -->
        <Button intent="primary" href={data.signInUrl} data-sveltekit-reload>
          {data.copy['suggestion.signInAction']}
        </Button>
      </div>
    {:else if errorMessage}
      <p class="hv-notice" data-tone="error" role="alert">{errorMessage}</p>
    {/if}

    <form class="grid gap-context" method="POST" use:enhance={enhanceForm} aria-busy={submitting}>
      <input type="hidden" name="commandId" value={data.commandId} />
      <fieldset class="answer-boundary grid gap-context" disabled={submissionUnavailable}>
        <input type="hidden" name="purpose" value="dog_access_destination" />
        <input type="hidden" name="submissionProfile" value="minimal-v1" />

        <FormSection>
          <Field label={data.copy['suggestion.placeName']}>
            <Input name="name" required />
          </Field>
        </FormSection>

        <!-- Not migrated to FormSection - or to Panel - on purpose: the enhance guard focuses
             this fieldset directly (locationRegion?.focus(), below) when the pin question is
             blocked, and that needs a real DOM node. bind:this on a component binds the component
             instance (its exports), not the element it renders - neither FormSection nor Panel
             exposes such a ref today - so wrapping this one would silently break the "focus the
             blocked question" behavior rather than merely change its look. Left as the native
             fieldset+legend pair, carrying Panel's exact utility recipe (border/rounded-panel/
             bg-snow-raised/shadow-raised/p-panel) directly instead of the component. -->
        <fieldset
          class="border border-border-subtle rounded-panel bg-snow-raised shadow-raised p-panel grid gap-panel min-w-0"
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

        <FormSection legend={data.copy['suggestion.welcomeArea']}>
          <div class="choices">
            {#each welcomeAreas as area (area.value)}
              <Choice type="radio" name="accessArea" value={area.value} required>
                {data.copy[area.key]}
              </Choice>
            {/each}
          </div>
        </FormSection>

        <Button intent="primary" type="submit" disabled={submitting || submissionUnavailable}>
          {submitting ? data.copy['suggestion.sending'] : data.copy['suggestion.submit']}
        </Button>
      </fieldset>
    </form>
  {/if}
</PageShell>

<style>
  .answer-boundary {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }

  /* Sending is not a fourth question, so it stands off from the three rather than queueing behind
     them at the same interval. Button renders its own <button> from inside Button.svelte, so
     Svelte's scoped CSS never decorates it - it is not this file's element, even though it ends
     up as this fieldset's direct DOM child. The selector re-anchors on .answer-boundary (locally
     authored, scoped) and reaches through :global() for the part Button owns, the same pattern
     Field/Textarea's own comments describe for reach-through to component internals. */
  .answer-boundary > :global(button[type='submit']) {
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
</style>
