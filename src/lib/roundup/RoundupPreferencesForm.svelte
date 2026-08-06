<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { Button, Choice, Notice } from '@hundavaent/design-system';
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

<!-- Not <Panel>: this surface needs a bespoke fjord-tinted border, which Panel's contract cannot
     carry (its border/radius/shadow/background ship as one matched set that callers must not
     override - see Panel.svelte's class-prop doc comment). The panel recipe is reproduced here as
     scoped token CSS instead, on the caller's own element - the same call as its sibling
     RoundupRecommendationCard and WeeklyRhythmTrail. -->
<section
  class="preferences grid gap-context p-[clamp(1rem,4vw,1.5rem)] border border-[color-mix(in_srgb,var(--hv-color-fjord)_25%,var(--hv-border-subtle))] rounded-panel bg-snow-raised shadow-raised"
  aria-labelledby="roundup-preferences-heading"
>
  <header
    class="preferences-header grid grid-cols-[auto_minmax(0,1fr)] items-start gap-[0.8rem]"
  >
    <span
      class="preferences-icon grid place-items-center size-10 rounded-[0.85rem] bg-[color-mix(in_srgb,var(--hv-color-fjord)_10%,white)] text-fjord"
      ><RoundupTrailIcon kind="private" size="small" /></span
    >
    <div>
      <h2
        id="roundup-preferences-heading"
        class="m-0 font-display text-[1.35rem]"
      >
        {copy['roundup.preferencesTitle']}
      </h2>
      <p
        class="[margin-block:0.35rem_0] [margin-inline:0] leading-[1.5] text-basalt-muted"
      >
        {copy['roundup.preferencesIntro']}
      </p>
    </div>
  </header>

  {#if error}
    <Notice as="p" tone="error" role="alert">
      {error === 'invalid' ? copy['roundup.invalid'] : copy['roundup.saveUnavailable']}
    </Notice>
  {/if}

  <form
    class="grid gap-5"
    method="POST"
    action="?/savePreferences"
    use:enhance={enhanceAction}
  >
    <!-- Baseline-first: these fieldsets render flat today (no border/padding/shadow), unlike the
         app's hv-form-section.hv-panel fieldsets elsewhere, so they stay native <fieldset>/<legend>
         rather than adopting FormSection - only the choice rows inside migrate to Choice. -->
    <fieldset class="min-w-0 m-0 p-0 [border:0]">
      <legend class="[margin-block-end:0.3rem] font-black">
        {copy['roundup.municipalitiesLegend']}
      </legend>
      <p
        class="group-hint [margin-block:0_0.65rem] [margin-inline:0] text-[0.9rem] leading-[1.5] text-basalt-muted"
        id="municipality-help"
      >
        {copy['roundup.municipalitiesHelp']}
      </p>
      <div
        class="choice-grid municipalities grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 max-[34rem]:grid-cols-1"
      >
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

    <fieldset class="min-w-0 m-0 p-0 [border:0]">
      <legend class="[margin-block-end:0.3rem] font-black">
        {copy['roundup.categoriesLegend']}
      </legend>
      <p
        class="group-hint [margin-block:0_0.65rem] [margin-inline:0] text-[0.9rem] leading-[1.5] text-basalt-muted"
        id="category-help"
      >
        {copy['roundup.categoriesHelp']}
      </p>
      <div
        class="choice-grid categories grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 max-[34rem]:grid-cols-1"
      >
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

    <fieldset class="min-w-0 m-0 p-0 [border:0]">
      <legend class="[margin-block-end:0.3rem] font-black">
        {copy['roundup.languageLegend']}
      </legend>
      <div class="language-options flex flex-wrap gap-2">
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

    <div
      class="email-interest p-[0.9rem] rounded-[0.85rem] bg-[color-mix(in_srgb,var(--hv-color-moss)_8%,white)]"
    >
      <Choice
        type="checkbox"
        class="email-choice"
        name="emailInterest"
        value="true"
        checked={preferences.emailInterest}
      >
        {copy['roundup.emailLabel']}
      </Choice>
      <p
        class="[margin-block:0.45rem_0] [margin-inline:0] [padding-inline-start:1.6rem] text-[0.88rem] leading-[1.5] text-basalt-muted"
      >
        {copy['roundup.emailHelp']}
      </p>
    </div>

    <Button intent="primary" type="submit" disabled={submitting} class="submit-button">
      {submitting ? copy['roundup.saving'] : copy['roundup.save']}
    </Button>
  </form>
</section>

<style>
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

  /* Button renders its own <button> in a separate component; `justify-self` only has meaning as a
     grid-item property on the form's own grid, so it is a call-site layout concern re-anchored
     via :global() rather than something Button could ever own. */
  form :global(.submit-button) {
    justify-self: start;
  }
</style>
