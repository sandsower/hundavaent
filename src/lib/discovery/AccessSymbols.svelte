<script lang="ts">
  import { tick, type Snippet } from 'svelte';

  import type { Catalogue, MessageKey } from '$i18n';
  import { formatLocalizedDateOnly } from '$i18n/date';
  import {
    buildAccessSymbolPresentation,
    type AccessSymbol,
    type AccessSymbolCondition,
    type AccessSymbolDimension,
    type AccessSymbolState
  } from '$domain/access-symbols';
  import { createLiveAnnouncer } from '$lib/discovery/live-announcement';

  interface Props {
    placeName: string;
    conditions: readonly AccessSymbolCondition[];
    copy: Catalogue;
    onOpenDetails?: () => void;
    /**
     * Optional contribution affordance rendered inside the open detail panel. Passed as a snippet
     * so this component stays presentational and so `PlaceCard`, which passes nothing, renders
     * exactly as it always has. The snippet receives the dimension the panel is explaining and the
     * announcer below, because the live region belongs to whoever owns the panel.
     */
    editor?: Snippet<[{ dimension: AccessSymbolDimension; announce: (message: string) => void }]>;
  }

  let { placeName, conditions, copy, onOpenDetails = () => undefined, editor }: Props = $props();
  const componentId = $props.id();
  const tooltipId = `${componentId}-tooltip`;
  const isIcelandic = $derived(copy['hours.monday'] === 'Mánudagur');
  let activeDimension = $state<AccessSymbolDimension | 'complex' | null>(null);
  let tooltipAnchor = $state<HTMLButtonElement>();
  let tooltipDimension = $state<AccessSymbolDimension | 'complex' | null>(null);
  let tooltipElement = $state<HTMLSpanElement>();
  let tooltipOpen = $state(false);
  let tooltipText = $state('');
  let tooltipLeft = $state(0);
  let tooltipTop = $state(0);
  let tooltipRevealY = $state('0.25rem');
  let tooltipHideTimer: ReturnType<typeof setTimeout> | undefined;
  // The detail panel itself is inert: it holds interactive controls now, and a live region would
  // announce every radio change. Announcements go through this dedicated region instead, which
  // still carries the explanation when a chip opens the panel.
  let announcement = $state('');
  const announce = createLiveAnnouncer((message) => (announcement = message));
  const presentation = $derived(buildAccessSymbolPresentation(conditions));
  const labels: Record<AccessSymbolState, MessageKey> = {
    indoors: 'accessSymbols.indoors',
    leash_required: 'accessSymbols.leash',
    off_leash_permitted: 'accessSymbols.offLeash',
    carrier_required: 'accessSymbols.carrier',
    small_dogs_only: 'accessSymbols.smallDogs',
    ask_on_arrival: 'accessSymbols.askOnArrival',
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
    ask_on_arrival: 'accessSymbols.askOnArrivalDetail',
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

  function iconName(symbol: AccessSymbol): string {
    if (symbol.state === 'unrestricted') return 'check';
    if (symbol.state === 'special') return 'question';
    if (symbol.state === 'not_stated') return 'minus';
    if (symbol.state === 'limited') return 'clock';
    if (symbol.state === 'small_dogs_only') return 'small-dog';
    if (symbol.state === 'ask_on_arrival') return 'ask-on-arrival';
    return symbol.state.replaceAll('_', '-');
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
    announce(activeDimension ? `${label(symbol)} ${fullExplanation(symbol)}` : '');
    if (activeDimension && (symbol.state === 'special' || symbol.state === 'limited')) {
      onOpenDetails();
    }
  }

  function portal(node: HTMLElement): { destroy: () => void } {
    document.body.append(node);
    return {
      destroy: () => {
        if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
        node.remove();
      }
    };
  }

  async function showTooltip(
    anchor: HTMLButtonElement,
    dimension: AccessSymbolDimension | 'complex',
    text: string
  ): Promise<void> {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipAnchor = anchor;
    tooltipDimension = dimension;
    tooltipText = text;
    tooltipOpen = false;
    await tick();
    if (tooltipAnchor !== anchor) return;
    if (!tooltipElement?.matches(':popover-open')) tooltipElement?.showPopover();
    positionTooltip();
    tooltipOpen = true;
  }

  function hideTooltip(anchor: HTMLButtonElement, source: 'pointer' | 'focus'): void {
    if (tooltipAnchor !== anchor) return;
    if (source === 'pointer' && document.activeElement === anchor) return;
    if (source === 'focus' && anchor.matches(':hover')) return;
    if (source === 'pointer') {
      tooltipHideTimer = setTimeout(() => closeTooltip(), 120);
      return;
    }
    closeTooltip();
  }

  function keepTooltipOpen(): void {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  }

  function dismissTooltip(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeTooltip();
  }

  function closeTooltip(): void {
    tooltipOpen = false;
    tooltipAnchor = undefined;
    tooltipHideTimer = setTimeout(() => {
      if (!tooltipOpen && tooltipElement?.matches(':popover-open')) {
        tooltipElement.hidePopover();
        tooltipDimension = null;
      }
    }, 160);
  }

  function positionTooltip(): void {
    if (!tooltipAnchor || !tooltipElement) return;
    const anchorRect = tooltipAnchor.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const inset = 8;
    const gap = 7;
    const viewportMinLeft = inset;
    const viewportMaxLeft = Math.max(inset, viewportWidth - inset - tooltipRect.width);
    tooltipLeft = clamp(
      anchorRect.left + (anchorRect.width - tooltipRect.width) / 2,
      viewportMinLeft,
      viewportMaxLeft
    );

    const aboveTop = anchorRect.top - gap - tooltipRect.height;
    const belowTop = anchorRect.bottom + gap;
    const fitsAbove = aboveTop >= inset;
    const fitsBelow = belowTop + tooltipRect.height <= viewportHeight - inset;
    const placeBelow = !fitsAbove && (fitsBelow || anchorRect.top < viewportHeight / 2);
    const preferredTop = placeBelow ? belowTop : aboveTop;
    tooltipTop = clamp(
      preferredTop,
      inset,
      Math.max(inset, viewportHeight - inset - tooltipRect.height)
    );
    tooltipRevealY = placeBelow ? '-0.25rem' : '0.25rem';
  }

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
  }

  $effect(() => {
    if (!tooltipOpen) return;
    const reposition = () => positionTooltip();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  });
</script>

<div
  class="access-presentation"
  role="group"
  aria-label={copy['accessSymbols.label'].replace('{name}', placeName)}
>
  {#if presentation.kind === 'complex'}
    {@const detailId = `${componentId}-complex-detail`}
    {@const explanation = copy['accessSymbols.differentConditionsDetail'].replace(
      '{count}',
      String(presentation.conditionCount)
    )}
    <button
      type="button"
      class="symbol complex special"
      data-access-icon="question"
      aria-label={copy['accessSymbols.differentConditions']}
      aria-expanded={activeDimension === 'complex'}
      aria-controls={activeDimension === 'complex' ? detailId : undefined}
      aria-describedby={tooltipOpen && tooltipDimension === 'complex' ? tooltipId : undefined}
      onpointerenter={(event) => showTooltip(event.currentTarget, 'complex', explanation)}
      onpointerleave={(event) => hideTooltip(event.currentTarget, 'pointer')}
      onfocus={(event) => showTooltip(event.currentTarget, 'complex', explanation)}
      onblur={(event) => hideTooltip(event.currentTarget, 'focus')}
      onkeydown={dismissTooltip}
      onclick={() => {
        closeTooltip();
        activeDimension = activeDimension === 'complex' ? null : 'complex';
        announce(activeDimension === 'complex' ? explanation : '');
        onOpenDetails();
      }}
    >
      <span class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"
          ><circle cx="12" cy="12" r="9" /><path
            d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.1-1.5 2.2"
          /><path d="M12 16.5h.01" /></svg
        >
      </span>
      <span>{copy['accessSymbols.differentConditions']}</span>
    </button>
    {#if activeDimension === 'complex'}
      <p id={detailId} class="persistent-detail" data-access-detail>
        {explanation}
      </p>
    {/if}
  {:else}
    <div class="symbols">
      {#each presentation.symbols as symbol (symbol.dimension)}
        {@const detailId = `${componentId}-${symbol.dimension}-detail`}
        <button
          type="button"
          class="symbol"
          data-access-icon={iconName(symbol)}
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
          aria-describedby={tooltipOpen && tooltipDimension === symbol.dimension
            ? tooltipId
            : undefined}
          onpointerenter={(event) =>
            showTooltip(event.currentTarget, symbol.dimension, fullExplanation(symbol))}
          onpointerleave={(event) => hideTooltip(event.currentTarget, 'pointer')}
          onfocus={(event) =>
            showTooltip(event.currentTarget, symbol.dimension, fullExplanation(symbol))}
          onblur={(event) => hideTooltip(event.currentTarget, 'focus')}
          onkeydown={dismissTooltip}
          onclick={() => {
            closeTooltip();
            activate(symbol);
          }}
        >
          <span class="icon" aria-hidden="true">
            {#if symbol.state === 'unrestricted'}
              <svg viewBox="0 0 24 24"
                ><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></svg
              >
            {:else if symbol.state === 'special'}
              <svg viewBox="0 0 24 24"
                ><circle cx="12" cy="12" r="9" /><path
                  d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.1-1.5 2.2"
                /><path d="M12 16.5h.01" /></svg
              >
            {:else if symbol.state === 'not_stated'}
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>
            {:else if symbol.state === 'indoors'}
              <svg class="symbol-fill" viewBox="0 0 15 15"
                ><path
                  d="M3 7v8H1V7.78l-1 .38V6l15-5v2.14zm2.5-.14v1.27c0 .47.26.89.67 1.1.44-.22.92-.34 1.41-.34h1.55l2.7 2.76v1.85c0 .09.04.18.1.24l.47.48c.06.07.1.15.1.24v.2c0 .19-.15.34-.33.34h-.87c-.08 0-.17-.04-.23-.1l-.47-.48a.35.35 0 0 1-.1-.24v-1.55c0-.19-.15-.34-.33-.34H8.04c-.13 0-.24.07-.3.18l-.47.95c-.06.13-.03.29.07.4l.4.4q.09.105.09.24v.2c0 .19-.15.34-.33.34h-.86a.35.35 0 0 1-.24-.1l-.47-.48a.35.35 0 0 1-.1-.24v-3.11a.34.34 0 0 0-.09-.24l-.65-.66c-.38-.38-.59-.9-.59-1.44v-.18c0-.63.31-1.23.83-1.58zm6-1.36c.18 0 .33.15.33.34v.81c0 .13.07.24.19.3l2.18 1.11c.18.1.3.29.3.49v.06c0 .18-.07.35-.2.48l-.47.48H12.5l-.43.88-2.22-2.26 1.22-2.5a.34.34 0 0 1 .3-.19z"
                /></svg
              >
            {:else if symbol.state === 'leash_required'}
              <svg class="symbol-fill" viewBox="0 0 15 15"
                ><path
                  d="M1.5 3v1.88c0 .69.39 1.31 1 1.62.66-.33 1.38-.5 2.12-.5h2.32L11 10.06v2.73q0 .21.15.36l.7.7q.15.15.15.36v.29c0 .28-.22.5-.5.5h-1.29q-.21 0-.36-.15l-.7-.7Q9 14 9 13.79V11.5c0-.28-.22-.5-.5-.5H5.31c-.19 0-.36.11-.45.28l-.7 1.4c-.1.19-.06.42.09.57l.6.6q.15.15.15.36v.29c0 .28-.22.5-.5.5H3.21q-.21 0-.36-.15l-.7-.7Q2 14 2 13.79V9.21q0-.21-.15-.36l-.97-.97C.32 7.32 0 6.55 0 5.76V5.5c0-.94.47-1.81 1.25-2.33zm9-2c.28 0 .5.22.5.5v1.19c0 .19.11.36.28.45l3.27 1.64c.28.13.45.41.45.72v.09c0 .26-.11.52-.29.7L14 7h-2l-.65 1.29-3.33-3.33 1.84-3.68c.09-.17.26-.28.45-.28zM3.06 0l4.97 4.97-1.06 1.06L.94 0z"
                /></svg
              >
            {:else if symbol.state === 'off_leash_permitted'}
              <svg class="symbol-fill" viewBox="0 0 15 15"
                ><path
                  d="M1.5 3v1.88c0 .69.39 1.31 1 1.62.66-.33 1.38-.5 2.12-.5h2.32L11 10.06v2.73q0 .21.15.36l.7.7q.15.15.15.36v.29c0 .28-.22.5-.5.5h-1.29q-.21 0-.36-.15l-.7-.7Q9 14 9 13.79V11.5c0-.28-.22-.5-.5-.5H5.31c-.19 0-.36.11-.45.28l-.7 1.4c-.1.19-.06.42.09.57l.6.6q.15.15.15.36v.29c0 .28-.22.5-.5.5H3.21q-.21 0-.36-.15l-.7-.7Q2 14 2 13.79V9.21q0-.21-.15-.36l-.97-.97C.32 7.32 0 6.55 0 5.76V5.5c0-.94.47-1.81 1.25-2.33zm9-2c.28 0 .5.22.5.5v1.19c0 .19.11.36.28.45l3.27 1.64c.28.13.45.41.45.72v.09c0 .26-.11.52-.29.7L14 7h-2l-.65 1.29-3.33-3.33 1.84-3.68c.09-.17.26-.28.45-.28z"
                /></svg
              >
            {:else if symbol.state === 'carrier_required'}
              <!-- Pet-carrier silhouette adapted from SVG Repo 395169, CC0. -->
              <svg class="symbol-fill" viewBox="0 -0.5 17 17"
                ><path
                  d="M12.504 3.037h-.535V2.022C11.969 1.458 11.523 1 10.974 1H7.032c-.549 0-.994.458-.994 1.022v1.015h-.543C1.813 3.037 1.001 14.826 1.001 14.826c0 .58.514 1.054 1.147 1.054h13.704c.634 0 1.148-.474 1.148-1.054 0 0-.883-11.789-4.496-11.789ZM6.958 11.017V8.934H11v2.083Zm4.082.983v2H6.988v-2Zm-.009-6.083v2.104H6.958V5.917Zm3.661 2.104h-2.755V5.917h2.125c.251.639.459 1.366.63 2.104Zm-8.661 0H3.285c.165-.729.367-1.473.615-2.104h2.131Zm-.01.913v2.083H2.75c.086-.616.196-1.36.346-2.083Zm5.958-.031H14.9c.153.731.271 1.489.359 2.113h-3.28ZM6.977 2.185c0-.17.148-.309.33-.309H10.7c.182 0 .33.139.33.309v.853H6.977ZM2.517 13.226S2.553 12.776 2.65 12h3.371v2H3.365c-.469 0-.848-.349-.848-.774ZM14.629 14H11.98v-2h3.362c.1.768.141 1.233.141 1.233-.001.422-.385.767-.854.767Z"
                /></svg
              >
            {:else if symbol.state === 'small_dogs_only'}
              <svg viewBox="0 0 18 18"
                ><g fill="currentColor" stroke="none" transform="translate(1.2 5.2) scale(.58)"
                  ><path
                    d="M1.5 3v1.88c0 .69.39 1.31 1 1.62.66-.33 1.38-.5 2.12-.5h2.32L11 10.06v2.73q0 .21.15.36l.7.7q.15.15.15.36v.29c0 .28-.22.5-.5.5h-1.29q-.21 0-.36-.15l-.7-.7Q9 14 9 13.79V11.5c0-.28-.22-.5-.5-.5H5.31c-.19 0-.36.11-.45.28l-.7 1.4c-.1.19-.06.42.09.57l.6.6q.15.15.15.36v.29c0 .28-.22.5-.5.5H3.21q-.21 0-.36-.15l-.7-.7Q2 14 2 13.79V9.21q0-.21-.15-.36l-.97-.97C.32 7.32 0 6.55 0 5.76V5.5c0-.94.47-1.81 1.25-2.33zm9-2c.28 0 .5.22.5.5v1.19c0 .19.11.36.28.45l3.27 1.64c.28.13.45.41.45.72v.09c0 .26-.11.52-.29.7L14 7h-2l-.65 1.29-3.33-3.33 1.84-3.68c.09-.17.26-.28.45-.28z"
                  /></g
                ><path d="M15 4v10M13.5 5.5 15 4l1.5 1.5M13.5 12.5 15 14l1.5-1.5" /></svg
              >
            {:else if symbol.state === 'ask_on_arrival'}
              <svg viewBox="0 0 24 24"
                ><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path
                  d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.1-1.5 2"
                /><path d="M12 16h.01" /></svg
              >
            {:else if symbol.state === 'limited'}
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg
              >
            {/if}
          </span>
          <span class="chip-label" aria-hidden="true">{label(symbol)}</span>
        </button>
      {/each}
    </div>
    {#if activeDimension}
      {@const activeSymbol = presentation.symbols.find(
        (symbol) => symbol.dimension === activeDimension
      )}
      {#if activeSymbol}
        <div
          id={`${componentId}-${activeSymbol.dimension}-detail`}
          class="persistent-detail"
          data-access-detail
        >
          <p>
            <strong>{label(activeSymbol)}</strong>
            {fullExplanation(activeSymbol)}
          </p>
          {@render editor?.({ dimension: activeSymbol.dimension, announce })}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<p class="visually-hidden" role="status" aria-live="polite" data-access-announcement>
  {announcement}
</p>

<span
  use:portal
  bind:this={tooltipElement}
  id={tooltipId}
  data-access-tooltip
  data-open={tooltipOpen}
  class="tooltip"
  role="tooltip"
  aria-hidden="true"
  popover="manual"
  style:left={`${tooltipLeft}px`}
  style:top={`${tooltipTop}px`}
  style:--tooltip-reveal-y={tooltipRevealY}
  onpointerenter={keepTooltipOpen}
  onpointerleave={closeTooltip}
>
  {tooltipText}
</span>

<style>
  .access-presentation {
    display: grid;
    gap: 0.55rem;
  }

  .symbols {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: start;
  }

  .symbol {
    position: relative;
    display: inline-flex;
    gap: 0.4rem;
    min-height: 2rem;
    align-items: center;
    padding: 0.28rem 0.65rem 0.28rem 0.4rem;
    border: 1px solid var(--hv-access-symbol-border, var(--hv-color-basalt));
    border-radius: 999px;
    background: var(--hv-access-area);
    color: var(--hv-color-basalt);
    font: inherit;
    /* The lift is motion, so it collapses under reduced motion; the border and shadow are
       appearance changes that stay put, so they ride the fade family at full duration. */
    transition:
      border-color var(--hv-fade-quick) var(--hv-ease-settle),
      transform var(--hv-motion-quick) var(--hv-ease-settle),
      box-shadow var(--hv-fade-quick) var(--hv-ease-settle);
  }

  .chip-label {
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.05;
    white-space: nowrap;
  }

  .symbol.restraint {
    background: var(--hv-access-restraint);
  }
  .symbol.permission {
    background: var(--hv-access-permission);
  }
  .symbol.dogs {
    background: var(--hv-access-eligibility);
  }
  .symbol.timing {
    background: var(--hv-access-timing);
  }
  .symbol.special {
    background: var(--hv-access-special);
  }
  .symbol.not-stated {
    background: var(--hv-access-unknown);
    color: var(--hv-access-unknown-foreground);
  }

  .symbol:hover,
  .symbol:focus-visible,
  .symbol[aria-expanded='true'] {
    z-index: 4;
    border-color: var(--hv-color-fjord);
    box-shadow: 0 0.35rem 0.9rem rgb(20 41 39 / 14%);
    transform: translateY(-2px);
  }

  .symbol:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }

  .icon,
  .icon svg {
    display: block;
    width: 1.3rem;
    height: 1.3rem;
    flex: 0 0 auto;
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

  .icon svg.symbol-fill {
    fill: currentColor;
    stroke: none;
  }

  .tooltip {
    position: fixed;
    z-index: 100;
    inset: unset;
    box-sizing: border-box;
    width: max-content;
    max-width: min(18rem, calc(100vw - 1rem));
    max-height: calc(100dvh - 1rem);
    margin: 0;
    overflow: auto;
    padding: 0.5rem 0.65rem;
    border: 0;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    box-shadow: 0 0.55rem 1.5rem rgb(30 45 49 / 22%);
    color: var(--hv-color-snow-raised);
    font-family: var(--hv-font-ui);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.35;
    /* Visibility flips instantly so an accessibility scan never samples a
       half-faded tooltip; only the slide is animated. */
    opacity: 0;
    pointer-events: auto;
    text-align: left;
    transform: translateY(var(--tooltip-reveal-y, 0.25rem));
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  .tooltip[data-open='true'] {
    opacity: 1;
    transform: translateY(0);
  }

  .complex {
    width: 100%;
    height: auto;
    min-height: 2.75rem;
    border-radius: var(--hv-radius-control);
    gap: 0.55rem;
    justify-content: start;
    padding: 0.65rem 0.8rem;
    font-weight: 800;
  }

  .persistent-detail {
    margin: 0;
    padding: 0.6rem 0.7rem;
    border-inline-start: 0.3rem solid var(--hv-access-detail-accent, var(--hv-color-signal));
    border-radius: 0.4rem;
    background: var(--hv-color-snow-raised);
    font-size: 0.78rem;
    line-height: 1.4;
    /* The detail carries text, so the reveal is transform-only: words arrive at full contrast
       and move into place (see the fade-family limit in tokens.css). */
    animation: reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  .persistent-detail p {
    margin: 0;
  }

  .persistent-detail strong {
    display: block;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes reveal {
    from {
      transform: translateY(-0.2rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
