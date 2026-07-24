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

<section class="discovery-controls" aria-label={copy['directory.filters']}>
  <label class="search-label">
    <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.75" fill="none" stroke-width="2.2" />
      <line x1="15.6" y1="15.6" x2="21" y2="21" stroke-width="2.2" stroke-linecap="round" />
    </svg>
    <span>{copy['directory.searchLabel']}</span>
    <input
      bind:this={searchInput}
      type="search"
      value={filters.query}
      placeholder={copy['directory.searchPlaceholder']}
      oninput={(event) => onQueryChange(event.currentTarget.value)}
    />
  </label>

  <!-- The compact answer card owns the screen during a selection: the edge
       tab carries the slice, so the chip row steps aside until ✕/Esc. -->
  <div class="shortcut-row" hidden={selectionActive}>
    <div class="category-shortcuts" role="group" aria-label={copy['directory.categoryFilter']}>
      {#each categoryChips as { chip, label, active } (chip)}
        <button
          type="button"
          data-chip={chip}
          class:active
          aria-pressed={active}
          aria-label={label}
          aria-controls="discovery-results"
          onclick={() => onChipToggle(chip)}
        >
          {label}{#if active}<span class="chip-meta" aria-hidden="true"
              >· {resultCount}{resultsOpen ? ' ✕' : ''}</span
            >{/if}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="filters-button"
      class:active={count > 0}
      aria-expanded={filtersOpen}
      aria-controls="discovery-filter-sheet"
      onclick={onToggleFilters}
    >
      {filtersOpen ? copy['directory.hideFilters'] : copy['directory.moreFilters']}
      {#if count > 0}<span aria-hidden="true">{count}</span>{/if}
    </button>
    {#if onFold}
      <button
        type="button"
        class="fold-button"
        aria-label={copy['directory.foldChrome']}
        onclick={onFold}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
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
    <div class="suggest-row">
      <!-- A full navigation (not a client-side route transition) keeps the destination's own
           sign-in handoff deterministic instead of racing the SPA router's async goto(). -->
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- suggestHref is pre-resolved by the caller with $app/paths resolve() -->
      <a class="suggest-link" href={suggestHref} data-sveltekit-reload
        >{copy['directory.suggestMissingPlace']}</a
      >
    </div>
  {/if}

  {#if filtersOpen}
    <div id="discovery-filter-sheet" class="filter-sheet">
      <div class="filter-grid">
        {#if signedIn && favouritesAvailable}
          <label class="favorites-only">
            <input
              type="checkbox"
              checked={filters.favoritesOnly}
              onchange={(event) => patchFilters({ favoritesOnly: event.currentTarget.checked })}
            />
            <span>{copy['directory.favoritesOnly']}</span>
          </label>
        {/if}
        <label>
          <span>{copy['directory.categoryFilter']}</span>
          <select
            id="discovery-category-filter"
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

        <label>
          <span>{copy['directory.areaFilter']}</span>
          <select
            value={filters.area ?? ''}
            onchange={(event) => patchFilters({ area: value(event) || null })}
          >
            <option value="">{copy['directory.allAreas']}</option>
            {#each areas as area (area)}
              <option value={area}>{area}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>{copy['directory.accessFilter']}</span>
          <select
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

        <label>
          <span>{copy['directory.restraintFilter']}</span>
          <select
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

        <label>
          <span>{copy['directory.permissionFilter']}</span>
          <select
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

        <label>
          <span>{copy['directory.distanceFilter']}</span>
          <select
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

      <div class="filter-actions">
        {#if locationState === 'denied' || locationState === 'unavailable'}
          <button type="button" class="secondary" onclick={onRetryLocation}>
            {copy['directory.tryLocationAgain']}
          </button>
        {:else}
          <button
            type="button"
            class="secondary"
            disabled={locationState === 'locating'}
            onclick={onUseLocation}
          >
            {locationState === 'locating'
              ? copy['directory.locating']
              : copy['directory.useLocation']}
          </button>
        {/if}
        {#if count > 0}
          <button type="button" class="clear" onclick={clearFilters}>
            {copy['directory.clearFilters']}
          </button>
        {/if}
      </div>

      {#if locationState === 'ready'}
        <p class="location-status" role="status">{copy['directory.locationReady']}</p>
      {:else if locationState === 'denied'}
        <div class="location-status" role="status">
          <strong>{copy['directory.locationDenied']}</strong>
          <span>{copy['directory.locationDeniedHelp']}</span>
        </div>
      {:else if locationState === 'unavailable'}
        <p class="location-status" role="status">{copy['directory.locationUnavailable']}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Floating command cluster: every control is its own pill over the map,
     and the gaps between pills stay transparent to map gestures. */
  .discovery-controls {
    display: grid;
    width: 100%;
    gap: 0.5rem;
    justify-items: start;
    pointer-events: none;
  }

  .search-label {
    display: flex;
    width: 100%;
    min-height: var(--hv-control-height);
    align-items: center;
    gap: 0.55rem;
    padding: 0 1.1rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 999px;
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
    pointer-events: auto;
  }

  .search-icon {
    width: 1.1rem;
    height: 1.1rem;
    flex: 0 0 auto;
    stroke: var(--hv-color-basalt-muted);
  }

  .search-label > span {
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

  .search-label input {
    min-width: 0;
    min-height: 0;
    flex: 1;
    padding: 0.45rem 0;
    border: 0;
    background: transparent;
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 760;
  }

  .search-label input:focus-visible {
    box-shadow: none;
    outline: none;
  }

  .search-label:focus-within {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .shortcut-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    min-width: 0;
    pointer-events: none;
  }

  .shortcut-row[hidden] {
    display: none;
  }

  .category-shortcuts {
    display: contents;
  }

  button {
    cursor: pointer;
    pointer-events: auto;
  }

  .category-shortcuts button,
  .shortcut-row > .filters-button {
    min-height: 2.1rem;
    padding: 0.3rem 0.85rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 999px;
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 850;
    letter-spacing: -0.015em;
    white-space: nowrap;
  }

  .category-shortcuts button.active,
  button.active {
    border-color: var(--hv-color-fjord);
    background: var(--hv-color-fjord);
    color: var(--hv-color-snow-raised);
  }

  .filters-button span[aria-hidden='true'] {
    display: inline-grid;
    min-width: 1.15rem;
    min-height: 1.15rem;
    margin-left: 0.3rem;
    border-radius: 999px;
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    font-size: 0.7rem;
    place-items: center;
  }

  .filters-button.active span[aria-hidden='true'] {
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
  }

  .chip-meta {
    margin-left: 0.3rem;
    white-space: nowrap;
  }

  .fold-button {
    display: grid;
    width: 2.1rem;
    min-height: 2.1rem;
    padding: 0;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 999px;
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
    color: var(--hv-color-basalt-muted);
    place-items: center;
  }

  .fold-button svg {
    width: 1rem;
    height: 1rem;
    stroke: currentColor;
  }

  .suggest-row {
    display: flex;
    pointer-events: none;
  }

  .suggest-link {
    display: inline-block;
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--hv-color-moss);
    border-radius: 999px;
    background: var(--hv-color-moss-soft);
    box-shadow: var(--hv-shadow-raised);
    color: var(--hv-color-basalt);
    font-size: 0.85rem;
    font-weight: 800;
    pointer-events: auto;
    text-decoration: none;
  }

  .filter-sheet {
    display: grid;
    width: 100%;
    max-height: min(28rem, 52dvh);
    gap: 0.65rem;
    padding: 0.9rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-floating);
    overflow: auto;
    overscroll-behavior: contain;
    pointer-events: auto;
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .filter-sheet label {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.76rem;
    font-weight: 800;
  }

  .filter-sheet input,
  .filter-sheet select,
  .filter-sheet button {
    min-height: var(--hv-control-height);
    box-sizing: border-box;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 760;
  }

  .filter-sheet select {
    width: 100%;
    padding: 0.45rem 0.65rem;
  }

  .filter-sheet button {
    padding: 0.45rem 0.75rem;
  }

  .favorites-only {
    display: flex;
    grid-column: 1 / -1;
    gap: 0.5rem;
    align-items: center;
    color: var(--hv-color-basalt);
  }

  .favorites-only input {
    width: 1.1rem;
    min-height: 1.1rem;
  }

  .filter-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .secondary {
    background: var(--hv-color-moss-soft);
  }

  .clear {
    border-color: var(--hv-color-danger);
    color: var(--hv-color-danger);
  }

  .location-status {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    font-size: 0.8rem;
  }

  button:focus-visible,
  .filter-sheet input:focus-visible,
  .filter-sheet select:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  @container directory-shell (max-width: 28rem) {
    .filter-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
