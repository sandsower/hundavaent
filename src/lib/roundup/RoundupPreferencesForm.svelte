<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';

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
      <p class="field-help" id="municipality-help">{copy['roundup.municipalitiesHelp']}</p>
      <div class="choice-grid municipalities" aria-describedby="municipality-help">
        {#each roundupMunicipalities as municipality (municipality)}
          <label class="choice">
            <input
              type="checkbox"
              name="municipalities"
              value={municipality}
              checked={preferences.municipalities.includes(municipality)}
            />
            <span>{copy[municipalityKey(municipality)]}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>{copy['roundup.categoriesLegend']}</legend>
      <p class="field-help" id="category-help">{copy['roundup.categoriesHelp']}</p>
      <div class="choice-grid categories" aria-describedby="category-help">
        {#each roundupCategories as category (category)}
          <label class="choice">
            <input
              type="checkbox"
              name="categories"
              value={category}
              checked={preferences.categories.includes(category)}
            />
            <span>{copy[categoryKey(category)]}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>{copy['roundup.languageLegend']}</legend>
      <div class="language-options">
        <label class="choice">
          <input
            type="radio"
            name="roundupLocale"
            value="is"
            checked={preferences.roundupLocale === 'is'}
          />
          <span>{copy['roundup.languageIcelandic']}</span>
        </label>
        <label class="choice">
          <input
            type="radio"
            name="roundupLocale"
            value="en"
            checked={preferences.roundupLocale === 'en'}
          />
          <span>{copy['roundup.languageEnglish']}</span>
        </label>
      </div>
    </fieldset>

    <div class="email-interest">
      <label>
        <input
          type="checkbox"
          name="emailInterest"
          value="true"
          checked={preferences.emailInterest}
        />
        <span>{copy['roundup.emailLabel']}</span>
      </label>
      <p>{copy['roundup.emailHelp']}</p>
    </div>

    <button class="hv-control" data-intent="primary" type="submit" disabled={submitting}>
      {submitting ? copy['roundup.saving'] : copy['roundup.save']}
    </button>
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
  .field-help,
  .email-interest p {
    margin: 0;
  }

  h2 {
    font-family: var(--hv-font-display);
    font-size: 1.35rem;
  }

  .preferences-header p,
  .field-help,
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

  .field-help {
    margin-block-end: 0.65rem;
    font-size: 0.9rem;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .choice,
  .email-interest label {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.55rem;
    cursor: pointer;
  }

  .choice {
    min-height: 2.65rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 0.75rem;
    background: var(--hv-color-snow-raised);
    font-weight: 750;
  }

  .choice:has(input:checked) {
    border-color: var(--hv-color-fjord);
    background: color-mix(in srgb, var(--hv-color-fjord) 16%, white);
  }

  input {
    width: 1.05rem;
    height: 1.05rem;
    flex: 0 0 auto;
    accent-color: var(--hv-color-fjord);
  }

  .language-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .language-options .choice {
    min-width: 8.5rem;
  }

  .email-interest {
    padding: 0.9rem;
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--hv-color-moss) 8%, white);
  }

  .email-interest label {
    align-items: flex-start;
    font-weight: 850;
    line-height: 1.4;
  }

  .email-interest input {
    margin-block-start: 0.15rem;
  }

  .email-interest p {
    margin-block-start: 0.45rem;
    padding-inline-start: 1.6rem;
    font-size: 0.88rem;
  }

  button {
    justify-self: start;
  }

  @media (max-width: 34rem) {
    .choice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
