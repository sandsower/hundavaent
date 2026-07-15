<script lang="ts">
  import type { Catalogue, MessageKey } from '$i18n';
  import { formatLocalizedDateOnly } from '$i18n/date';
  import {
    buildAccessSymbolPresentation,
    type AccessSymbol,
    type AccessSymbolCondition,
    type AccessSymbolDimension,
    type AccessSymbolState
  } from '$domain/access-symbols';

  interface Props {
    placeName: string;
    conditions: readonly AccessSymbolCondition[];
    copy: Catalogue;
    onOpenDetails?: () => void;
  }

  let { placeName, conditions, copy, onOpenDetails = () => undefined }: Props = $props();
  const componentId = $props.id();
  const isIcelandic = $derived(copy['hours.monday'] === 'Mánudagur');
  let activeDimension = $state<AccessSymbolDimension | 'complex' | null>(null);
  const presentation = $derived(buildAccessSymbolPresentation(conditions));
  const labels: Record<AccessSymbolState, MessageKey> = {
    indoors: 'accessSymbols.indoors',
    leash_required: 'accessSymbols.leash',
    off_leash_permitted: 'accessSymbols.offLeash',
    carrier_required: 'accessSymbols.carrier',
    small_dogs_only: 'accessSymbols.smallDogs',
    limited: 'accessSymbols.limited',
    unrestricted: 'accessSymbols.permissionOpen',
    special: 'accessSymbols.special',
    not_stated: 'accessSymbols.notStated'
  };
  const details: Record<AccessSymbolState, MessageKey> = {
    indoors: 'accessSymbols.indoorsDetail',
    leash_required: 'accessSymbols.leashDetail',
    off_leash_permitted: 'accessSymbols.offLeashDetail',
    carrier_required: 'accessSymbols.carrierDetail',
    small_dogs_only: 'accessSymbols.smallDogsDetail',
    limited: 'accessSymbols.limitedDetail',
    unrestricted: 'accessSymbols.permissionOpenDetail',
    special: 'accessSymbols.specialDetail',
    not_stated: 'accessSymbols.notStatedDetail'
  };

  function label(symbol: AccessSymbol): string {
    if (symbol.state === 'unrestricted' && symbol.dimension === 'dogs') {
      return copy['accessSymbols.allDogs'];
    }
    if (symbol.state === 'unrestricted' && symbol.dimension === 'timing') {
      return copy['accessSymbols.wheneverOpen'];
    }
    return copy[labels[symbol.state]];
  }

  function detail(symbol: AccessSymbol): string {
    if (symbol.state === 'unrestricted' && symbol.dimension === 'dogs') {
      return copy['accessSymbols.allDogsDetail'];
    }
    if (symbol.state === 'unrestricted' && symbol.dimension === 'timing') {
      return copy['accessSymbols.wheneverOpenDetail'];
    }
    return copy[details[symbol.state]];
  }

  const weekdays: Readonly<Record<number, MessageKey>> = {
    1: 'hours.monday',
    2: 'hours.tuesday',
    3: 'hours.wednesday',
    4: 'hours.thursday',
    5: 'hours.friday',
    6: 'hours.saturday',
    7: 'hours.sunday'
  };

  function fullExplanation(symbol: AccessSymbol): string {
    return [dimensionExplanation(symbol), ...localizedConstraints(symbol)].join(' ');
  }

  function dimensionExplanation(symbol: AccessSymbol): string {
    const condition = symbol.condition;
    if (symbol.dimension === 'area') {
      if (condition.accessArea === 'indoors') return copy['accessSymbols.indoorsDetail'];
      if (condition.accessArea === 'outdoors') return copy['accessSymbols.outdoorsDetail'];
      if (condition.accessArea === 'designated_area') {
        return copy['accessSymbols.designatedAreaDetail'];
      }
      return copy['accessSymbols.otherAreaDetail'];
    }
    if (symbol.dimension === 'restraint') {
      if (condition.restraintCondition === 'leash_required') {
        return copy['accessSymbols.leashDetail'];
      }
      if (condition.restraintCondition === 'off_leash_permitted') {
        return copy['accessSymbols.offLeashDetail'];
      }
      if (condition.restraintCondition === 'carrier_required') {
        return copy['accessSymbols.carrierDetail'];
      }
      return copy['accessSymbols.otherRestraintDetail'];
    }
    if (symbol.dimension === 'permission') {
      if (condition.permissionRequirement === 'standing_permission') {
        return copy['accessSymbols.permissionOpenDetail'];
      }
      if (condition.permissionRequirement === 'ask_on_arrival') {
        return copy['accessSymbols.askOnArrivalDetail'];
      }
      return copy['accessSymbols.advanceApprovalDetail'];
    }
    if (symbol.dimension === 'dogs') {
      if (symbol.state === 'unrestricted') return copy['accessSymbols.allDogsDetail'];
      if (symbol.state === 'small_dogs_only') return copy['accessSymbols.smallDogsDetail'];
      if (symbol.state === 'not_stated') return copy['accessSymbols.notStatedDetail'];
      return copy['accessSymbols.dogConditionsDetail'];
    }
    return detail(symbol);
  }

  function localizedConstraints(symbol: AccessSymbol): string[] {
    if (symbol.dimension === 'area') {
      return meaningfulText(symbol.condition.accessAreaNote)
        ? [
            framedConstraint(
              'accessSymbols.areaNoteConstraint',
              '{note}',
              symbol.condition.accessAreaNote
            )
          ]
        : [];
    }
    if (symbol.dimension === 'restraint') {
      return meaningfulText(symbol.condition.restraintNote)
        ? [
            framedConstraint(
              'accessSymbols.restraintNoteConstraint',
              '{note}',
              symbol.condition.restraintNote
            )
          ]
        : [];
    }
    if (symbol.dimension === 'dogs') {
      const eligibility = symbol.condition.dogEligibility;
      if (!eligibility) return [];
      return [
        eligibility.maximumWeightKg === undefined
          ? ''
          : copy['accessSymbols.weightConstraint'].replace(
              '{weight}',
              formatWeight(eligibility.maximumWeightKg)
            ),
        eligibility.maximumDogs === undefined
          ? ''
          : copy['accessSymbols.dogCountConstraint'].replace(
              '{count}',
              String(eligibility.maximumDogs)
            ),
        meaningfulText(eligibility.notes)
          ? framedConstraint('accessSymbols.eligibilityNoteConstraint', '{note}', eligibility.notes)
          : ''
      ].filter(Boolean);
    }
    if (symbol.dimension !== 'timing') return [];
    const window = symbol.condition.availabilityWindow ?? {};
    const dayNames = (window.days ?? [])
      .map((day) => weekdays[day])
      .filter((key): key is MessageKey => Boolean(key))
      .map((key) => copy[key]);
    return [
      dayNames.length === 0
        ? ''
        : copy['accessSymbols.daysConstraint'].replace('{days}', dayNames.join(', ')),
      typeof window.startsAt === 'string'
        ? copy['accessSymbols.startsAtConstraint'].replace('{time}', window.startsAt)
        : '',
      typeof window.endsAt === 'string'
        ? copy['accessSymbols.endsAtConstraint'].replace('{time}', window.endsAt)
        : '',
      meaningfulText(window.startsOn)
        ? copy['accessSymbols.startsOnConstraint'].replace(
            '{date}',
            formatLocalizedDateOnly(window.startsOn, isIcelandic ? 'is' : 'en')
          )
        : '',
      meaningfulText(window.endsOn)
        ? copy['accessSymbols.endsOnConstraint'].replace(
            '{date}',
            formatLocalizedDateOnly(window.endsOn, isIcelandic ? 'is' : 'en')
          )
        : '',
      meaningfulText(window.notes)
        ? framedConstraint('accessSymbols.availabilityNoteConstraint', '{note}', window.notes)
        : ''
    ].filter(Boolean);
  }

  function meaningfulText(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function framedConstraint(key: MessageKey, placeholder: string, value: string): string {
    const framed = copy[key].replace(placeholder, value.trim());
    return /[.!?]$/.test(framed) ? framed : `${framed}.`;
  }

  function formatWeight(value: number): string {
    const formatted = new Intl.NumberFormat(isIcelandic ? 'is-IS' : 'en-GB', {
      maximumFractionDigits: 2
    }).format(value);
    return isIcelandic ? formatted.replace('.', ',') : formatted;
  }

  function activate(symbol: AccessSymbol): void {
    activeDimension = activeDimension === symbol.dimension ? null : symbol.dimension;
    if (activeDimension && (symbol.state === 'special' || symbol.state === 'limited')) {
      onOpenDetails();
    }
  }
</script>

<div
  class="access-presentation"
  role="group"
  aria-label={copy['accessSymbols.label'].replace('{name}', placeName)}
>
  {#if presentation.kind === 'complex'}
    {@const detailId = `${componentId}-complex-detail`}
    <button
      type="button"
      class="symbol complex special"
      aria-expanded={activeDimension === 'complex'}
      aria-controls={activeDimension === 'complex' ? detailId : undefined}
      onclick={() => {
        activeDimension = activeDimension === 'complex' ? null : 'complex';
        onOpenDetails();
      }}
    >
      <span class="icon question" aria-hidden="true">?</span>
      <span>{copy['accessSymbols.differentConditions']}</span>
      <span class="tooltip" role="tooltip" aria-hidden="true">
        {copy['accessSymbols.differentConditionsDetail'].replace(
          '{count}',
          String(presentation.conditionCount)
        )}
      </span>
    </button>
    {#if activeDimension === 'complex'}
      <p id={detailId} class="persistent-detail" role="status">
        {copy['accessSymbols.differentConditionsDetail'].replace(
          '{count}',
          String(presentation.conditionCount)
        )}
      </p>
    {/if}
  {:else}
    <div class="symbols">
      {#each presentation.symbols as symbol (symbol.dimension)}
        {@const detailId = `${componentId}-${symbol.dimension}-detail`}
        <button
          type="button"
          class="symbol"
          class:area={symbol.dimension === 'area'}
          class:restraint={symbol.dimension === 'restraint'}
          class:permission={symbol.dimension === 'permission'}
          class:dogs={symbol.dimension === 'dogs'}
          class:timing={symbol.dimension === 'timing'}
          class:special={symbol.state === 'special'}
          class:not-stated={symbol.state === 'not_stated'}
          aria-label={label(symbol)}
          aria-expanded={activeDimension === symbol.dimension}
          aria-controls={activeDimension === symbol.dimension ? detailId : undefined}
          onclick={() => activate(symbol)}
        >
          <span class="icon" aria-hidden="true">
            {#if symbol.state === 'unrestricted'}
              <svg viewBox="0 0 24 24"
                ><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></svg
              >
            {:else if symbol.state === 'special'}
              <span class="question">?</span>
            {:else if symbol.state === 'not_stated'}
              <span class="minus">−</span>
            {:else if symbol.state === 'indoors'}
              <svg viewBox="0 0 24 24"
                ><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></svg
              >
            {:else if symbol.state === 'leash_required'}
              <svg viewBox="0 0 24 24"
                ><path d="M4 8c5-5 8 2 4 5-3 2-1 7 4 7h4" /><circle cx="18" cy="20" r="2" /><path
                  d="M7 7 4 4"
                /></svg
              >
            {:else if symbol.state === 'off_leash_permitted'}
              <svg viewBox="0 0 24 24"
                ><path d="M4 8c5-5 8 2 4 5-3 2-1 7 4 7h4" /><path d="m14 17 6-6M16 11h4v4" /></svg
              >
            {:else if symbol.state === 'carrier_required'}
              <!-- Pet-carrier silhouette adapted from SVG Repo 395169, CC0. -->
              <svg viewBox="0 0 18 18"
                ><path
                  d="M6.2 4V2.8A1.8 1.8 0 0 1 8 1h2a1.8 1.8 0 0 1 1.8 1.8V4M3 4h12l2 12H1z"
                /><path d="M5 8h8v6H5zM9 8v6M5 11h8" /></svg
              >
            {:else if symbol.state === 'small_dogs_only'}
              <svg viewBox="0 0 24 24"
                ><path d="M5 11v7M5 13h8l2 5M13 13l2-4 4 2v4h-3M8 11 6 7 3 9" /><path
                  d="M4 21h16"
                /></svg
              >
            {:else if symbol.state === 'limited'}
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg
              >
            {/if}
          </span>
          <span class="tooltip" role="tooltip" aria-hidden="true">{fullExplanation(symbol)}</span>
        </button>
        {#if activeDimension === symbol.dimension}
          <p id={detailId} class="persistent-detail symbol-detail" role="status">
            <strong>{label(symbol)}</strong>
            {fullExplanation(symbol)}
          </p>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .access-presentation {
    display: grid;
    gap: 0.55rem;
  }

  .symbols {
    display: grid;
    grid-template-columns: repeat(5, minmax(2.65rem, 1fr));
    gap: 0.4rem;
  }

  .symbol-detail {
    grid-column: 1 / -1;
  }

  .symbol {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 2.8rem;
    border: 1px solid color-mix(in srgb, var(--hv-color-basalt) 16%, transparent);
    border-radius: 0.75rem;
    background: #e6eee8;
    color: var(--hv-color-basalt);
    font: inherit;
    place-items: center;
    transition:
      border-color 160ms ease,
      transform 160ms ease,
      box-shadow 160ms ease;
  }

  .symbol.restraint {
    background: #f7dd9a;
  }
  .symbol.permission {
    background: #cfe5ed;
  }
  .symbol.dogs {
    background: #f3d4be;
  }
  .symbol.timing {
    background: #d9d5e9;
  }
  .symbol.special {
    background: #f1d7bd;
  }
  .symbol.not-stated {
    background: #e4e7e5;
    color: #66716f;
  }

  .symbol:hover,
  .symbol:focus-visible,
  .symbol[aria-expanded='true'] {
    border-color: var(--hv-color-fjord);
    box-shadow: 0 0.35rem 0.9rem rgb(20 41 39 / 14%);
    transform: translateY(-1px);
  }

  .symbol:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }

  .icon,
  .icon svg {
    display: grid;
    width: 1.45rem;
    height: 1.45rem;
    place-items: center;
  }

  .icon svg {
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .question,
  .minus {
    font-size: 1.3rem;
    font-weight: 850;
    line-height: 1;
  }

  .tooltip {
    --tooltip-translate-x: -50%;

    position: absolute;
    z-index: 3;
    bottom: calc(100% + 0.45rem);
    left: 50%;
    width: max-content;
    max-width: 11rem;
    padding: 0.35rem 0.5rem;
    border-radius: 0.45rem;
    background: var(--hv-color-basalt);
    color: white;
    font-size: 0.72rem;
    font-weight: 750;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    text-align: center;
    transform: translate(var(--tooltip-translate-x), 0.25rem);
    transition:
      opacity 160ms ease,
      transform 160ms ease,
      visibility 0s linear 160ms;
  }

  .symbol:hover .tooltip,
  .symbol:focus-visible .tooltip {
    opacity: 1;
    visibility: visible;
    transform: translate(var(--tooltip-translate-x), 0);
    transition-delay: 0s;
  }

  .symbol:first-of-type .tooltip {
    --tooltip-translate-x: 0;

    left: 0;
  }

  .symbol:last-of-type .tooltip {
    --tooltip-translate-x: 0;

    right: 0;
    left: auto;
  }

  .symbol.complex .tooltip {
    --tooltip-translate-x: 0;

    right: 0;
    left: 0;
    width: auto;
    max-width: none;
  }

  .complex {
    grid-template-columns: auto 1fr;
    gap: 0.55rem;
    justify-items: start;
    padding: 0.65rem 0.8rem;
    font-weight: 800;
  }

  .persistent-detail {
    margin: 0;
    padding: 0.6rem 0.7rem;
    border-inline-start: 0.25rem solid var(--hv-color-fjord);
    border-radius: 0.4rem;
    background: var(--hv-color-fjord-soft);
    font-size: 0.78rem;
    line-height: 1.4;
    animation: reveal 180ms ease both;
  }

  .persistent-detail strong {
    display: block;
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(-0.2rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .symbol,
    .tooltip,
    .persistent-detail {
      animation: none;
      transition: none;
    }
  }
</style>
