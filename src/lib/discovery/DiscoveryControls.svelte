<script lang="ts">
  import type { Catalogue } from '$i18n';

  import {
    activeFilterCount,
    type DiscoveryCategory,
    type DiscoveryChip,
    type DiscoveryDistanceKm,
    type DiscoveryFilters
  } from './state';

  interface Props {
    filters: DiscoveryFilters;
    areas: string[];
    resultCount: number;
    filtersOpen: boolean;
    resultsOpen: boolean;
    selectionActive?: boolean;
    copy: Catalogue;
    locationState: 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';
    suggestHref: string;
    showSuggest: boolean;
    signedIn?: boolean;
    favouritesAvailable?: boolean;
    onQueryChange: (query: string) => void;
    onFiltersChange: (filters: DiscoveryFilters) => void;
    onChipToggle: (chip: DiscoveryChip) => void;
    onClear: () => void;
    onFold?: () => void;
    onUseLocation: () => void;
    onRetryLocation: () => void;
    onToggleFilters: () => void;
  }

  let {
    filters,
    areas,
    resultCount,
    filtersOpen,
    resultsOpen,
    selectionActive = false,
    copy,
    locationState,
    suggestHref,
    showSuggest,
    signedIn = false,
    favouritesAvailable = true,
    onQueryChange,
    onFiltersChange,
    onChipToggle,
    onClear,
    onFold,
    onUseLocation,
    onRetryLocation,
    onToggleFilters
  }: Props = $props();
  let searchInput = $state<HTMLInputElement>();
  // The badge counts only the sheet's own filters: category and query already
  // announce themselves through the chips and the search pill.
  const count = $derived(activeFilterCount({ ...filters, category: null, query: '' }));
  // Arrival keeps every chip quiet: "All" only reads active once the
  // unfiltered, unsearched list is open.
  const allActive = $derived(
    filters.category === null && resultsOpen && filters.query.trim() === ''
  );
  const categoryChips = $derived([
    { chip: 'all' as const, label: copy['directory.categoryAllShort'], active: allActive },
    {
      chip: 'food_drink' as const,
      label: copy['directory.categoryFoodShort'],
      active: filters.category === 'food_drink'
    },
    {
      chip: 'shopping' as const,
      label: copy['directory.categoryShoppingShort'],
      active: filters.category === 'shopping'
    },
    {
      chip: 'outdoors' as const,
      label: copy['directory.categoryOutdoorsShort'],
      active: filters.category === 'outdoors'
    }
  ]);

  function value(event: Event): string {
    return event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : '';
  }

  function patchFilters(patch: Partial<DiscoveryFilters>): void {
    onFiltersChange({ ...filters, ...patch });
  }

  function clearFilters(): void {
    onClear();
    searchInput?.focus();
  }
</script>

<!-- Floating command cluster: every control is its own pill over the map,
     and the gaps between pills stay transparent to map gestures. -->
<section
  class="discovery-controls grid justify-items-start w-full gap-2 pointer-events-none"
  aria-label={copy['directory.filters']}
>
  <label
    class="search-label group/search flex items-center w-full min-h-control gap-[0.55rem] py-0 px-[1.1rem] border border-border-subtle rounded-[999px] bg-snow-raised shadow-raised pointer-events-auto focus-within:outline-[3px] focus-within:outline-focus-ring focus-within:outline-offset-[3px] focus-within:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
  >
    <!-- The icon takes full ink while the field has focus, so the pill reads as live without
         moving anything the Member is trying to type into. Colour, so reduced motion keeps it. -->
    <svg
      class="search-icon flex-[0_0_auto] w-[1.1rem] h-[1.1rem] stroke-basalt-muted transition-[stroke] duration-[var(--hv-fade-quick)] ease-linear group-focus-within/search:stroke-basalt"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.75" fill="none" stroke-width="2.2" />
      <line x1="15.6" y1="15.6" x2="21" y2="21" stroke-width="2.2" stroke-linecap="round" />
    </svg>
    <span
      class="absolute w-px h-px -m-px p-0 overflow-hidden border-0 whitespace-nowrap [clip:rect(0,0,0,0)]"
      >{copy['directory.searchLabel']}</span
    >
    <input
      class="min-w-0 min-h-0 flex-1 py-[0.45rem] px-0 border-0 bg-transparent [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-none focus-visible:shadow-none"
      bind:this={searchInput}
      type="search"
      value={filters.query}
      placeholder={copy['directory.searchPlaceholder']}
      oninput={(event) => onQueryChange(event.currentTarget.value)}
    />
  </label>

  <!-- The compact answer card owns the screen during a selection: the edge
       tab carries the slice, so the chip row steps aside until ✕/Esc. -->
  <!-- Every pill in the command cluster answers the same way: it lifts to say it can be pressed
       and presses in to confirm it was.

       Movement only - the colour swap is deliberately instant. Selecting a chip inverts its pair
       (basalt on snow becomes snow on fjord), so interpolating between them walks the label
       straight through the middle where it matches its own background: Axe measured 2.41:1 there
       against the required 4.5:1. An inverted pair has no safe path between its ends, so the
       toggle lands in one frame and only the transform is allowed to take time. -->
  <div
    class="shortcut-row flex flex-wrap min-w-0 gap-[0.3rem] pointer-events-none [&[hidden]]:hidden"
    hidden={selectionActive}
  >
    <div
      class="category-shortcuts contents"
      role="group"
      aria-label={copy['directory.categoryFilter']}
    >
      {#each categoryChips as { chip, label, active } (chip)}
        <button
          type="button"
          data-chip={chip}
          class="min-h-[2.1rem] py-[0.3rem] px-[0.85rem] border border-border-subtle rounded-[999px] bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] text-[0.8rem] font-[850] tracking-[-0.015em] text-basalt whitespace-nowrap shadow-raised cursor-pointer pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle [&.active]:border-fjord [&.active]:bg-fjord [&.active]:text-snow-raised enabled:hover:transform-[translateY(-1px)] enabled:active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
          class:active
          aria-pressed={active}
          aria-label={label}
          aria-controls="discovery-results"
          onclick={() => onChipToggle(chip)}
        >
          {label}{#if active}<span
              class="chip-meta ml-[0.3rem] whitespace-nowrap"
              aria-hidden="true">· {resultCount}{resultsOpen ? ' ✕' : ''}</span
            >{/if}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="filters-button min-h-[2.1rem] py-[0.3rem] px-[0.85rem] border border-border-subtle rounded-[999px] bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] text-[0.8rem] font-[850] tracking-[-0.015em] text-basalt whitespace-nowrap shadow-raised cursor-pointer pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle [&.active]:border-fjord [&.active]:bg-fjord [&.active]:text-snow-raised hover:transform-[translateY(-1px)] active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
      class:active={count > 0}
      aria-expanded={filtersOpen}
      aria-controls="discovery-filter-sheet"
      onclick={onToggleFilters}
    >
      {filtersOpen ? copy['directory.hideFilters'] : copy['directory.moreFilters']}
      {#if count > 0}<span
          class="inline-grid place-items-center min-w-[1.15rem] min-h-[1.15rem] ml-[0.3rem] rounded-[999px] bg-basalt text-[0.7rem] text-snow-raised [.filters-button.active_&]:bg-snow-raised [.filters-button.active_&]:text-basalt"
          aria-hidden="true">{count}</span
        >{/if}
    </button>
    {#if onFold}
      <button
        type="button"
        class="fold-button grid place-items-center w-[2.1rem] min-h-[2.1rem] p-0 border border-border-subtle rounded-[999px] bg-snow-raised text-basalt-muted shadow-raised cursor-pointer pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle hover:transform-[translateY(-1px)] active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
        aria-label={copy['directory.foldChrome']}
        onclick={onFold}
      >
        <svg class="w-4 h-4 stroke-current" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 14.5l7-6 7 6"
            fill="none"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    {/if}
  </div>

  {#if showSuggest}
    <div class="suggest-row flex pointer-events-none">
      <!-- A full navigation (not a client-side route transition) keeps the destination's own
           sign-in handoff deterministic instead of racing the SPA router's async goto(). -->
      <!-- eslint-disable svelte/no-navigation-without-resolve -- suggestHref is pre-resolved by the caller with $app/paths resolve() -->
      <a
        class="suggest-link inline-block py-[0.4rem] px-[0.85rem] border border-moss rounded-[999px] bg-moss-soft text-[0.85rem] font-extrabold text-basalt no-underline shadow-raised pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle hover:transform-[translateY(-1px)] active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
        href={suggestHref}
        data-sveltekit-reload>{copy['directory.suggestMissingPlace']}</a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    </div>
  {/if}

  {#if filtersOpen}
    <!-- The shell tightens this ceiling further on compact viewports, where the suggest pill owns a
         band along the bottom edge; see the `--suggest-dock-reserve` rules in MapListShell. -->
    <div
      id="discovery-filter-sheet"
      class="filter-sheet grid w-full max-h-[min(28rem,52dvh)] gap-[0.65rem] p-[0.9rem] border border-border-subtle rounded-panel bg-snow-raised shadow-floating overflow-auto overscroll-contain pointer-events-auto"
    >
      <!-- Wide enough that a select's 3px-offset focus ring clears the label. -->
      <div
        class="filter-grid grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[0.55rem] [@container_directory-shell_(max-width:28rem)]:grid-cols-1"
      >
        {#if signedIn && favouritesAvailable}
          <!-- Original .favorites-only display, gap, and color declarations lost to the more
               specific .filter-sheet label rule and therefore remain dead. -->
          <label
            class="favorites-only grid items-center col-[1/-1] min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted"
          >
            <input
              class="w-[1.1rem] min-h-[1.1rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
              type="checkbox"
              checked={filters.favoritesOnly}
              onchange={(event) => patchFilters({ favoritesOnly: event.currentTarget.checked })}
            />
            <span>{copy['directory.favoritesOnly']}</span>
          </label>
        {/if}
        <label class="grid min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted">
          <span>{copy['directory.categoryFilter']}</span>
          <select
            id="discovery-category-filter"
            class="w-full min-h-control py-[0.45rem] px-[0.65rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            value={filters.category ?? ''}
            onchange={(event) =>
              patchFilters({ category: (value(event) || null) as DiscoveryCategory | null })}
          >
            <option value="">{copy['directory.allCategories']}</option>
            <option value="food_drink">{copy['directory.categoryFoodDrink']}</option>
            <option value="shopping">{copy['directory.categoryShopping']}</option>
            <option value="outdoors">{copy['directory.categoryOutdoors']}</option>
            <option value="accommodation">{copy['directory.categoryAccommodation']}</option>
            <option value="public_cultural">{copy['directory.categoryPublicCultural']}</option>
          </select>
        </label>

        <label class="grid min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted">
          <span>{copy['directory.areaFilter']}</span>
          <select
            class="w-full min-h-control py-[0.45rem] px-[0.65rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            value={filters.area ?? ''}
            onchange={(event) => patchFilters({ area: value(event) || null })}
          >
            <option value="">{copy['directory.allAreas']}</option>
            {#each areas as area (area)}
              <option value={area}>{area}</option>
            {/each}
          </select>
        </label>

        <label class="grid min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted">
          <span>{copy['directory.accessFilter']}</span>
          <select
            class="w-full min-h-control py-[0.45rem] px-[0.65rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            value={filters.accessArea ?? ''}
            onchange={(event) =>
              patchFilters({
                accessArea: (value(event) || null) as DiscoveryFilters['accessArea']
              })}
          >
            <option value="">{copy['directory.anyAccess']}</option>
            <option value="indoors">{copy['access.indoor']}</option>
            <option value="outdoors">{copy['access.outdoor']}</option>
            <option value="designated_area">{copy['access.designated']}</option>
            <option value="other_bounded">{copy['access.otherBounded']}</option>
          </select>
        </label>

        <label class="grid min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted">
          <span>{copy['directory.restraintFilter']}</span>
          <select
            class="w-full min-h-control py-[0.45rem] px-[0.65rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            value={filters.restraintCondition ?? ''}
            onchange={(event) =>
              patchFilters({
                restraintCondition: (value(event) || null) as DiscoveryFilters['restraintCondition']
              })}
          >
            <option value="">{copy['directory.anyRestraint']}</option>
            <option value="leash_required">{copy['access.leashRequired']}</option>
            <option value="off_leash_permitted">{copy['access.offLeash']}</option>
            <option value="carrier_required">{copy['access.carrierRequired']}</option>
            <option value="other_sourced">{copy['access.otherSourced']}</option>
          </select>
        </label>

        <label class="grid min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted">
          <span>{copy['directory.permissionFilter']}</span>
          <select
            class="w-full min-h-control py-[0.45rem] px-[0.65rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            value={filters.permissionRequirement ?? ''}
            onchange={(event) =>
              patchFilters({
                permissionRequirement: (value(event) ||
                  null) as DiscoveryFilters['permissionRequirement']
              })}
          >
            <option value="">{copy['directory.anyPermission']}</option>
            <option value="standing_permission">{copy['access.standingPermission']}</option>
            <option value="ask_on_arrival">{copy['access.askOnArrival']}</option>
            <option value="advance_approval">{copy['access.advanceApproval']}</option>
          </select>
        </label>

        <label class="grid min-w-0 gap-[0.4rem] text-[0.76rem] font-extrabold text-basalt-muted">
          <span>{copy['directory.distanceFilter']}</span>
          <select
            class="w-full min-h-control py-[0.45rem] px-[0.65rem] box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            value={filters.distanceKm ?? ''}
            disabled={locationState !== 'ready'}
            onchange={(event) =>
              patchFilters({
                distanceKm: value(event) ? (Number(value(event)) as DiscoveryDistanceKm) : null
              })}
          >
            <option value="">{copy['directory.anyDistance']}</option>
            {#each [1, 3, 5, 10, 25] as distance (distance)}
              <option value={distance}>
                {copy['directory.distanceOption'].replace('{distance}', String(distance))}
              </option>
            {/each}
          </select>
        </label>
      </div>

      <!-- Original .secondary background and .clear border/color declarations lost to the more
           specific .filter-sheet button rule and therefore remain dead. -->
      <div class="filter-actions flex flex-wrap gap-2">
        {#if locationState === 'denied' || locationState === 'unavailable'}
          <button
            type="button"
            class="secondary min-h-control py-[0.45rem] px-3 box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt cursor-pointer pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle enabled:hover:transform-[translateY(-1px)] enabled:active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            onclick={onRetryLocation}
          >
            {copy['directory.tryLocationAgain']}
          </button>
        {:else}
          <button
            type="button"
            class="secondary min-h-control py-[0.45rem] px-3 box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt cursor-pointer pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle enabled:hover:transform-[translateY(-1px)] enabled:active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            disabled={locationState === 'locating'}
            onclick={onUseLocation}
          >
            {locationState === 'locating'
              ? copy['directory.locating']
              : copy['directory.useLocation']}
          </button>
        {/if}
        {#if count > 0}
          <button
            type="button"
            class="clear min-h-control py-[0.45rem] px-3 box-border border border-basalt rounded-control bg-snow-raised [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[760] text-basalt cursor-pointer pointer-events-auto transition-transform duration-[var(--hv-motion-instant)] ease-settle enabled:hover:transform-[translateY(-1px)] enabled:active:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[0.62]"
            onclick={clearFilters}
          >
            {copy['directory.clearFilters']}
          </button>
        {/if}
      </div>

      {#if locationState === 'ready'}
        <p class="location-status grid gap-[0.15rem] m-0 text-[0.8rem]" role="status">
          {copy['directory.locationReady']}
        </p>
      {:else if locationState === 'denied'}
        <div class="location-status grid gap-[0.15rem] m-0 text-[0.8rem]" role="status">
          <strong>{copy['directory.locationDenied']}</strong>
          <span>{copy['directory.locationDeniedHelp']}</span>
        </div>
      {:else if locationState === 'unavailable'}
        <p class="location-status grid gap-[0.15rem] m-0 text-[0.8rem]" role="status">
          {copy['directory.locationUnavailable']}
        </p>
      {/if}
    </div>
  {/if}
</section>
