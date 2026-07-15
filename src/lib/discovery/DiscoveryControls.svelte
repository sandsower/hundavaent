<script lang="ts">
  import type { Catalogue } from '$i18n';

  import {
    activeFilterCount,
    type DiscoveryCategory,
    type DiscoveryDistanceKm,
    type DiscoveryFilters
  } from './state';

  interface Props {
    filters: DiscoveryFilters;
    areas: string[];
    resultCount: number;
    filtersOpen: boolean;
    resultsOpen: boolean;
    copy: Catalogue;
    locationState: 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';
    suggestHref: string;
    showSuggest: boolean;
    onQueryChange: (query: string) => void;
    onFiltersChange: (filters: DiscoveryFilters) => void;
    onClear: () => void;
    onShowResults: () => void;
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
    copy,
    locationState,
    suggestHref,
    showSuggest,
    onQueryChange,
    onFiltersChange,
    onClear,
    onShowResults,
    onUseLocation,
    onRetryLocation,
    onToggleFilters
  }: Props = $props();
  let searchInput = $state<HTMLInputElement>();
  let advancedOpen = $state(false);
  const count = $derived(activeFilterCount(filters));

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

<section class="discovery-controls hv-panel" aria-label={copy['directory.filters']}>
  <div class="search-row">
    <label>
      <span>{copy['directory.searchLabel']}</span>
      <input
        bind:this={searchInput}
        type="search"
        value={filters.query}
        placeholder={copy['directory.searchPlaceholder']}
        oninput={(event) => onQueryChange(event.currentTarget.value)}
      />
    </label>
    <button
      type="button"
      class="filters-button"
      class:active={count > 0}
      aria-expanded={filtersOpen}
      aria-controls="discovery-filter-sheet"
      onclick={onToggleFilters}
    >
      {filtersOpen ? copy['directory.hideFilters'] : copy['directory.showFilters']}
      {#if count > 0}<span aria-hidden="true">{count}</span>{/if}
    </button>
    <button
      type="button"
      class="results-button"
      aria-expanded={resultsOpen}
      aria-controls="discovery-results"
      onclick={onShowResults}
    >
      {resultCount === 1
        ? copy['directory.showResultOne']
        : copy['directory.showResults'].replace('{count}', String(resultCount))}
    </button>
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

        <div class="advanced-filters">
          <button
            type="button"
            class="advanced-toggle"
            aria-expanded={advancedOpen}
            onclick={() => (advancedOpen = !advancedOpen)}
          >
            {copy['directory.moreFilters']}
          </button>
          {#if advancedOpen}
            <div class="advanced-grid">
              <label>
                <span>{copy['directory.restraintFilter']}</span>
                <select
                  value={filters.restraintCondition ?? ''}
                  onchange={(event) =>
                    patchFilters({
                      restraintCondition: (value(event) ||
                        null) as DiscoveryFilters['restraintCondition']
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
                      distanceKm: value(event)
                        ? (Number(value(event)) as DiscoveryDistanceKm)
                        : null
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
          {/if}
        </div>
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
  .discovery-controls {
    width: 100%;
    max-height: 100%;
    overflow: auto;
    padding: 1rem;
    border: 0;
    border-radius: 0;
    background: var(--hv-color-snow-raised);
    box-shadow: none;
  }

  .search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: end;
  }

  label {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.76rem;
    font-weight: 800;
  }

  input,
  select,
  button {
    min-height: var(--hv-control-height);
    box-sizing: border-box;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 760;
  }

  input,
  select {
    width: 100%;
    padding: 0.45rem 0.65rem;
  }

  .search-row > label {
    grid-column: 1 / -1;
  }

  .search-row input {
    padding-inline: 0;
    border: 0;
    border-bottom: 2px solid var(--hv-color-basalt);
    border-radius: 0;
    background: transparent;
  }

  button {
    padding: 0.45rem 0.75rem;
    cursor: pointer;
  }

  .results-button {
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
  }

  button.active {
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
  }

  button span[aria-hidden='true'] {
    display: inline-grid;
    min-width: 1.25rem;
    min-height: 1.25rem;
    margin-left: 0.25rem;
    border-radius: 999px;
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    place-items: center;
  }

  /* A quieter, right-aligned secondary action so it stops reading as part of the search flow. */
  .suggest-row {
    display: flex;
    margin-top: 0.55rem;
    justify-content: flex-end;
  }

  .suggest-link {
    display: inline-block;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--hv-color-moss);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-moss-soft);
    color: var(--hv-color-basalt);
    font-size: 0.85rem;
    font-weight: 800;
    text-decoration: none;
  }

  .filter-sheet {
    display: grid;
    gap: 0.65rem;
    margin-top: 0.65rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--hv-border-subtle);
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .advanced-filters {
    grid-column: 1 / -1;
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 0.65rem;
  }

  .advanced-toggle {
    width: fit-content;
    min-height: 0;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--hv-color-fjord);
    font-weight: 900;
    cursor: pointer;
    text-decoration: underline;
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 0.65rem;
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
  input:focus-visible,
  select:focus-visible,
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

  @media (max-width: 48rem) {
    .discovery-controls {
      width: 100%;
      max-height: none;
      overflow: visible;
    }

    .search-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .search-row label {
      grid-column: 1 / -1;
    }

    .filter-grid {
      grid-template-columns: 1fr 1fr;
    }

    .advanced-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 28rem) {
    .filter-grid,
    .advanced-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
