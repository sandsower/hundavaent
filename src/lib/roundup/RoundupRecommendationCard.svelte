<script lang="ts">
  import { resolve } from '$app/paths';

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

<article class:lead class="recommendation hv-panel" data-rank={recommendation.rank}>
  <div class="icon-wrap" aria-hidden="true">
    <RoundupTrailIcon
      kind={recommendation.reason === 'newly_published' ? 'new' : 'updated'}
      size={lead ? 'regular' : 'small'}
    />
  </div>
  <div class="content">
    <p class="reason hv-eyebrow">{reason}</p>
    <h3>{recommendation.name}</h3>
    <p class="facts">
      <span>{copy[categoryKey(recommendation.category)]}</span>
      <span aria-hidden="true">·</span>
      <span>{copy[municipalityKey(recommendation.municipality)]}</span>
    </p>
    <!-- eslint-disable svelte/no-navigation-without-resolve -- the locale root is resolved inside this dynamic discovery URL. -->
    <a
      class="hv-control"
      data-intent={lead ? 'primary' : undefined}
      href={`${resolve('/[lang=lang]', { lang })}?place=${encodeURIComponent(recommendation.placeId)}&view=list`}
      onclick={onselect}
    >
      {copy['roundup.openPlace'].replace('{name}', recommendation.name)}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </div>
</article>

<style>
  .recommendation {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 100%;
    padding: 1rem;
    gap: 0.85rem;
    border-color: color-mix(in srgb, var(--hv-color-fjord) 18%, var(--hv-color-line));
  }

  .recommendation.lead {
    padding: clamp(1.15rem, 3vw, 1.6rem);
    background:
      radial-gradient(
        circle at 92% 12%,
        color-mix(in srgb, var(--hv-color-sky) 22%, transparent),
        transparent 36%
      ),
      var(--hv-color-snow-raised);
    border-color: color-mix(in srgb, var(--hv-color-fjord) 38%, var(--hv-color-line));
  }

  .icon-wrap {
    display: grid;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--hv-color-moss) 12%, white);
    color: var(--hv-color-moss);
    place-items: center;
  }

  .lead .icon-wrap {
    width: 3.5rem;
    height: 3.5rem;
    background: color-mix(in srgb, var(--hv-color-fjord) 11%, white);
    color: var(--hv-color-fjord);
  }

  .reason,
  h3,
  .facts {
    margin: 0;
  }

  h3 {
    margin-block-start: 0.25rem;
    font-family: var(--hv-font-display);
    font-size: 1.25rem;
    line-height: 1.15;
  }

  .lead h3 {
    font-size: clamp(1.45rem, 4vw, 2rem);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    margin-block: 0.45rem 0.85rem;
    gap: 0.35rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .hv-control {
    width: fit-content;
  }

  @media (max-width: 32rem) {
    .recommendation,
    .recommendation.lead {
      grid-template-columns: 1fr;
    }
  }
</style>
