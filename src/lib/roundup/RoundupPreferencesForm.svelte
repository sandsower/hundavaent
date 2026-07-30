<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { Button, Choice } from '@hundavaent/design-system';
  import type { Catalogue, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import {
    roundupCategories,
    roundupMunicipalities,
    type RoundupMunicipality,
    type RoundupPreferences
  } from './types';
  import RoundupTrailIcon from './RoundupTrailIcon.svelte';

  let {
    preferences,
    copy,
    submitting = false,
    error = null,
    enhanceAction
  }: {
    preferences: RoundupPreferences;
    copy: Catalogue;
    submitting?: boolean;
    error?: string | null;
    enhanceAction: SubmitFunction;
  } = $props();

  function categoryKey(category: PlaceCategory): MessageKey {
    if (category === 'shopping_centre') return 'category.shoppingCentre';
    return `category.${category}` as MessageKey;
  }

  function municipalityKey(municipality: RoundupMunicipality): MessageKey {
    return `municipality.${municipality}` as MessageKey;
  }
</script>

<section class="preferences hv-panel hv-stack" aria-labelledby="roundup-preferences-heading">
  <header class="preferences-header">
    <span class="preferences-icon"><RoundupTrailIcon kind="private" size="small" /></span>
    <div>
      <h2 id="roundup-preferences-heading">{copy['roundup.preferencesTitle']}</h2>
      <p>{copy['roundup.preferencesIntro']}</p>
    </div>
  </header>

  {#if error}
    <p class="hv-notice" data-tone="error" role="alert">
      {error === 'invalid' ? copy['roundup.invalid'] : copy['roundup.saveUnavailable']}
    </p>
  {/if}

  <form method="POST" action="?/savePreferences" use:enhance={enhanceAction}>
    <fieldset>
      <legend>{copy['roundup.municipalitiesLegend']}</legend>
      <p class="group-hint" id="municipality-help">{copy['roundup.municipalitiesHelp']}</p>
      <div class="choice-grid municipalities">
        {#each roundupMunicipalities as municipality (municipality)}
          <Choice
            type="checkbox"
            class="chip"
            name="municipalities"
            value={municipality}
            checked={preferences.municipalities.includes(municipality)}
            aria-describedby="municipality-help"
          >
            {copy[municipalityKey(municipality)]}
          </Choice>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>{copy['roundup.categoriesLegend']}</legend>
      <p class="group-hint" id="category-help">{copy['roundup.categoriesHelp']}</p>
      <div class="choice-grid categories">
        {#each roundupCategories as category (category)}
          <Choice
            type="checkbox"
            class="chip"
            name="categories"
            value={category}
            checked={preferences.categories.includes(category)}
            aria-describedby="category-help"
          >
            {copy[categoryKey(category)]}
          </Choice>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>{copy['roundup.languageLegend']}</legend>
      <div class="language-options">
        <Choice
          type="radio"
          class="chip"
          name="roundupLocale"
          value="is"
          checked={preferences.roundupLocale === 'is'}
        >
          {copy['roundup.languageIcelandic']}
        </Choice>
        <Choice
          type="radio"
          class="chip"
          name="roundupLocale"
          value="en"
          checked={preferences.roundupLocale === 'en'}
        >
          {copy['roundup.languageEnglish']}
        </Choice>
      </div>
    </fieldset>

    <div class="email-interest">
      <Choice
        type="checkbox"
        class="email-choice"
        name="emailInterest"
        value="true"
        checked={preferences.emailInterest}
      >
        {copy['roundup.emailLabel']}
      </Choice>
      <p>{copy['roundup.emailHelp']}</p>
    </div>

    <Button intent="primary" type="submit" disabled={submitting} class="submit-button">
      {submitting ? copy['roundup.saving'] : copy['roundup.save']}
    </Button>
  </form>
</section>

<style>
  .preferences {
    padding: clamp(1rem, 4vw, 1.5rem);
    border-color: color-mix(in srgb, var(--hv-color-fjord) 25%, var(--hv-border-subtle));
  }

  .preferences-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.8rem;
  }

  .preferences-icon {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--hv-color-fjord) 10%, white);
    color: var(--hv-color-fjord);
    place-items: center;
  }

  h2,
  .preferences-header p,
  .group-hint,
  .email-interest p {
    margin: 0;
  }

  h2 {
    font-family: var(--hv-font-display);
    font-size: 1.35rem;
  }

  .preferences-header p,
  .group-hint,
  .email-interest p {
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  .preferences-header p {
    margin-block-start: 0.35rem;
  }

  form {
    display: grid;
    gap: 1.25rem;
  }

  /* Baseline-first: these fieldsets render flat today (no border/padding/shadow), unlike the
     app's hv-form-section.hv-panel fieldsets elsewhere, so they stay native <fieldset>/<legend>
     rather than adopting FormSection - only the choice rows inside migrate to Choice. */
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-block-end: 0.3rem;
    font-weight: 900;
  }

  .group-hint {
    margin-block-end: 0.65rem;
    font-size: 0.9rem;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .language-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Choice renders its own <label> row in a separate component. The chip look (gap, padding,
     border, radius, background, and the checked-state highlight) is this component's own
     flourish on top of Choice's row - Choice itself supplies only the grid mechanics, sizing
     token, and font weight - so the chip look crosses the component boundary via :global()
     anchored on the locally-authored .choice-grid/.language-options wrappers, the same pattern as
     AuthDialog's .dialog-content :global(p). Font-weight and gap here restate this component's
     own values (750, 0.55rem, and the 2.65rem chip height) rather than accepting Choice's row
     defaults (800, 0.6rem, and the 2.75rem control token), because those are visual decisions
     this component made, not approved to drift. The email-interest row is the one place Choice's
     control-token floor is accepted without restatement: its multi-line label already exceeds it,
     so the floor is invisible there. */
  .choice-grid :global(.chip),
  .language-options :global(.chip) {
    gap: 0.55rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 0.75rem;
    background: var(--hv-color-snow-raised);
    font-weight: 750;
    min-height: 2.65rem;
  }

  .choice-grid :global(.chip:has(input:checked)),
  .language-options :global(.chip:has(input:checked)) {
    border-color: var(--hv-color-fjord);
    background: color-mix(in srgb, var(--hv-color-fjord) 16%, white);
  }

  /* Choice's own input carries size-5 (1.25rem, matching a different shipped chip - see
     Choice.svelte's comment) and no accent-color. This component's checkboxes/radios were sized
     and tinted deliberately; re-anchored rather than accepted as drift. */
  .choice-grid :global(.chip input),
  .language-options :global(.chip input),
  .email-interest :global(.email-choice input) {
    width: 1.05rem;
    height: 1.05rem;
    accent-color: var(--hv-color-fjord);
  }

  .language-options :global(.chip) {
    min-width: 8.5rem;
  }

  .email-interest {
    padding: 0.9rem;
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--hv-color-moss) 8%, white);
  }

  /* The email-interest checkbox keeps its own weight/line-height/top-alignment - deliberately
     different from the chip rows above (no border/background here, just the row typography) -
     re-anchored the same way as the chip look. */
  .email-interest :global(.email-choice) {
    align-items: flex-start;
    gap: 0.55rem;
    font-weight: 850;
    line-height: 1.4;
  }

  .email-interest :global(.email-choice input) {
    margin-block-start: 0.15rem;
  }

  .email-interest p {
    margin-block-start: 0.45rem;
    padding-inline-start: 1.6rem;
    font-size: 0.88rem;
  }

  /* Button renders its own <button> in a separate component; `justify-self` only has meaning as a
     grid-item property on the form's own grid, so it is a call-site layout concern re-anchored
     via :global() rather than something Button could ever own. */
  form :global(.submit-button) {
    justify-self: start;
  }

  @media (max-width: 34rem) {
    .choice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
