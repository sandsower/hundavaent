<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    hasPendingAccessCondition,
    hasPendingPlaceField,
    memberPlaceFields,
    type MemberPlaceField,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import { correctConditionHref } from '$lib/discovery/correct-link';
  import { createLiveAnnouncer } from '$lib/discovery/live-announcement';
  import PlaceFieldCorrection from '$lib/discovery/PlaceFieldCorrection.svelte';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';

  /**
   * The one quiet line at the foot of the practical details, and everything behind it.
   *
   * Readers outnumber contributors, and the practical details are what a reader came for. So the
   * details render exactly as they always have and a single disclosure holds every per-fact
   * affordance, including the Place name, which the card had no row for until contribution needed
   * one.
   */
  interface Props {
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    profile: PublishedPlaceProfile;
    pending?: readonly PendingPlaceFlag[];
    /** Forwarded from each editor so the card can suppress the fact without a refetch. */
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  }

  let {
    placeName,
    lang,
    copy,
    signedIn,
    profile,
    pending = [],
    onSubmitted = () => undefined
  }: Props = $props();

  const componentId = $props.id();
  let open = $state(false);
  let panel = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let focusTarget = $state<'panel' | 'trigger' | null>(null);
  // Four editors share this one region, so two of them reporting the same outcome in a row is the
  // ordinary case rather than the edge case. The shared announcer is what makes the repeat audible.
  let announcement = $state('');
  const announce = createLiveAnnouncer((message) => (announcement = message));

  const fieldLabels: Record<MemberPlaceField, MessageKey> = {
    name: 'placeField.name',
    website_url: 'placeField.websiteUrl',
    phone: 'placeField.phone',
    dog_amenities: 'placeField.dogAmenities'
  };

  // The raw stored values, joined, and deliberately not the localized rendering the details show
  // above. The editor round-trips exactly what is stored, so showing anything else here would
  // invite a Correction against a value the Member cannot see.
  const amenityText = $derived(profile.dogAmenities.join(', '));

  const values = $derived<Record<MemberPlaceField, string>>({
    name: profile.name,
    website_url: profile.websiteUrl ?? '',
    phone: profile.phone ?? '',
    dog_amenities: amenityText
  });

  const multipleConditions = $derived(profile.accessConditions.length > 1);

  function expand(): void {
    open = true;
    focusTarget = 'panel';
  }

  function collapse(): void {
    open = false;
    focusTarget = 'trigger';
  }

  function pendingField(field: MemberPlaceField): boolean {
    return hasPendingPlaceField(pending, field);
  }

  $effect(() => {
    if (focusTarget === 'panel' && panel) {
      panel.querySelector<HTMLElement>('button, a[href]')?.focus();
      focusTarget = null;
    }
    if (focusTarget === 'trigger' && trigger) {
      trigger.focus();
      focusTarget = null;
    }
  });
</script>

<div class="contribution-reveal" data-contribution-reveal>
  {#if open}
    <section
      bind:this={panel}
      class="panel"
      aria-labelledby={`${componentId}-heading`}
      data-contribution-panel
    >
      <h4 id={`${componentId}-heading`}>{copy['inlineCorrection.revealHeading']}</h4>

      <ul class="facts">
        {#each memberPlaceFields as field (field)}
          <li>
            <span class="fact-label">{copy[fieldLabels[field]]}</span>
            <span class="fact-value">{values[field] || copy['common.notAvailable']}</span>
            {#if pendingField(field)}
              {@render pendingLine()}
            {:else}
              <PlaceFieldCorrection
                placeId={profile.placeId}
                {placeName}
                {lang}
                {copy}
                {signedIn}
                {field}
                currentValue={values[field]}
                {announce}
                {onSubmitted}
              />
            {/if}
          </li>
        {/each}
      </ul>

      {#if multipleConditions}
        <div class="conditions">
          <h5>{copy['inlineCorrection.conditionsHeading']}</h5>
          <ul class="facts">
            {#each profile.accessConditions as condition, index (condition.id)}
              <li>
                <span class="fact-label"
                  >{copy['place.conditionLabel'].replace('{number}', String(index + 1))}</span
                >
                {#if hasPendingAccessCondition(pending, condition.id)}
                  {@render pendingLine()}
                {:else}
                  <!-- eslint-disable svelte/no-navigation-without-resolve -- correctConditionHref builds the path with $app/paths resolve() -->
                  <a
                    href={correctConditionHref(lang, profile.placeId, condition.id)}
                    class="condition-link"
                    aria-label={copy['inlineCorrection.conditionLinkLabel']
                      .replace('{number}', String(index + 1))
                      .replace('{name}', placeName)}
                  >
                    {copy['inlineCorrection.start']}
                  </a>
                  <!-- eslint-enable svelte/no-navigation-without-resolve -->
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <button class="hide" type="button" onclick={collapse}>
        {copy['inlineCorrection.revealHide']}
      </button>
    </section>
  {:else}
    <button
      bind:this={trigger}
      class="reveal"
      type="button"
      aria-label={copy['inlineCorrection.revealLabel'].replace('{name}', placeName)}
      onclick={expand}
    >
      {copy['inlineCorrection.reveal']}
    </button>
  {/if}
</div>

<p class="visually-hidden" role="status" aria-live="polite" data-contribution-announcement>
  {announcement}
</p>

{#snippet pendingLine()}
  <p class="pending" data-correction-pending>{copy['inlineCorrection.pending']}</p>
{/snippet}

<style>
  .contribution-reveal {
    display: grid;
    justify-items: start;
    margin-top: 0.35rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--hv-border-subtle);
  }

  /* The entry point to the whole contribution surface, so it needs a target a thumb can hit.
     1.75rem clears the WCAG 2.5.8 24px minimum with room to spare. */
  .reveal {
    display: inline-flex;
    min-height: 1.75rem;
    align-items: center;
    padding: 0.2rem 0.4rem;
    border: 0;
    border-radius: var(--hv-radius-control);
    background: transparent;
    color: var(--hv-color-fjord);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: underline;
    cursor: pointer;
  }

  .reveal:focus-visible,
  .hide:focus-visible,
  .condition-link:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .panel {
    display: grid;
    width: 100%;
    gap: 0.7rem;
    min-width: 0;
    animation: contribution-reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  h4,
  h5 {
    margin: 0;
    color: var(--hv-color-basalt);
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .facts {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .facts > li {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .fact-label {
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    font-weight: 850;
  }

  .fact-value {
    overflow-wrap: anywhere;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .conditions {
    display: grid;
    gap: 0.5rem;
  }

  .condition-link {
    justify-self: start;
    color: var(--hv-color-fjord);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .pending {
    margin: 0.2rem 0 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.35;
  }

  .hide {
    display: inline-flex;
    min-height: 1.75rem;
    align-items: center;
    justify-self: start;
    padding: 0.2rem 0.4rem;
    border: 0;
    border-radius: var(--hv-radius-control);
    background: transparent;
    color: var(--hv-color-fjord);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: underline;
    cursor: pointer;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    border: 0;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Transform only, and deliberately no opacity: this panel is entirely text, so fading it in
     would start every label at a 1:1 contrast ratio and climb through the whole duration. Reduced
     motion is handled by --hv-motion-quick collapsing to zero rather than by an override here. */
  @keyframes contribution-reveal {
    from {
      transform: translateY(-0.2rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
