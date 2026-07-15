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
  import { subscribeToFavouriteInvalidation } from '$lib/favourites/sync';

  import type { Catalogue, Locale } from '$i18n';
  import type { PublishedPlaceSummary } from '$server/discovery/public-places';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';
  import MapSurface from '$lib/map/MapSurface.svelte';
  import type { MapAdapter, MapCamera } from '$lib/map/types';

  import DiscoveryControls from './DiscoveryControls.svelte';
  import DiscoveryResults from './DiscoveryResults.svelte';
  import PlaceList from './PlaceList.svelte';
  import SelectedPlaceCard from './SelectedPlaceCard.svelte';
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
    type DiscoveryFilters,
    type DiscoveryState
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
  let clusterPlaceIds = $state<readonly string[] | null>(null);
  const clusterHistoryKey = 'hundavaentClusterPlaceIds';
  let selectionFocusOrigin = $state<HTMLButtonElement | null>(null);
  let locationOrigin = $state<GeographicPoint | null>(null);
  let locationState = $state<'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'>('idle');
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
  let areas = $derived(availableAreas(places));
  let suggestionPoint = $derived(selectedPlace ?? discoveryState.camera);
  let suggestHref = $derived(
    `${resolve('/[lang=lang]/suggest', { lang })}?latitude=${formatCoordinate(suggestionPoint.latitude)}&longitude=${formatCoordinate(suggestionPoint.longitude)}`
  );
  let loadedProfiles = $state<Record<string, PublishedPlaceProfile>>({});
  let profileStates = $state<Record<string, { loading: boolean; error: boolean }>>({});
  const profileRequests = new SvelteMap<string, Promise<void>>();
  let selectedProfile = $derived(
    selectedPlace ? (loadedProfiles[selectedPlace.placeId] ?? null) : null
  );
  let selectedProfileState = $derived(
    selectedPlace
      ? (profileStates[selectedPlace.placeId] ?? { loading: false, error: false })
      : { loading: false, error: false }
  );
  let profileLoading = $derived(selectedProfileState.loading);
  let profileError = $derived(selectedProfileState.error);
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
    void untrack(() => loadSelectedProfile(placeId));
  });

  $effect(() => {
    const placeId = selectedPlace?.placeId;
    if (!placeId || !signedIn) return;
    if (placeId in untrack(() => checkInStatusByPlaceId)) return;
    void untrack(() => loadCheckInStatus(placeId));
  });

  onMount(() => {
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
          document
            .querySelector<HTMLButtonElement>(
              discoveryState.view === 'list'
                ? '#discovery-results-close'
                : '.discovery-controls .results-button'
            )
            ?.focus();
          return;
        }

        if (filtersWereOpen) {
          document.querySelector<HTMLButtonElement>('.discovery-controls .filters-button')?.focus();
        }
      });
    };
    window.addEventListener('popstate', syncHistory);
    const unsubscribeFavourites = signedIn
      ? subscribeToFavouriteInvalidation(() => void refreshFavourites())
      : () => undefined;
    return () => {
      if (filterAnalyticsTimer) clearTimeout(filterAnalyticsTimer);
      window.removeEventListener('popstate', syncHistory);
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

  // Builds a Correction, Report, or Rating entry link for a specific Place field or Access
  // Condition. Signed-out visitors are routed through sign-in with a return path that preserves
  // the target.
  function correctionHref(
    placeId: string,
    kind: 'correct' | 'report' | 'rate',
    target: { field?: string; conditionId?: string } = {}
  ): string {
    const params = new URLSearchParams();
    if (target.field) params.set('field', target.field);
    if (target.conditionId) params.set('conditionId', target.conditionId);
    const query = params.toString();
    const path = `/${lang}/places/${placeId}/${kind}${query ? `?${query}` : ''}`;
    return signedIn ? path : `/${lang}/account?returnTo=${encodeURIComponent(path)}`;
  }

  function selectPlace(
    placeId: string,
    focusOverlay = false,
    focusOrigin: HTMLButtonElement | null = null,
    source: 'map' | 'list' | 'fallback' = 'map'
  ): void {
    const place = filteredPlaces.find((candidate) => candidate.placeId === placeId);
    if (!place) return;

    clusterPlaceIds = null;
    filtersOpen = false;
    commitState(
      {
        ...discoveryState,
        selectedPlaceId: placeId,
        view: 'map',
        camera: {
          latitude: place.latitude,
          longitude: place.longitude,
          zoom: Math.max(discoveryState.camera.zoom, 13)
        }
      },
      'push'
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
    commitState({ ...discoveryState, selectedPlaceId: null, view: 'map' }, 'push');
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

  function loadSelectedProfile(placeId: string): Promise<void> {
    if (loadedProfiles[placeId]) return Promise.resolve();
    const inFlight = profileRequests.get(placeId);
    if (inFlight) return inFlight;

    profileStates = { ...profileStates, [placeId]: { loading: true, error: false } };
    const request = loadPlace(placeId, lang)
      .then((profile) => {
        loadedProfiles = { ...loadedProfiles, [placeId]: profile };
        profileStates = { ...profileStates, [placeId]: { loading: false, error: false } };
      })
      .catch(() => {
        profileStates = { ...profileStates, [placeId]: { loading: false, error: true } };
      })
      .finally(() => {
        if (profileRequests.get(placeId) === request) profileRequests.delete(placeId);
      });
    profileRequests.set(placeId, request);
    return request;
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
    updateFilters({ ...discoveryState.filters, query }, 'replace');
  }

  function updateFilters(
    filters: DiscoveryFilters,
    historyMode: 'push' | 'replace' = 'push'
  ): void {
    clusterPlaceIds = null;
    const nextFiltered = filterPublishedPlaces(
      places,
      filters,
      copy,
      locationOrigin,
      favouritePlaceIds
    );
    const selectedPlaceId = reconcileSelectedPlace(discoveryState.selectedPlaceId, nextFiltered);
    commitState({ ...discoveryState, filters, selectedPlaceId }, historyMode);
    announceResultCount(nextFiltered.length);
    captureFilteredDiscovery(filters, nextFiltered.length, historyMode === 'replace');
  }

  function clearFilters(): void {
    updateFilters({ ...defaultDiscoveryFilters });
  }

  function showResults(): void {
    clusterPlaceIds = null;
    filtersOpen = false;
    selectionFocusOrigin = null;
    commitState({ ...discoveryState, selectedPlaceId: null, view: 'list' }, 'push');
    if (!mapFailed) {
      queueMicrotask(() =>
        document.querySelector<HTMLButtonElement>('#discovery-results-close')?.focus()
      );
    }
  }

  function closeResults(): void {
    clusterPlaceIds = null;
    commitState({ ...discoveryState, view: 'map' }, 'push');
    queueMicrotask(() =>
      document.querySelector<HTMLButtonElement>('.discovery-controls .results-button')?.focus()
    );
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
    if (!force && wasLocationDenied(sessionStorage)) {
      captureLocationOutcome('denied');
      locationState = 'denied';
      return;
    }
    if (!navigator.geolocation) {
      captureLocationOutcome('unavailable');
      locationState = 'unavailable';
      return;
    }

    locationState = 'locating';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        captureLocationOutcome('granted');
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        saveSessionLocation(sessionStorage, point);
        locationOrigin = loadSessionLocation(sessionStorage);
        locationState = 'ready';
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
            selectedPlaceId: reconcileSelectedPlace(discoveryState.selectedPlaceId, nextFiltered)
          },
          'push'
        );
        announceResultCount(nextFiltered.length);
      },
      (failure) => {
        if (failure.code === failure.PERMISSION_DENIED) {
          captureLocationOutcome('denied');
          markLocationDenied(sessionStorage);
          locationState = 'denied';
        } else {
          captureLocationOutcome(failure.code === failure.TIMEOUT ? 'timeout' : 'unavailable');
          locationState = 'unavailable';
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

<div class="map-list-shell" data-responsive-shell data-map-failed={mapFailed}>
  <aside
    class="directory-sidebar"
    data-directory-sidebar
    data-rail-view={filtersOpen
      ? 'filters'
      : selectedPlace && discoveryState.view !== 'list'
        ? 'selected'
        : 'results'}
    aria-label={copy['directory.listLabel']}
  >
    <DiscoveryControls
      filters={discoveryState.filters}
      {areas}
      resultCount={filteredPlaces.length}
      {filtersOpen}
      resultsOpen={discoveryState.view === 'list' && !mapFailed}
      {copy}
      {locationState}
      {suggestHref}
      showSuggest={filteredPlaces.length === 0}
      {signedIn}
      {favouritesAvailable}
      onQueryChange={updateQuery}
      onFiltersChange={updateFilters}
      onClear={clearFilters}
      onShowResults={showResults}
      onUseLocation={() => requestLocation()}
      onRetryLocation={retryLocation}
      onToggleFilters={toggleFilters}
    />

    {#if !filtersOpen}
      {#if selectedPlace && discoveryState.view !== 'list'}
        <div class="selected-place-overlay rail-content">
          <!-- Keyed so selecting a different Place recreates the card: its internal
               interaction state (for example a completed Check-in) must never carry over. -->
          {#key selectedPlace.placeId}
            <SelectedPlaceCard
              place={selectedPlace}
              profile={selectedProfile}
              loading={profileLoading}
              loadFailed={profileError}
              {lang}
              {copy}
              onClose={clearSelectedPlace}
              onRetry={() => loadSelectedProfile(selectedPlace.placeId)}
              {signedIn}
              favourite={favouritePlaceIds.includes(selectedPlace.placeId)}
              signInHref={favouriteSignInHref(selectedPlace.placeId)}
              onFavouriteChange={applyFavouriteState}
              {correctionHref}
              checkInSignInHref={checkInSignInHref(selectedPlace.placeId)}
              {proximityAssistEnabled}
              initialCheckedInAt={selectedCheckInStatus}
            />
          {/key}
        </div>
      {:else if discoveryState.view === 'list' || mapFailed}
        <div
          class="results-overlay rail-content"
          role={mapFailed ? 'region' : undefined}
          aria-label={mapFailed ? copy['directory.listLabel'] : undefined}
        >
          <DiscoveryResults
            places={resultPlaces}
            selectedPlaceId={discoveryState.selectedPlaceId}
            {copy}
            onSelect={(placeId, trigger) =>
              selectPlace(placeId, true, trigger, mapFailed ? 'fallback' : 'list')}
            onClose={closeResults}
            closable={discoveryState.view === 'list' && !mapFailed}
            {signedIn}
            {favouritePlaceIds}
            signInHref={favouriteSignInHref}
            onFavouriteChange={applyFavouriteState}
          />
        </div>
      {:else if filteredPlaces.length === 0}
        <div class="empty-state rail-content" role="status">
          <strong>{copy['directory.noResultsTitle']}</strong>
          <span>{copy['directory.noResultsBody']}</span>
          <button type="button" onclick={clearFilters}>{copy['directory.clearFilters']}</button>
        </div>
      {/if}
    {/if}
  </aside>

  <section class="map-panel" data-active="true" aria-labelledby="map-heading">
    <h2 id="map-heading" class="visually-hidden">{copy['directory.mapLabel']}</h2>
    <div class="map-stage">
      <MapSurface
        {adapter}
        places={mapPlaces}
        selectedPlaceId={discoveryState.selectedPlaceId}
        camera={discoveryState.camera}
        {copy}
        onMarkerSelect={selectPlace}
        onClusterSelect={showClusterResults}
        onCameraChange={updateCamera}
        onFailureChange={(failed) => (mapFailed = failed)}
        {fitPlacesOnMount}
      />
    </div>
  </section>
</div>

<noscript>
  <section class="noscript-results" aria-labelledby="noscript-list-heading">
    <h2 id="noscript-list-heading">{copy['directory.listLabel']}</h2>
    <PlaceList
      places={filteredPlaces}
      selectedPlaceId={discoveryState.selectedPlaceId}
      interactive={false}
      {copy}
    />
  </section>
</noscript>

<p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>

<style>
  .map-list-shell {
    display: grid;
    grid-template-columns: minmax(19rem, 0.72fr) minmax(28rem, 1.28fr);
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-block: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
  }

  .directory-sidebar {
    position: relative;
    z-index: 2;
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border-inline-end: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
  }

  .rail-content {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: auto;
    border-block-start: 1px solid var(--hv-border-subtle);
    overscroll-behavior: contain;
  }

  .map-panel {
    min-width: 0;
    min-height: 0;
  }

  .map-stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .selected-place-overlay {
    display: flex;
    width: 100%;
    overflow: hidden;
  }

  .selected-place-overlay :global(aside) {
    width: 100%;
    height: 100%;
    max-height: none;
  }

  .results-overlay {
    width: 100%;
  }

  .empty-state {
    display: grid;
    align-content: start;
    gap: 0.4rem;
    padding: 1rem;
    background: var(--hv-color-snow);
  }

  .empty-state button {
    justify-self: start;
    margin-top: 0.35rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 800;
  }

  .noscript-results {
    margin-top: 1rem;
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

  @media (max-width: 58rem) {
    .map-list-shell {
      display: block;
      height: auto;
      min-height: 100%;
      overflow: visible;
      border-block-end: 0;
    }

    .directory-sidebar {
      overflow: visible;
      border-inline-end: 0;
      border-block-end: 1px solid var(--hv-border-subtle);
    }

    .rail-content {
      max-height: min(34rem, 46dvh);
    }

    .map-panel {
      min-height: max(26rem, calc(100dvh - var(--hv-app-header-height, 7.5rem)));
    }

    .map-stage {
      min-height: inherit;
    }

    .selected-place-overlay {
      position: fixed;
      z-index: 9;
      top: min(18.5rem, 40dvh);
      right: 0.75rem;
      bottom: max(0.75rem, env(safe-area-inset-bottom));
      left: 0.75rem;
      width: auto;
      max-height: none;
      border: 1px solid var(--hv-border-strong);
      box-shadow: var(--hv-shadow-floating);
    }

    .map-stage :global(.map-surface),
    .map-stage :global(.map-container),
    .map-stage :global(.map-failure) {
      min-height: inherit;
    }
  }

  @media (max-width: 58rem) and (max-height: 42rem) {
    .selected-place-overlay {
      top: 5.5rem;
      right: 0.75rem;
      bottom: 0.75rem;
      left: auto;
      width: min(24rem, 48vw);
    }
  }
</style>
