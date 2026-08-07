<script lang="ts">
  import { resolve } from '$app/paths';

  import { Button, Eyebrow } from '@hundavaent/design-system';
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { PlaceCategory } from '$domain/place';
  import type { RoundupMunicipality, RoundupRecommendation } from './types';
  import RoundupTrailIcon from './RoundupTrailIcon.svelte';

  let {
    recommendation,
    copy,
    lang,
    lead = false,
    onselect = () => undefined
  }: {
    recommendation: RoundupRecommendation;
    copy: Catalogue;
    lang: Locale;
    lead?: boolean;
    onselect?: () => void;
  } = $props();

  const reason = $derived(
    recommendation.reason === 'newly_published'
      ? copy['roundup.reasonNew']
      : copy['roundup.reasonUpdated']
  );

  function categoryKey(category: PlaceCategory): MessageKey {
    if (category === 'shopping_centre') return 'category.shoppingCentre';
    return `category.${category}` as MessageKey;
  }

  function municipalityKey(municipality: RoundupMunicipality): MessageKey {
    return `municipality.${municipality}` as MessageKey;
  }
</script>

<!-- Not <Panel>: this card needs a bespoke fjord-tinted border (stronger still on .lead), which
     Panel's contract cannot carry (its border/radius/shadow/background ship as one matched set
     that callers must not override - see Panel.svelte's class-prop doc comment). The panel
     recipe is reproduced here as scoped token CSS instead, on the caller's own element (the
     SelectedPlaceCard/WeeklyRhythmTrail precedent: carry only the tokens that render). -->
<article
  class:lead
  class="recommendation group/recommendation grid grid-cols-[auto_minmax(0,1fr)] min-h-full gap-[0.85rem] p-4 border border-[color-mix(in_srgb,var(--hv-color-fjord)_18%,var(--hv-border-subtle))] rounded-panel bg-snow-raised shadow-raised max-[32rem]:grid-cols-1 [&.lead]:p-[clamp(1.15rem,3vw,1.6rem)] [&.lead]:border-[color-mix(in_srgb,var(--hv-color-fjord)_38%,var(--hv-border-subtle))] [&.lead]:bg-[color-mix(in_srgb,var(--hv-color-fjord)_6%,var(--hv-color-snow-raised))]"
  data-rank={recommendation.rank}
>
  <div
    class="icon-wrap grid place-items-center size-[2.8rem] rounded-[1rem] bg-[color-mix(in_srgb,var(--hv-color-moss)_12%,white)] text-moss group-[.lead]/recommendation:size-14 group-[.lead]/recommendation:bg-[color-mix(in_srgb,var(--hv-color-fjord)_11%,white)] group-[.lead]/recommendation:text-fjord"
    aria-hidden="true"
  >
    <RoundupTrailIcon
      kind={recommendation.reason === 'newly_published' ? 'new' : 'updated'}
      size={lead ? 'regular' : 'small'}
    />
  </div>
  <div class="content">
    <Eyebrow>{reason}</Eyebrow>
    <!-- .reason no longer needs a margin reset here: Eyebrow's own base already carries m-0. -->
    <h3
      class="[margin-block:0.25rem_0] [margin-inline:0] font-display text-[1.25rem] leading-[1.15] group-[.lead]/recommendation:text-[clamp(1.45rem,4vw,2rem)]"
    >
      {recommendation.name}
    </h3>
    <p
      class="facts flex flex-wrap [margin-block:0.45rem_0.85rem] [margin-inline:0] gap-[0.35rem] text-[0.9rem] font-bold text-basalt-muted"
    >
      <span>{copy[categoryKey(recommendation.category)]}</span>
      <span aria-hidden="true">·</span>
      <span>{copy[municipalityKey(recommendation.municipality)]}</span>
    </p>
    <Button
      href={`${resolve('/[lang=lang]', { lang })}?place=${encodeURIComponent(recommendation.placeId)}&view=list`}
      intent={lead ? 'primary' : 'neutral'}
      class="open-place"
      onclick={onselect}
    >
      {copy['roundup.openPlace'].replace('{name}', recommendation.name)}
    </Button>
  </div>
</article>

<style>
  /* Button renders its own <a> in a separate component; the hook is ancestor-scoped under
     .content (this file's own hashed scope), never a bare :global(). */
  .content :global(.open-place) {
    width: fit-content;
  }
</style>
