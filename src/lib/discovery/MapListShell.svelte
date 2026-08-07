<script module lang="ts">
  async function loadPublishedPlace(placeId: string, lang: Locale): Promise<PublishedPlaceProfile> {
    const response = await fetch(`/api/places/${encodeURIComponent(placeId)}?lang=${lang}`);
    if (!response.ok) throw new Error('Could not load published Place');
    return response.json() as Promise<PublishedPlaceProfile>;
  }
</script>

<script lang="ts">
  import {
    pushState as sveltePushState,
    replaceState as svelteReplaceState
  } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { cubicBezierEasing, motionDurationsMs, motionEasings } from '$lib/design-system/motion';
  import { subscribeToFavouriteInvalidation } from '$lib/favourites/sync';

  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';
  import PawMark from '$lib/member-activity/PawMark.svelte';
  import MapSurface from '$lib/map/MapSurface.svelte';
  import type { MapAdapter, MapCamera, MapPadding } from '$lib/map/types';

  import DiscoveryControls from './DiscoveryControls.svelte';
  import DiscoveryResults from './DiscoveryResults.svelte';
  import PlaceList from './PlaceList.svelte';
  import SelectedPlaceCard from './SelectedPlaceCard.svelte';
  import SuggestPlacePill from './SuggestPlacePill.svelte';
  import {
    availableAreas,
    filterPublishedPlaces,
    launchCategoryFor,
    reconcileSelectedPlace,
    type GeographicPoint
  } from './filter';
  import {
    clearSessionLocation,
    loadSessionLocation,
    markLocationDenied,
    saveSessionLocation,
    wasLocationDenied
  } from './location';
  import {
    activeFilterCount,
    defaultDiscoveryFilters,
    parseDiscoveryState,
    serializeDiscoveryState,
    toggleChip,
    viewAfterQueryChange,
    type DiscoveryCategory,
    type DiscoveryChip,
    type DiscoveryFilters,
    type DiscoveryState,
    type DiscoveryView
  } from './state';

  interface Props {
    places: PublishedPlaceSummary[];
    lang: Locale;
    copy: Catalogue;
    initialState: DiscoveryState;
    adapter: MapAdapter;
    onStateChange?: (state: DiscoveryState) => void;
    replaceUrl?: (url: string) => void;
    pushUrl?: (url: string) => void;
    loadPlace?: (placeId: string, lang: Locale) => Promise<PublishedPlaceProfile>;
    signedIn?: boolean;
    favouritesAvailable?: boolean;
    initialFavouritePlaceIds?: string[];
    proximityAssistEnabled?: boolean;
    fitPlacesOnMount?: boolean;
  }

  let {
    places,
    lang,
    copy,
    initialState,
    adapter,
    onStateChange,
    replaceUrl = (url) => svelteReplaceState(resolve(url as `/${string}`), {}),
    pushUrl = (url) => sveltePushState(resolve(url as `/${string}`), {}),
    loadPlace = loadPublishedPlace,
    signedIn = false,
    favouritesAvailable = true,
    initialFavouritePlaceIds = [],
    proximityAssistEnabled = false,
    fitPlacesOnMount = false
  }: Props = $props();
  let favouritePlaceIds = $state<string[]>(untrack(() => [...initialFavouritePlaceIds]));
  let favouriteRefreshVersion = 0;
  let discoveryState = $state<DiscoveryState>(
    untrack(() => ({
      selectedPlaceId: initialState.selectedPlaceId,
      camera: { ...initialState.camera },
      view: initialState.view,
      filters: { ...initialState.filters }
    }))
  );
  let announcement = $state('');
  let mapFailed = $state(false);
  let filtersOpen = $state(false);
  // Focus state (state 3): a user gesture on the map quiets the chrome only
  // while it lasts; the sticky fold is always an explicit choice.
  let mapMoving = $state(false);
  let manualFold = $state(false);
  // Dual state (state 6): on wide screens the folded edge tab can re-expand
  // the filtered list beside the open card. Ephemeral, never serialized.
  let dualList = $state(false);
  let clusterPlaceIds = $state<readonly string[] | null>(null);
  const clusterHistoryKey = 'hundavaentClusterPlaceIds';
  let selectionFocusOrigin = $state<HTMLButtonElement | null>(null);
  let openDetailsIntentPlaceId = $state<string | null>(null);
  let responsiveBoundary = $state<HTMLElement>();
  let directorySidebar = $state<HTMLElement>();
  let directoryRailWidth = $state(0);
  let wideDetailLayout = $state(false);
  let persistentRailLayout = $state(false);
  let reducedMotion = $state(false);
  let locationOrigin = $state<GeographicPoint | null>(null);
  let locationState = $state<'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'>('idle');
  // The dot on the map carries the full-precision fix from this visit only. The session copy is
  // deliberately rounded (~100 m) for privacy, which is fine as a filter origin but would draw
  // a "you are here" dot up the street from the reader - so the dot never restores from it.
  let viewerPoint = $state<GeographicPoint | null>(null);
  // Only the locate control moves the camera; the filter sheet's "use my location" keeps the
  // reader's current view and just unlocks the distance filter.
  let locateIntent = false;
  let filteredPlaces = $derived(
    filterPublishedPlaces(places, discoveryState.filters, copy, locationOrigin, favouritePlaceIds)
  );
  // Marker pins show the launch category glyph; places outside the launch
  // taxonomy fall back to the brand paw.
  let mapPlaces = $derived(
    filteredPlaces.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      category: launchCategoryFor(place.category) ?? undefined
    }))
  );
  let selectedPlace = $derived(
    filteredPlaces.find((place) => place.placeId === discoveryState.selectedPlaceId) ?? null
  );
  let resultPlaces = $derived(
    clusterPlaceIds
      ? filteredPlaces.filter((place) => clusterPlaceIds?.includes(place.placeId))
      : filteredPlaces
  );
  // Dual only exists where the list and the card genuinely fit side by side.
  let dualView = $derived(
    dualList && wideDetailLayout && selectedPlace !== null && discoveryState.view === 'list'
  );
  let areas = $derived(availableAreas(places));
  const categoryLabelKeys = {
    food_drink: 'directory.categoryFoodDrink',
    shopping: 'directory.categoryShopping',
    outdoors: 'directory.categoryOutdoors',
    accommodation: 'directory.categoryAccommodation',
    public_cultural: 'directory.categoryPublicCultural'
  } as const satisfies Record<DiscoveryCategory, keyof Catalogue>;
  // The list panel is headed by the active slice's full name; slices without
  // a category (all, search, cluster) keep the generic results title.
  let sliceLabel = $derived(
    discoveryState.filters.category
      ? copy[categoryLabelKeys[discoveryState.filters.category]]
      : null
  );
  const categoryChipLabelKeys = {
    food_drink: 'directory.categoryFoodShort',
    shopping: 'directory.categoryShoppingShort',
    outdoors: 'directory.categoryOutdoorsShort',
    accommodation: 'directory.categoryAccommodation',
    public_cultural: 'directory.categoryPublicCultural'
  } as const satisfies Record<DiscoveryCategory, keyof Catalogue>;
  // The folded state keeps an active filter alive as the dark places pill.
  let focusPillLabel = $derived(
    discoveryState.filters.category
      ? copy[categoryChipLabelKeys[discoveryState.filters.category]]
      : copy['directory.placesInView']
  );
  let suggestionPoint = $derived(selectedPlace ?? discoveryState.camera);
  let suggestHref = $derived(
    `${resolve('/[lang=lang]/suggest', { lang })}?latitude=${formatCoordinate(suggestionPoint.latitude)}&longitude=${formatCoordinate(suggestionPoint.longitude)}`
  );
  let loadedProfiles = $state<Record<string, PublishedPlaceProfile>>({});
  let profileStates = $state<Record<string, { loading: boolean; error: boolean }>>({});
  const profileRequests = new SvelteMap<string, Promise<void>>();
  let selectedProfileKey = $derived(selectedPlace ? profileKey(lang, selectedPlace.placeId) : null);
  let selectedProfile = $derived(
    selectedProfileKey ? (loadedProfiles[selectedProfileKey] ?? null) : null
  );
  let selectedProfileState = $derived(
    selectedProfileKey
      ? (profileStates[selectedProfileKey] ?? { loading: false, error: false })
      : { loading: false, error: false }
  );
  let profileLoading = $derived(selectedProfileState.loading);
  let profileError = $derived(selectedProfileState.error);
  let mapViewportPadding = $derived<MapPadding>(
    // 36 = the wide-layout --hv-space-edge (24px) plus a 12px gap to the card.
    selectedPlace && wideDetailLayout
      ? { top: 12, right: directoryRailWidth + 36, bottom: 12, left: 12 }
      : { top: 0, right: 0, bottom: 0, left: 0 }
  );
  let mapMotionDuration = $derived(reducedMotion ? 0 : motionDurationsMs.traverse);
  // The camera rides the same settle curve as the pin and card it moves with.
  const mapMotionEasing = cubicBezierEasing(motionEasings.settle);
  // Maps a Place ID to its most recent Check-in timestamp (or null once confirmed there is none
  // within the rolling window). Absence of the key means "not yet loaded".
  let checkInStatusByPlaceId = $state<Record<string, string | null>>({});
  const checkInStatusRequests = new SvelteMap<string, Promise<void>>();
  let filterAnalyticsTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedCheckInStatus = $derived(
    selectedPlace ? (checkInStatusByPlaceId[selectedPlace.placeId] ?? null) : null
  );

  $effect(() => {
    const placeId = selectedPlace?.placeId;
    const profile = selectedProfile;
    const { loading, error } = selectedProfileState;
    if (!placeId || profile || loading || error) return;
    const requestedLang = lang;
    void untrack(() => loadSelectedProfile(placeId, requestedLang));
  });

  $effect(() => {
    const placeId = selectedPlace?.placeId;
    if (!placeId || !signedIn) return;
    if (placeId in untrack(() => checkInStatusByPlaceId)) return;
    void untrack(() => loadCheckInStatus(placeId));
  });

  onMount(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncResponsiveState = (
      width = responsiveBoundary?.getBoundingClientRect().width ?? 0
    ) => {
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const rem = Number.isFinite(rootFontSize) ? rootFontSize : 16;
      wideDetailLayout = width >= 76 * rem;
      persistentRailLayout = width >= 58 * rem;
      reducedMotion = reducedMotionQuery.matches;
    };
    const syncReducedMotion = () => syncResponsiveState();
    syncResponsiveState();
    reducedMotionQuery.addEventListener('change', syncReducedMotion);
    const boundaryObserver = responsiveBoundary
      ? new ResizeObserver(([entry]) => {
          if (entry) syncResponsiveState(entry.contentRect.width);
        })
      : null;
    if (responsiveBoundary) boundaryObserver?.observe(responsiveBoundary);
    const railObserver = directorySidebar
      ? new ResizeObserver(([entry]) => {
          if (entry) directoryRailWidth = entry.contentRect.width;
        })
      : null;
    if (directorySidebar) {
      directoryRailWidth = directorySidebar.getBoundingClientRect().width;
      railObserver?.observe(directorySidebar);
    }

    locationOrigin = loadSessionLocation(sessionStorage);
    locationState = locationOrigin
      ? 'ready'
      : wasLocationDenied(sessionStorage)
        ? 'denied'
        : 'idle';

    if (!locationOrigin && discoveryState.filters.distanceKm !== null) {
      discoveryState = {
        ...discoveryState,
        filters: { ...discoveryState.filters, distanceKm: null }
      };
      commitState(discoveryState, 'replace');
    }
    announceResultCount(filteredPlaces.length);

    const reconciled = reconcileSelectedPlace(discoveryState.selectedPlaceId, filteredPlaces);
    if (reconciled !== discoveryState.selectedPlaceId) {
      commitState({ ...discoveryState, selectedPlaceId: reconciled }, 'replace');
    }
    const directPlace = filteredPlaces.find((place) => place.placeId === reconciled);
    if (directPlace) {
      postHogAnalytics.capture('place viewed', {
        place_id: directPlace.placeId,
        category: directPlace.category,
        source: 'direct',
        language: lang
      });
    }

    const syncHistory = (event: PopStateEvent) => {
      const previousSelectedPlaceId = discoveryState.selectedPlaceId;
      const previousView = discoveryState.view;
      const filtersWereOpen = filtersOpen;
      const next = parseDiscoveryState(
        new URL(window.location.href).searchParams,
        initialState.camera
      );
      const nextFiltered = filterPublishedPlaces(
        places,
        next.filters,
        copy,
        locationOrigin,
        favouritePlaceIds
      );
      discoveryState = {
        ...next,
        selectedPlaceId: reconcileSelectedPlace(next.selectedPlaceId, nextFiltered)
      };
      const restoredClusterIds = Array.isArray(event.state?.[clusterHistoryKey])
        ? event.state[clusterHistoryKey].filter(
            (placeId: unknown): placeId is string =>
              typeof placeId === 'string' && nextFiltered.some((place) => place.placeId === placeId)
          )
        : [];
      clusterPlaceIds =
        next.view === 'list' && restoredClusterIds.length > 1 ? restoredClusterIds : null;
      filtersOpen = false;
      // Ephemeral chrome never belongs to a history entry: navigating always
      // lands on the plain rendering of the restored URL state.
      manualFold = false;
      dualList = false;
      const restoredSelection = nextFiltered.find(
        (place) => place.placeId === discoveryState.selectedPlaceId
      );
      if (restoredSelection) {
        announcement = `${copy['directory.selectedPlace']}: ${restoredSelection.name}`;
      } else {
        announceResultCount(clusterPlaceIds?.length ?? nextFiltered.length);
      }
      onStateChange?.(discoveryState);

      void tick().then(() => {
        if (restoredSelection && previousSelectedPlaceId !== discoveryState.selectedPlaceId) {
          selectionFocusOrigin = null;
          document.querySelector<HTMLButtonElement>('[data-selected-place-close]')?.focus();
          return;
        }

        if (previousSelectedPlaceId && !discoveryState.selectedPlaceId) {
          selectionFocusOrigin = null;
          if (discoveryState.view === 'list') {
            const restoredResult = [
              ...document.querySelectorAll<HTMLButtonElement>('.results-overlay [data-place-id]')
            ].find((element) => element.dataset.placeId === previousSelectedPlaceId);
            if (restoredResult) {
              restoredResult.focus();
              return;
            }
          }
          adapter.focusPlace(previousSelectedPlaceId);
          return;
        }

        if (previousView !== discoveryState.view) {
          if (discoveryState.view === 'list') {
            document.querySelector<HTMLButtonElement>('#discovery-results-close')?.focus();
          } else {
            focusOwningChip(discoveryState.filters.category ?? 'all');
          }
          return;
        }

        if (filtersWereOpen) {
          document.querySelector<HTMLButtonElement>('.discovery-controls .filters-button')?.focus();
        }
      });
    };
    // Escape walks backwards through the states: selection first, then the
    // filter sheet, then the open list back to the quiet map.
    const walkBackOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (discoveryState.selectedPlaceId) {
        event.preventDefault();
        clearSelectedPlace();
        return;
      }
      if (manualFold) {
        event.preventDefault();
        unfoldFromPill();
        return;
      }
      if (filtersOpen) {
        event.preventDefault();
        toggleFilters();
        return;
      }
      if (discoveryState.view === 'list' && !mapFailed) {
        event.preventDefault();
        closeResults();
      }
    };
    window.addEventListener('popstate', syncHistory);
    window.addEventListener('keydown', walkBackOnEscape);
    const unsubscribeFavourites = signedIn
      ? subscribeToFavouriteInvalidation(() => void refreshFavourites())
      : () => undefined;
    return () => {
      if (filterAnalyticsTimer) clearTimeout(filterAnalyticsTimer);
      window.removeEventListener('popstate', syncHistory);
      window.removeEventListener('keydown', walkBackOnEscape);
      reducedMotionQuery.removeEventListener('change', syncReducedMotion);
      boundaryObserver?.disconnect();
      railObserver?.disconnect();
      unsubscribeFavourites();
    };
  });

  async function refreshFavourites(): Promise<void> {
    if (!signedIn) return;
    const refreshVersion = ++favouriteRefreshVersion;
    try {
      const response = await fetch('/api/favourites', { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const payload = (await response.json()) as { placeIds?: unknown };
      if (
        refreshVersion === favouriteRefreshVersion &&
        Array.isArray(payload.placeIds) &&
        payload.placeIds.every((id) => typeof id === 'string')
      ) {
        const nextFavouritePlaceIds = [...payload.placeIds];
        const focusRecovery = captureFavouriteFocusRecovery(nextFavouritePlaceIds);
        favouritePlaceIds = nextFavouritePlaceIds;
        const selectionRemoved = clearSelectionRemovedByFavoritesFilter(nextFavouritePlaceIds);
        restoreFavouriteFocus(focusRecovery, selectionRemoved);
      }
    } catch {
      // The current server-rendered state remains usable while another tab retries.
    }
  }

  function applyFavouriteState(
    placeId: string,
    favourite: boolean,
    trigger: HTMLButtonElement
  ): void {
    favouriteRefreshVersion += 1;
    const next = new SvelteSet(favouritePlaceIds);
    if (favourite) next.add(placeId);
    else next.delete(placeId);
    const nextFavouritePlaceIds = [...next];
    const focusRecovery = captureFavouriteFocusRecovery(nextFavouritePlaceIds, trigger);
    favouritePlaceIds = nextFavouritePlaceIds;

    if (!favourite && discoveryState.filters.favoritesOnly) {
      const selectionRemoved = clearSelectionRemovedByFavoritesFilter(nextFavouritePlaceIds);
      restoreFavouriteFocus(focusRecovery, selectionRemoved);
    }
  }

  function clearSelectionRemovedByFavoritesFilter(
    nextFavouritePlaceIds: readonly string[]
  ): boolean {
    const selectedPlaceId = discoveryState.selectedPlaceId;
    if (
      !discoveryState.filters.favoritesOnly ||
      !selectedPlaceId ||
      nextFavouritePlaceIds.includes(selectedPlaceId)
    ) {
      return false;
    }

    selectionFocusOrigin = null;
    commitState({ ...discoveryState, selectedPlaceId: null }, 'replace');
    announceResultCount(filteredPlaces.length);
    return true;
  }

  interface FavouriteFocusRecovery {
    nextPlaceId: string | null;
  }

  function captureFavouriteFocusRecovery(
    nextFavouritePlaceIds: readonly string[],
    trigger?: HTMLButtonElement
  ): FavouriteFocusRecovery | null {
    if (!discoveryState.filters.favoritesOnly) return null;
    const active = trigger ?? document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const owner = active.closest<HTMLElement>('[data-favourite-place]');
    const removedPlaceId = owner?.dataset.favouritePlace;
    if (!removedPlaceId || nextFavouritePlaceIds.includes(removedPlaceId)) return null;

    const visiblePlaceIds = resultPlaces.map((place) => place.placeId);
    const removedIndex = visiblePlaceIds.indexOf(removedPlaceId);
    if (removedIndex < 0) return { nextPlaceId: null };
    const later = visiblePlaceIds
      .slice(removedIndex + 1)
      .find((placeId) => nextFavouritePlaceIds.includes(placeId));
    const earlier = visiblePlaceIds
      .slice(0, removedIndex)
      .reverse()
      .find((placeId) => nextFavouritePlaceIds.includes(placeId));
    return { nextPlaceId: later ?? earlier ?? null };
  }

  function restoreFavouriteFocus(
    recovery: FavouriteFocusRecovery | null,
    selectionRemoved: boolean
  ): void {
    if (!recovery) return;
    void tick().then(() => {
      if (!selectionRemoved && recovery.nextPlaceId) {
        const owner = [...document.querySelectorAll<HTMLElement>('[data-favourite-place]')].find(
          (candidate) => candidate.dataset.favouritePlace === recovery.nextPlaceId
        );
        const control = owner?.querySelector<HTMLElement>('button, a');
        if (control) {
          control.focus();
          return;
        }
      }
      document.querySelector<HTMLButtonElement>('.discovery-controls .filters-button')?.focus();
    });
  }

  function favouriteSignInHref(placeId: string): string {
    const url =
      typeof window === 'undefined'
        ? new URL(`https://hundavaent.local/${lang}`)
        : new URL(window.location.href);
    url.searchParams.set('place', placeId);
    const returnTo = `${url.pathname}${url.search}${url.hash}`;
    return `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}&intentAction=favourite&placeId=${encodeURIComponent(placeId)}`;
  }

  function selectPlace(
    placeId: string,
    focusOverlay = false,
    focusOrigin: HTMLButtonElement | null = null,
    source: 'map' | 'list' | 'fallback' = 'map',
    openDetails = false
  ): void {
    const place = filteredPlaces.find((candidate) => candidate.placeId === placeId);
    if (!place) return;

    clusterPlaceIds = null;
    filtersOpen = false;
    // Any pin exits the folded Focus state; the selection needs its chrome.
    manualFold = false;
    openDetailsIntentPlaceId = openDetails ? placeId : null;
    // Selection folds, never clears: an open list keeps view=list in the URL
    // and folds to the edge tab, so ✕/Esc restores exactly the browse state.
    commitState(
      {
        ...discoveryState,
        selectedPlaceId: placeId,
        camera: {
          latitude: place.latitude,
          longitude: place.longitude,
          zoom: Math.max(discoveryState.camera.zoom, 13)
        }
      },
      discoveryState.selectedPlaceId ? 'replace' : 'push'
    );
    announcement = `${copy['directory.selectedPlace']}: ${place.name}`;
    postHogAnalytics.capture('place viewed', {
      place_id: place.placeId,
      category: place.category,
      source,
      language: lang
    });
    if (focusOverlay) {
      selectionFocusOrigin = focusOrigin;
      queueMicrotask(() =>
        document.querySelector<HTMLButtonElement>('[data-selected-place-close]')?.focus()
      );
    }
  }

  function clearSelectedPlace(): void {
    const previouslySelectedPlaceId = discoveryState.selectedPlaceId;
    commitState({ ...discoveryState, selectedPlaceId: null }, 'replace');
    openDetailsIntentPlaceId = null;
    dualList = false;
    announcement = '';
    if (previouslySelectedPlaceId) {
      const focusOrigin = selectionFocusOrigin;
      selectionFocusOrigin = null;
      void tick().then(() => {
        if (focusOrigin?.isConnected) {
          focusOrigin.focus();
          return;
        }
        if (mapFailed) {
          const restoredResult = [
            ...document.querySelectorAll<HTMLButtonElement>('.results-overlay [data-place-id]')
          ].find((element) => element.dataset.placeId === previouslySelectedPlaceId);
          if (restoredResult) {
            restoredResult.focus();
            return;
          }
        }
        adapter.focusPlace(previouslySelectedPlaceId);
      });
    }
  }

  function loadSelectedProfile(placeId: string, requestedLang: Locale = lang): Promise<void> {
    const key = profileKey(requestedLang, placeId);
    if (loadedProfiles[key]) return Promise.resolve();
    const inFlight = profileRequests.get(key);
    if (inFlight) return inFlight;

    profileStates = { ...profileStates, [key]: { loading: true, error: false } };
    const request = loadPlace(placeId, requestedLang)
      .then((profile) => {
        loadedProfiles = { ...loadedProfiles, [key]: profile };
        profileStates = { ...profileStates, [key]: { loading: false, error: false } };
      })
      .catch(() => {
        profileStates = { ...profileStates, [key]: { loading: false, error: true } };
      })
      .finally(() => {
        if (profileRequests.get(key) === request) profileRequests.delete(key);
      });
    profileRequests.set(key, request);
    return request;
  }

  function profileKey(locale: Locale, placeId: string): string {
    return `${locale}:${placeId}`;
  }

  function loadCheckInStatus(placeId: string): Promise<void> {
    if (placeId in checkInStatusByPlaceId) return Promise.resolve();
    const inFlight = checkInStatusRequests.get(placeId);
    if (inFlight) return inFlight;

    const request = fetch(`/api/check-ins/${encodeURIComponent(placeId)}`, {
      headers: { accept: 'application/json' }
    })
      .then(async (response) => {
        if (!response.ok) {
          checkInStatusByPlaceId = { ...checkInStatusByPlaceId, [placeId]: null };
          return;
        }
        const payload = (await response.json()) as {
          hasRecentCheckIn?: unknown;
          checkedInAt?: unknown;
        };
        checkInStatusByPlaceId = {
          ...checkInStatusByPlaceId,
          [placeId]:
            payload.hasRecentCheckIn === true && typeof payload.checkedInAt === 'string'
              ? payload.checkedInAt
              : null
        };
      })
      .catch(() => {
        checkInStatusByPlaceId = { ...checkInStatusByPlaceId, [placeId]: null };
      })
      .finally(() => {
        if (checkInStatusRequests.get(placeId) === request) checkInStatusRequests.delete(placeId);
      });
    checkInStatusRequests.set(placeId, request);
    return request;
  }

  // Builds the Check-in sign-in return path. Unlike Favourites, no post-auth marker is needed:
  // returning to the same selected-Place context is enough for the Member to click "Check in"
  // again themselves.
  function checkInSignInHref(placeId: string): string {
    const url =
      typeof window === 'undefined'
        ? new URL(`https://hundavaent.local/${lang}?place=${placeId}`)
        : new URL(window.location.href);
    const returnTo = `${url.pathname}${url.search}${url.hash}`;
    return `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`;
  }

  function updateCamera(camera: MapCamera): void {
    commitState({ ...discoveryState, camera }, 'replace');
  }

  function updateQuery(query: string): void {
    const view = viewAfterQueryChange(query, discoveryState.filters.category, discoveryState.view);
    const opensList = view === 'list' && discoveryState.view !== 'list';
    if (opensList) selectionFocusOrigin = null;
    updateFilters(
      { ...discoveryState.filters, query },
      'replace',
      view,
      opensList ? 'clear' : 'keep'
    );
  }

  // A chip is both the filter and the list's toggle: selecting opens the
  // list with that slice, the active chip dismisses filter and list together.
  function toggleCategoryChip(chip: DiscoveryChip): void {
    const next = toggleChip(
      {
        view: discoveryState.view,
        category: discoveryState.filters.category,
        query: discoveryState.filters.query
      },
      chip
    );
    // Opening a slice replaces any selection until selection folding lands;
    // the card would otherwise sit inert under the list.
    if (next.view === 'list') selectionFocusOrigin = null;
    updateFilters(
      { ...discoveryState.filters, category: next.category, query: next.query },
      'push',
      next.view,
      next.view === 'list' ? 'clear' : 'keep'
    );
  }

  function updateFilters(
    filters: DiscoveryFilters,
    historyMode: 'push' | 'replace' = 'push',
    view: DiscoveryView = discoveryState.view,
    selection: 'keep' | 'clear' = 'keep'
  ): void {
    clusterPlaceIds = null;
    filtersOpen = view === 'list' ? false : filtersOpen;
    const nextFiltered = filterPublishedPlaces(
      places,
      filters,
      copy,
      locationOrigin,
      favouritePlaceIds
    );
    const selectedPlaceId =
      selection === 'clear'
        ? null
        : reconcileSelectedPlace(discoveryState.selectedPlaceId, nextFiltered);
    commitState({ ...discoveryState, filters, view, selectedPlaceId }, historyMode);
    announceResultCount(nextFiltered.length);
    captureFilteredDiscovery(filters, nextFiltered.length, historyMode === 'replace');
  }

  function clearFilters(): void {
    updateFilters({ ...defaultDiscoveryFilters }, 'push', 'map');
  }

  // The edge tab re-expands the list beside the card where both fit (state
  // 6); narrow screens restore the browse state the selection folded away.
  function expandListTab(): void {
    if (wideDetailLayout) {
      dualList = true;
      queueMicrotask(() =>
        document.querySelector<HTMLButtonElement>('#discovery-results-close')?.focus()
      );
      return;
    }
    clearSelectedPlace();
  }

  function collapseDualList(): void {
    dualList = false;
    queueMicrotask(() => document.querySelector<HTMLButtonElement>('.list-edge-tab')?.focus());
  }

  // Categories without a chip of their own (accommodation, culture) fall
  // back to the browse-everything chip so keyboard focus is never dropped.
  function focusOwningChip(chip: string): void {
    const target =
      document.querySelector<HTMLButtonElement>(`.discovery-controls [data-chip="${chip}"]`) ??
      document.querySelector<HTMLButtonElement>('.discovery-controls [data-chip="all"]');
    target?.focus();
  }

  // The sticky fold collapses the command cluster to a search icon and the
  // dark places pill without touching URL state: unfolding restores exactly
  // the browse state that was folded away.
  function foldChrome(): void {
    filtersOpen = false;
    manualFold = true;
    queueMicrotask(() => document.querySelector<HTMLButtonElement>('.focus-search')?.focus());
  }

  function unfoldToSearch(): void {
    manualFold = false;
    queueMicrotask(() =>
      document.querySelector<HTMLInputElement>('.discovery-controls input[type="search"]')?.focus()
    );
  }

  function unfoldFromPill(): void {
    const chip = discoveryState.filters.category ?? 'all';
    manualFold = false;
    queueMicrotask(() => focusOwningChip(chip));
  }

  // Closing the list mirrors the active chip's dismissal: the slice that
  // opened it (category or search) clears with it, and focus returns to the
  // chip that owned the slice.
  function closeResults(): void {
    const dismissedChip = discoveryState.filters.category ?? 'all';
    updateFilters({ ...discoveryState.filters, category: null, query: '' }, 'push', 'map');
    queueMicrotask(() => focusOwningChip(dismissedChip));
  }

  function toggleFilters(): void {
    const opening = !filtersOpen;
    filtersOpen = opening;
    if (opening) {
      clusterPlaceIds = null;
      selectionFocusOrigin = null;
      commitState({ ...discoveryState, selectedPlaceId: null, view: 'map' }, 'push');
      queueMicrotask(() =>
        document.querySelector<HTMLSelectElement>('#discovery-category-filter')?.focus()
      );
    } else {
      queueMicrotask(() =>
        document.querySelector<HTMLButtonElement>('.discovery-controls .filters-button')?.focus()
      );
    }
  }

  function showClusterResults(placeIds: readonly string[]): void {
    const requestedPlaceIds = new Set(placeIds);
    const availablePlaceIds = filteredPlaces
      .filter((place) => requestedPlaceIds.has(place.placeId))
      .map((place) => place.placeId);
    if (availablePlaceIds.length === 0) return;
    if (availablePlaceIds.length === 1) {
      selectPlace(availablePlaceIds[0]);
      return;
    }

    clusterPlaceIds = availablePlaceIds;
    filtersOpen = false;
    selectionFocusOrigin = null;
    commitState({ ...discoveryState, selectedPlaceId: null, view: 'list' }, 'push');
    window.history.replaceState(
      { ...window.history.state, [clusterHistoryKey]: availablePlaceIds },
      '',
      window.location.href
    );
    announceResultCount(availablePlaceIds.length);
    queueMicrotask(() =>
      document.querySelector<HTMLButtonElement>('#discovery-results-close')?.focus()
    );
  }

  function requestLocation(force = false): void {
    // One reading at a time: overlapping requests would race their callbacks into duplicate
    // history entries and out-of-order announcements.
    if (locationState === 'locating') return;
    if (!force && wasLocationDenied(sessionStorage)) {
      captureLocationOutcome('denied');
      locationState = 'denied';
      return;
    }
    if (!navigator.geolocation) {
      captureLocationOutcome('unavailable');
      locationState = 'unavailable';
      if (locateIntent) {
        locateIntent = false;
        announcement = copy['directory.locationUnavailable'];
      }
      return;
    }

    locationState = 'locating';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        captureLocationOutcome('granted');
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        viewerPoint = point;
        saveSessionLocation(sessionStorage, point);
        locationOrigin = loadSessionLocation(sessionStorage);
        locationState = 'ready';
        const cameFromLocateControl = locateIntent;
        locateIntent = false;
        const filters = {
          ...discoveryState.filters,
          distanceKm: discoveryState.filters.distanceKm ?? (5 as const)
        };
        const nextFiltered = filterPublishedPlaces(
          places,
          filters,
          copy,
          locationOrigin,
          favouritePlaceIds
        );
        commitState(
          {
            ...discoveryState,
            filters,
            camera: cameFromLocateControl
              ? {
                  latitude: point.latitude,
                  longitude: point.longitude,
                  zoom: Math.max(discoveryState.camera.zoom, 14)
                }
              : discoveryState.camera,
            selectedPlaceId: reconcileSelectedPlace(discoveryState.selectedPlaceId, nextFiltered)
          },
          'push'
        );
        announceResultCount(nextFiltered.length);
        // The camera move already shows the count changing; what the locate control's own
        // reader needs to hear is that the location itself worked.
        if (cameFromLocateControl) announcement = copy['directory.locationReady'];
      },
      (failure) => {
        const cameFromLocateControl = locateIntent;
        locateIntent = false;
        // A dot from an earlier fix must not outlive a refusal: the map would keep asserting
        // a position the browser just declined to confirm.
        viewerPoint = null;
        if (failure.code === failure.PERMISSION_DENIED) {
          captureLocationOutcome('denied');
          markLocationDenied(sessionStorage);
          locationState = 'denied';
          if (cameFromLocateControl) announcement = copy['directory.locationDenied'];
        } else {
          captureLocationOutcome(failure.code === failure.TIMEOUT ? 'timeout' : 'unavailable');
          locationState = 'unavailable';
          if (cameFromLocateControl) announcement = copy['directory.locationUnavailable'];
        }
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 }
    );
  }

  function retryLocation(): void {
    clearSessionLocation(sessionStorage);
    locationState = 'idle';
    requestLocation(true);
  }

  // The locate control is an explicit ask, so it bypasses the session's denial memory the same
  // way "try location again" does: the browser prompt is the authority on whether it may answer.
  function locateFromControl(): void {
    if (locationState === 'locating') return;
    locateIntent = true;
    requestLocation(true);
  }

  function captureFilteredDiscovery(
    filters: DiscoveryFilters,
    resultCount: number,
    delayForTyping: boolean
  ): void {
    const capture = () =>
      postHogAnalytics.capture('discovery filtered', {
        filter_count: activeFilterCount(filters),
        result_count: resultCount,
        has_query: filters.query.trim().length > 0,
        uses_distance: filters.distanceKm !== null
      });

    if (!delayForTyping) {
      if (filterAnalyticsTimer) clearTimeout(filterAnalyticsTimer);
      filterAnalyticsTimer = undefined;
      capture();
      return;
    }

    if (filterAnalyticsTimer) clearTimeout(filterAnalyticsTimer);
    filterAnalyticsTimer = setTimeout(capture, 750);
  }

  function captureLocationOutcome(outcome: 'granted' | 'denied' | 'unavailable' | 'timeout'): void {
    postHogAnalytics.capture('location permission resolved', {
      context: 'discovery',
      outcome
    });
  }

  function announceResultCount(count: number): void {
    announcement =
      count === 1
        ? copy['directory.resultCountOne']
        : copy['directory.resultCountMany'].replace('{count}', String(count));
  }

  function formatCoordinate(value: number): string {
    return String(Number(value.toFixed(5)));
  }

  function commitState(nextState: DiscoveryState, historyMode: 'push' | 'replace'): void {
    discoveryState = nextState;
    if (typeof window !== 'undefined') {
      const query = serializeDiscoveryState(nextState).toString();
      const url = `${window.location.pathname}?${query}${window.location.hash}`;
      if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        (historyMode === 'push' ? pushUrl : replaceUrl)(url);
      }
    }
    onStateChange?.(nextState);
  }
</script>

<div
  class="map-list-boundary w-full h-full min-h-0 isolate @container/directory-shell"
  bind:this={responsiveBoundary}
>
  <!-- How far the suggest pill sits above the shell's own edge inset, so it clears the map
       attribution strip. The pill reads it from here rather than carrying its own copy. -->
  <!-- The band along the bottom edge the pill owns: its lift, its height, and the rail's own
       gap. The floating panels subtract it on short viewports, where a height measured in dvh
       would otherwise run a scrolling list under a pill that takes its own pointer events. -->
  <!-- No reduced-motion overrides here: every duration above is a motion token, and the tokens
       collapse to zero under reduce on their own. -->
  <div
    class="map-list-shell group/shell relative w-full h-full min-h-0 overflow-hidden bg-snow [--directory-rail-width:clamp(20rem,29cqw,26rem)] [--floating-card-inset:var(--hv-space-edge,0.75rem)] [--chrome-top:calc(var(--hv-app-header-height,4.4rem)+0.35rem)] [--suggest-dock-lift:1.75rem] [--suggest-dock-reserve:calc(var(--floating-card-inset)+var(--suggest-dock-lift)+var(--hv-control-height,2.75rem)+0.6rem)]"
    data-responsive-shell
    data-map-failed={mapFailed}
    data-map-moving={mapMoving}
    data-focus-fold={manualFold}
    data-reduced-motion={reducedMotion}
    data-shell-layout={wideDetailLayout ? 'wide' : persistentRailLayout ? 'rail' : 'compact'}
    data-detail-layout={selectedPlace && wideDetailLayout
      ? 'floating'
      : selectedPlace
        ? 'rail'
        : 'none'}
    style:--detail-safe-right={`${mapViewportPadding.right}px`}
  >
    <!-- The map owns the viewport; every other surface floats above it. -->
    <!-- Map gestures are quiet: while the user pans or zooms, the browse chrome
         steps back and returns on its own when the gesture settles. Opacity only:
         a transform would become the containing block for the fixed detail card. -->
    <!-- Compact is the only layout that stacks the rail and the pill in one column, and the pill
         is the only permanent way to add a missing Place: it keeps its band, and a panel that can
         be scrolled gives ground. The rail gives back exactly the band and no more, so a taller
         viewport loses nothing; the sheet cannot be shrunk by its container, so it is capped. -->
    <aside
      class="directory-sidebar absolute flex flex-col z-[2] top-[var(--chrome-top)] bottom-[var(--floating-card-inset)] left-[var(--floating-card-inset)] w-[var(--directory-rail-width)] min-w-0 min-h-0 gap-[0.6rem] pointer-events-none transition-opacity duration-[var(--hv-fade-quick)] ease-settle group-[&[data-map-moving=true][data-detail-layout=none]]/shell:opacity-[0.35] [@container_directory-shell_(max-width:57.999rem)]:right-[var(--floating-card-inset)] [@container_directory-shell_(max-width:57.999rem)]:w-auto [@container_directory-shell_(max-width:57.999rem)]:group-[&[data-detail-layout=rail]]/shell:z-10 [@container_directory-shell_(max-width:57.999rem)]:group-[&[data-detail-layout=none][data-focus-fold=false]]/shell:bottom-[var(--suggest-dock-reserve)]"
      bind:this={directorySidebar}
      data-directory-sidebar
      aria-label={copy['directory.listLabel']}
    >
      {#if manualFold}
        <div class="focus-cluster flex pointer-events-none">
          <button
            type="button"
            class="focus-search grid place-items-center w-control h-control p-0 border border-border-subtle rounded-[999px] bg-snow-raised text-basalt-muted cursor-pointer pointer-events-auto shadow-raised focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
            aria-label={copy['directory.openSearch']}
            onclick={unfoldToSearch}
          >
            <svg
              class="w-[1.2rem] h-[1.2rem] stroke-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.75" fill="none" stroke-width="2.2" />
              <line x1="15.6" y1="15.6" x2="21" y2="21" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      {:else}
        <DiscoveryControls
          filters={discoveryState.filters}
          {areas}
          resultCount={filteredPlaces.length}
          {filtersOpen}
          resultsOpen={discoveryState.view === 'list' && !mapFailed}
          selectionActive={selectedPlace !== null}
          {copy}
          {locationState}
          {suggestHref}
          showSuggest={filteredPlaces.length === 0}
          {signedIn}
          {favouritesAvailable}
          onQueryChange={updateQuery}
          onFiltersChange={updateFilters}
          onChipToggle={toggleCategoryChip}
          onClear={clearFilters}
          onFold={foldChrome}
          onUseLocation={() => requestLocation()}
          onRetryLocation={retryLocation}
          onToggleFilters={toggleFilters}
        />
      {/if}

      {#if !filtersOpen}
        <div class="rail-stack flex flex-col min-w-0 min-h-0 gap-[0.6rem] pointer-events-none">
          {#if selectedPlace}
            <!-- The compact answer card (state 4) sizes to its content; opening
                 "Place details" grows the same card (state 5) - nothing else moves. -->
            <!-- The boundary's size containment makes it the containing block for
                 fixed descendants, so the card pins to the shell's top-right corner. -->
            <div
              class="selected-place-overlay rail-content flex z-[4] w-full min-w-0 min-h-0 flex-[0_1_auto] box-border overflow-hidden overscroll-contain border border-moss rounded-shell bg-snow-raised shadow-floating pointer-events-auto [@container_directory-shell_(min-width:76rem)]:fixed [@container_directory-shell_(min-width:76rem)]:top-[var(--chrome-top)] [@container_directory-shell_(min-width:76rem)]:right-[var(--floating-card-inset)] [@container_directory-shell_(min-width:76rem)]:bottom-auto [@container_directory-shell_(min-width:76rem)]:left-auto [@container_directory-shell_(min-width:76rem)]:w-[var(--directory-rail-width)] [@container_directory-shell_(min-width:76rem)]:flex-none [@container_directory-shell_(max-width:57.999rem)]:fixed [@container_directory-shell_(max-width:57.999rem)]:z-[9] [@container_directory-shell_(max-width:57.999rem)]:top-auto [@container_directory-shell_(max-width:57.999rem)]:right-[var(--floating-card-inset)] [@container_directory-shell_(max-width:57.999rem)]:bottom-[max(var(--floating-card-inset),env(safe-area-inset-bottom))] [@container_directory-shell_(max-width:57.999rem)]:left-[var(--floating-card-inset)] [@container_directory-shell_(max-width:57.999rem)]:w-auto [@container_directory-shell_(max-width:57.999rem)]:max-h-[min(34rem,calc(100dvh-6.5rem))] [@container_directory-shell_(max-width:57.999rem)]:flex-none [@media(max-height:42rem)]:group-[&[data-shell-layout=compact]]/shell:top-[5.5rem] [@media(max-height:42rem)]:group-[&[data-shell-layout=compact]]/shell:right-[var(--floating-card-inset)] [@media(max-height:42rem)]:group-[&[data-shell-layout=compact]]/shell:bottom-[var(--floating-card-inset)] [@media(max-height:42rem)]:group-[&[data-shell-layout=compact]]/shell:left-auto [@media(max-height:42rem)]:group-[&[data-shell-layout=compact]]/shell:w-[min(24rem,48vw)]"
              data-selected-place-overlay
            >
              <!-- Keyed so selecting a different Place recreates the card: its internal
               interaction state (for example a completed Check-in) must never carry over. -->
              {#key `${lang}:${selectedPlace.placeId}`}
                <SelectedPlaceCard
                  place={selectedPlace}
                  profile={selectedProfile}
                  loading={profileLoading}
                  loadFailed={profileError}
                  {lang}
                  {copy}
                  onClose={clearSelectedPlace}
                  onRetry={() => loadSelectedProfile(selectedPlace.placeId, lang)}
                  {signedIn}
                  favourite={favouritePlaceIds.includes(selectedPlace.placeId)}
                  signInHref={favouriteSignInHref(selectedPlace.placeId)}
                  onFavouriteChange={applyFavouriteState}
                  checkInSignInHref={checkInSignInHref(selectedPlace.placeId)}
                  {proximityAssistEnabled}
                  initialCheckedInAt={selectedCheckInStatus}
                  openDetails={openDetailsIntentPlaceId === selectedPlace.placeId}
                  onDetailsOpened={() => {
                    if (openDetailsIntentPlaceId === selectedPlace.placeId) {
                      openDetailsIntentPlaceId = null;
                    }
                  }}
                />
              {/key}
            </div>
          {/if}

          {#if filteredPlaces.length > 0 && !manualFold}
            <!-- Unfolding the tray is an arrival: display flipping from none restarts the animation,
                 so every unfold replays the same slide (and the cascade inside it). Folding snaps -
                 the departure pattern everywhere in this shell. -->
            <div
              class="results-overlay rail-content w-full min-w-0 min-h-0 flex-[0_1_auto] overflow-auto overscroll-contain border border-border-subtle rounded-shell bg-snow-raised shadow-floating pointer-events-auto [&[data-results-visible=false]]:hidden [@container_directory-shell_(max-width:57.999rem)]:max-h-[min(34rem,46dvh)]"
              data-results-visible={(discoveryState.view === 'list' &&
                (!selectedPlace || dualView)) ||
                mapFailed}
              role={mapFailed ? 'region' : undefined}
              aria-label={mapFailed ? copy['directory.listLabel'] : undefined}
              aria-hidden={selectedPlace && !dualView ? 'true' : undefined}
              inert={selectedPlace && !dualView ? true : undefined}
            >
              <DiscoveryResults
                places={resultPlaces}
                selectedPlaceId={discoveryState.selectedPlaceId}
                sliceLabel={clusterPlaceIds ? null : sliceLabel}
                {lang}
                {copy}
                onSelect={(placeId, trigger, openDetails) =>
                  selectPlace(placeId, true, trigger, mapFailed ? 'fallback' : 'list', openDetails)}
                onClose={dualView ? collapseDualList : closeResults}
                closable={discoveryState.view === 'list' && !mapFailed}
                closeLabel={dualView ? copy['directory.collapseList'] : undefined}
                closeGlyph={dualView ? '‹' : undefined}
                {signedIn}
                {favouritePlaceIds}
                signInHref={favouriteSignInHref}
                onFavouriteChange={applyFavouriteState}
              />
            </div>
          {:else if !manualFold}
            <div
              class="empty-state rail-content grid content-start min-w-0 min-h-0 flex-[0_1_auto] gap-[0.4rem] p-4 overflow-auto overscroll-contain border border-border-subtle rounded-shell bg-snow-raised shadow-floating pointer-events-auto [@container_directory-shell_(max-width:57.999rem)]:max-h-[min(34rem,46dvh)]"
              role="status"
            >
              <span class="empty-paw w-6 text-basalt-muted" aria-hidden="true"><PawMark /></span>
              <strong>{copy['directory.noResultsTitle']}</strong>
              <span>{copy['directory.noResultsBody']}</span>
              <button
                type="button"
                class="justify-self-start mt-[0.35rem] py-2 px-3 border border-basalt rounded-control bg-signal [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-extrabold text-basalt"
                onclick={clearFilters}>{copy['directory.clearFilters']}</button
              >
            </div>
          {/if}
        </div>
      {/if}

      {#if manualFold}
        <button
          type="button"
          class="focus-places inline-flex items-center self-start mt-auto gap-[0.55rem] py-2 pr-4 pl-[0.55rem] border border-basalt rounded-[999px] bg-basalt [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] text-snow-raised shadow-floating cursor-pointer pointer-events-auto focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
          onclick={unfoldFromPill}
        >
          <span
            class="focus-count inline-grid place-items-center min-w-6 py-[0.1rem] px-[0.45rem] rounded-[999px] bg-signal text-[0.8rem] font-black text-basalt"
            >{filteredPlaces.length}</span
          >
          {focusPillLabel}
        </button>
      {/if}

      {#if selectedPlace && discoveryState.view === 'list' && !mapFailed && !manualFold && !dualView}
        <!-- A selection folds an open list to the left edge tab; the count badge
             keeps the slice alive while the card owns the screen. The tab slides in
             from the edge it lives on, mirroring the tray it stands in for. -->
        <!-- The tab is the way back to the list while the card owns the screen:
             it rises clear of the sheet's usual top edge, and stacks above the
             sheet on short viewports instead of peeking out as a buried sliver. -->
        <button
          type="button"
          class="list-edge-tab absolute grid place-items-center top-[min(38dvh,24rem)] left-[calc(-1*var(--floating-card-inset))] gap-[0.2rem] pt-[0.55rem] pr-2 pb-2 pl-[0.6rem] border border-border-subtle border-l-0 rounded-[0_0.75rem_0.75rem_0] bg-snow-raised text-basalt-muted cursor-pointer pointer-events-auto shadow-raised focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] [@container_directory-shell_(max-width:57.999rem)]:group-[&[data-detail-layout=rail]]/shell:z-10 [@container_directory-shell_(max-width:57.999rem)]:group-[&[data-detail-layout=rail]]/shell:top-[min(26dvh,18rem)]"
          aria-label={resultPlaces.length === 1
            ? copy['directory.showResultOne']
            : copy['directory.showResults'].replace('{count}', String(resultPlaces.length))}
          onclick={expandListTab}
        >
          <span
            class="tab-count inline-grid place-items-center min-w-6 py-[0.1rem] px-[0.45rem] rounded-[999px] bg-signal text-[0.8rem] font-black text-basalt"
            >{resultPlaces.length}</span
          >
          <span class="tab-chevron text-[1.1rem] font-black leading-none" aria-hidden="true">›</span
          >
        </button>
      {/if}
    </aside>

    <!-- Browse chrome, and only browse chrome: the compact answer card owns the screen during a
         selection, and the sticky fold is an explicit request for a quiet map. In both states the
         pill steps aside with the rest of the cluster, and the left-edge tab keeps the way back to
         the list to itself. -->
    {#if !selectedPlace && !manualFold}
      <SuggestPlacePill
        href={suggestHref}
        label={copy['directory.suggestPlace']}
        quiet={mapMoving}
      />
    {/if}

    <section
      class="map-panel absolute z-0 inset-0 min-w-0 min-h-0 isolate"
      data-active="true"
      aria-labelledby="map-heading"
    >
      <h2
        id="map-heading"
        class="visually-hidden absolute w-px h-px -m-px p-0 overflow-hidden border-0 whitespace-nowrap [clip:rect(0,0,0,0)]"
      >
        {copy['directory.mapLabel']}
      </h2>
      <div class="map-stage relative w-full h-full min-h-0">
        <MapSurface
          {adapter}
          places={mapPlaces}
          selectedPlaceId={discoveryState.selectedPlaceId}
          camera={discoveryState.camera}
          {copy}
          onMarkerSelect={selectPlace}
          onClusterSelect={showClusterResults}
          onCameraChange={updateCamera}
          onMoveStateChange={(moving) => (mapMoving = moving)}
          onFailureChange={(failed) => (mapFailed = failed)}
          viewportPadding={mapViewportPadding}
          motionDurationMs={mapMotionDuration}
          motionEasing={mapMotionEasing}
          {fitPlacesOnMount}
          viewerLocation={viewerPoint}
        />
        {#if !mapFailed}
          <!-- The locate control rides directly under the zoom cluster and mirrors its layout moves
               below: it is shell chrome, not a MapLibre control, so each rule that repositions
               .maplibregl-ctrl-top-right has a twin here. -->
          <!-- The locate control carries no MapLibre margin, so it takes the safe offset whole. -->
          <!-- The full-width cluster owns the top strip here, and the zoom controls have already
               moved to the bottom corner: the locate control stacks directly above them. -->
          <!-- aria-disabled instead of disabled: a disabled element drops keyboard focus to the
               body mid-interaction, and the click guard below does the actual gating. -->
          <button
            type="button"
            class="locate-control absolute grid place-items-center z-[2] top-[calc(var(--chrome-top)+5.1rem)] right-[var(--floating-card-inset)] w-10 h-10 min-h-10 p-0 border border-border-subtle rounded-[999px] bg-snow-raised text-basalt cursor-pointer shadow-raised transition-transform duration-[var(--hv-motion-instant)] ease-settle [&[aria-disabled=true]]:cursor-not-allowed [&[aria-disabled=true]]:opacity-[0.62] [&:not([aria-disabled=true]):hover]:transform-[translateY(-1px)] [&:not([aria-disabled=true]):active]:transform-[scale(0.94)] focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] [@container_directory-shell_(min-width:76rem)]:group-[&[data-detail-layout=floating]]/shell:right-[var(--detail-safe-right)] [@container_directory-shell_(min-width:76rem)]:group-[&[data-detail-layout=floating]]/shell:[transition:right_var(--hv-motion-considered)_var(--hv-ease-settle),transform_var(--hv-motion-instant)_var(--hv-ease-settle)] [@container_directory-shell_(max-width:57.999rem)]:top-auto [@container_directory-shell_(max-width:57.999rem)]:bottom-[6.8rem] [@container_directory-shell_(max-width:57.999rem)]:group-[&[data-detail-layout=rail]]/shell:invisible"
            data-locate-control
            aria-label={copy['directory.locateMe']}
            aria-disabled={locationState === 'locating'}
            onclick={locateFromControl}
          >
            <svg
              class="w-5 h-5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4.4" fill="none" />
              <circle cx="12" cy="12" r="1.3" class="locate-dot fill-current" stroke="none" />
              <line x1="12" y1="3" x2="12" y2="6.4" />
              <line x1="12" y1="17.6" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6.4" y2="12" />
              <line x1="17.6" y1="12" x2="21" y2="12" />
            </svg>
          </button>
        {/if}
      </div>
    </section>
  </div>
</div>

<noscript>
  <section class="noscript-results mt-4" aria-labelledby="noscript-list-heading">
    <h2 id="noscript-list-heading">{copy['directory.listLabel']}</h2>
    <PlaceList
      places={filteredPlaces}
      selectedPlaceId={discoveryState.selectedPlaceId}
      {lang}
      interactive={false}
      {copy}
    />
  </section>
</noscript>

<p
  class="visually-hidden absolute w-px h-px -m-px p-0 overflow-hidden border-0 whitespace-nowrap [clip:rect(0,0,0,0)]"
  role="status"
  aria-live="polite"
>
  {announcement}
</p>

<style>
  .list-edge-tab {
    animation: edge-tab-enter var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  @keyframes edge-tab-enter {
    from {
      transform: translateX(-0.4rem);
    }

    to {
      transform: translateX(0);
    }
  }

  .selected-place-overlay {
    animation: detail-card-enter var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  .selected-place-overlay:has(:global(details[open])) {
    flex: 1 1 auto;
  }

  .selected-place-overlay :global(aside) {
    width: 100%;
    height: auto;
    min-height: 0;
    max-height: none;
    border-radius: inherit;
  }

  .selected-place-overlay:has(:global(details[open])) :global(aside) {
    height: 100%;
  }

  .results-overlay {
    animation: tray-enter var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  @keyframes tray-enter {
    from {
      transform: translateX(-0.5rem);
    }

    to {
      transform: translateX(0);
    }
  }

  @keyframes detail-card-enter {
    from {
      transform: translateX(0.75rem);
    }

    to {
      transform: translateX(0);
    }
  }

  /* An unfilled paw settling in: no place matched, but the trail is still open. The words
     stay still; only the decoration arrives. */
  .empty-state .empty-paw {
    animation: empty-paw-settles var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  @keyframes empty-paw-settles {
    from {
      transform: scale(0.78) rotate(-8deg);
    }

    to {
      transform: scale(1) rotate(0);
    }
  }

  .map-list-shell[data-map-failed='true'] :global(.map-failure) {
    align-content: center;
  }

  .map-stage :global(.map-surface),
  .map-stage :global(.map-container),
  .map-stage :global(.map-failure) {
    width: 100%;
    height: 100%;
    min-height: 100%;
    border: 0;
    border-radius: 0;
  }

  .map-stage :global(.map-container) {
    padding: 0;
  }

  /* The floating header owns the top strip, so the map's own controls start
     below it. */
  .map-stage :global(.maplibregl-ctrl-top-right) {
    top: var(--chrome-top);
  }

  /* Map controls share the chrome's edge inset instead of MapLibre's 10px. */
  .map-stage :global(.maplibregl-ctrl-top-right .maplibregl-ctrl),
  .map-stage :global(.maplibregl-ctrl-bottom-right .maplibregl-ctrl) {
    margin-right: var(--floating-card-inset);
  }

  /* Without JavaScript the map never mounts: the chrome returns to static
     flow so the server-rendered directory below stays fully readable. */
  :global(body:has(.noscript-results)) .map-list-boundary,
  :global(body:has(.noscript-results)) .map-list-shell {
    height: auto;
    overflow: visible;
  }

  :global(body:has(.noscript-results)) .directory-sidebar {
    position: static;
    width: auto;
    pointer-events: auto;
  }

  :global(body:has(.noscript-results)) .map-panel {
    display: none;
  }

  /* The pill is an affordance for adding a Place the map does not show, and there is no map
     here: it would float over a static list with nothing to anchor it. The zero-results row
     inside the cluster stays, and it is the whole way in on this page. */
  :global(body:has(.noscript-results)) .map-list-shell :global([data-suggest-dock]) {
    display: none;
  }

  @container directory-shell (min-width: 76rem) {
    .selected-place-overlay :global(aside) {
      max-height: calc(100dvh - var(--chrome-top) - var(--floating-card-inset));
    }

    .selected-place-overlay:has(:global(details[open])) {
      bottom: var(--floating-card-inset);
    }

    .selected-place-overlay:has(:global(details[open])) :global(aside) {
      height: 100%;
      max-height: none;
    }

    .map-list-shell[data-detail-layout='floating'] .map-stage :global(.maplibregl-ctrl-top-right),
    .map-list-shell[data-detail-layout='floating']
      .map-stage
      :global(.maplibregl-ctrl-bottom-right) {
      /* The controls' own margin already contributes the edge inset, so the
         safe offset backs it out to keep a steady 12px gap to the card. */
      right: calc(var(--detail-safe-right) - var(--floating-card-inset));
      transition: right var(--hv-motion-considered) var(--hv-ease-settle);
    }
  }

  @container directory-shell (max-width: 57.999rem) {
    /* Reached from here rather than from DiscoveryControls so the reservation is stated once,
       beside the variable that measures it. */
    .map-list-shell[data-detail-layout='none'][data-focus-fold='false']
      :global(#discovery-filter-sheet) {
      max-height: min(28rem, calc(52dvh - var(--suggest-dock-reserve)));
    }

    .map-list-shell[data-detail-layout='rail'] .map-stage :global(.maplibregl-ctrl-top-right) {
      visibility: hidden;
    }

    /* The cluster spans the full width here, so the map controls move to the
       bottom corner instead of hiding behind it. */
    .map-stage :global(.maplibregl-ctrl-top-right) {
      top: auto;
      bottom: 2.4rem;
    }

    .selected-place-overlay :global(aside) {
      height: auto;
      min-height: 0;
      max-height: min(34rem, calc(100dvh - 6.5rem));
    }
  }
</style>
