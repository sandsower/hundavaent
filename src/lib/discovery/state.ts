import type { AccessArea, PermissionRequirement, RestraintCondition } from '$domain/access';

export type DiscoveryView = 'map' | 'list';
export type DiscoveryCategory =
  'food_drink' | 'shopping' | 'outdoors' | 'accommodation' | 'public_cultural';
export type DiscoveryDistanceKm = 1 | 3 | 5 | 10 | 25;

export interface DiscoveryFilters {
  query: string;
  category: DiscoveryCategory | null;
  area: string | null;
  accessArea: AccessArea | null;
  restraintCondition: RestraintCondition | null;
  permissionRequirement: PermissionRequirement | null;
  distanceKm: DiscoveryDistanceKm | null;
  favoritesOnly: boolean;
}

export interface DiscoveryCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface DiscoveryState {
  selectedPlaceId: string | null;
  camera: DiscoveryCamera;
  view: DiscoveryView;
  filters: DiscoveryFilters;
}

interface PlaceCoordinates {
  latitude: number;
  longitude: number;
}

export const defaultDiscoveryFilters: DiscoveryFilters = {
  query: '',
  category: null,
  area: null,
  accessArea: null,
  restraintCondition: null,
  permissionRequirement: null,
  distanceKm: null,
  favoritesOnly: false
};

export const defaultDiscoveryState: DiscoveryState = {
  selectedPlaceId: null,
  camera: {
    latitude: 64.1466,
    longitude: -21.9426,
    zoom: 11
  },
  view: 'map',
  filters: { ...defaultDiscoveryFilters }
};

export function defaultCameraForPlaces(places: readonly PlaceCoordinates[]): DiscoveryCamera {
  if (places.length === 0) {
    return { ...defaultDiscoveryState.camera };
  }

  const latitudes = places.map((place) => place.latitude);
  const longitudes = places.map((place) => place.longitude);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const longitudeFraction = (east - west) / 360;
  const latitudeFraction = Math.abs(mercatorY(north) - mercatorY(south));
  const horizontalZoom = zoomForFraction(initialMapWidth, longitudeFraction);
  const verticalZoom = zoomForFraction(initialMapHeight, latitudeFraction);
  const zoom = Math.max(
    minimumInitialZoom,
    Math.min(maximumInitialZoom, horizontalZoom, verticalZoom)
  );

  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    zoom: Number(zoom.toFixed(2))
  };
}

export function parseDiscoveryState(
  params: URLSearchParams,
  fallbackCamera: DiscoveryCamera = defaultDiscoveryState.camera
): DiscoveryState {
  return {
    selectedPlaceId: parsePlaceId(params.get('place')),
    camera: {
      latitude: parseBoundedNumber(params.get('lat'), -90, 90, fallbackCamera.latitude),
      longitude: parseBoundedNumber(params.get('lng'), -180, 180, fallbackCamera.longitude),
      zoom: parseBoundedNumber(params.get('z'), 0, 22, fallbackCamera.zoom)
    },
    view: parseView(params.get('view')),
    filters: {
      query: normalizeQuery(params.get('q')),
      category: parseEnum(params.get('category'), discoveryCategories),
      area: parseText(params.get('area')),
      accessArea: parseEnum(params.get('access'), accessAreas),
      restraintCondition: parseEnum(params.get('restraint'), restraintConditions),
      permissionRequirement: parseEnum(params.get('permission'), permissionRequirements),
      distanceKm: parseDistance(params.get('distance')),
      favoritesOnly: params.get('favorites') === '1'
    }
  };
}

export function serializeDiscoveryState(state: DiscoveryState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.selectedPlaceId && uuidPattern.test(state.selectedPlaceId)) {
    params.set('place', state.selectedPlaceId);
  }

  params.set('lat', formatNumber(state.camera.latitude, 5));
  params.set('lng', formatNumber(state.camera.longitude, 5));
  params.set('z', formatNumber(state.camera.zoom, 2));
  params.set('view', state.view === 'list' ? 'list' : 'map');

  const query = normalizeQuery(state.filters.query);
  if (query) params.set('q', query);
  if (state.filters.category && discoveryCategories.includes(state.filters.category)) {
    params.set('category', state.filters.category);
  }
  if (state.filters.area?.trim()) params.set('area', state.filters.area.trim());
  if (state.filters.accessArea && accessAreas.includes(state.filters.accessArea)) {
    params.set('access', state.filters.accessArea);
  }
  if (
    state.filters.restraintCondition &&
    restraintConditions.includes(state.filters.restraintCondition)
  ) {
    params.set('restraint', state.filters.restraintCondition);
  }
  if (
    state.filters.permissionRequirement &&
    permissionRequirements.includes(state.filters.permissionRequirement)
  ) {
    params.set('permission', state.filters.permissionRequirement);
  }
  if (state.filters.distanceKm && discoveryDistances.includes(state.filters.distanceKm)) {
    params.set('distance', String(state.filters.distanceKm));
  }
  if (state.filters.favoritesOnly) params.set('favorites', '1');

  return params;
}

export type DiscoveryChip = DiscoveryCategory | 'all';

export interface ChipContext {
  view: DiscoveryView;
  category: DiscoveryCategory | null;
  query: string;
}

export interface ChipToggleResult {
  category: DiscoveryCategory | null;
  query: string;
  view: DiscoveryView;
}

// A chip is both the filter and the list's toggle. A category chip reads
// active whenever its filter is set - with its list open it dismisses (the
// ✕), with its list folded it reopens the slice. "All" is the
// browse-everything toggle: active only while the unfiltered list is open
// and no search query owns it.
export function isChipActive(context: ChipContext, chip: DiscoveryChip): boolean {
  return chip === 'all'
    ? context.view === 'list' && context.category === null && !normalizeQuery(context.query)
    : context.category === chip;
}

// Dismissing the active chip returns to a clean arrival; activating "All"
// clears any query because it means "browse everything", while a category
// chip keeps the query so search can narrow the slice. An active chip whose
// list is folded (selection, sheet-set filter, deep link) reopens its slice
// instead of clearing - the ✕ only appears while the list is showing.
export function toggleChip(context: ChipContext, chip: DiscoveryChip): ChipToggleResult {
  if (chip !== 'all' && context.category === chip && context.view !== 'list') {
    return { category: chip, query: context.query, view: 'list' };
  }

  if (isChipActive(context, chip)) {
    return { category: null, query: '', view: 'map' };
  }

  return chip === 'all'
    ? { category: null, query: '', view: 'list' }
    : { category: chip, query: context.query, view: 'list' };
}

// Search behaves like a chip: typing opens the list, and clearing the query
// closes it only when no category slice remains open.
export function viewAfterQueryChange(
  query: string,
  category: DiscoveryCategory | null,
  currentView: DiscoveryView
): DiscoveryView {
  if (normalizeQuery(query)) return 'list';
  if (category !== null) return currentView;
  return 'map';
}

export function activeFilterCount(filters: DiscoveryFilters): number {
  return [
    normalizeQuery(filters.query) || null,
    filters.category,
    filters.area,
    filters.accessArea,
    filters.restraintCondition,
    filters.permissionRequirement,
    filters.distanceKm,
    filters.favoritesOnly
  ].filter(Boolean).length;
}

export function hasActiveFilters(filters: DiscoveryFilters): boolean {
  return activeFilterCount(filters) > 0;
}

function parsePlaceId(value: string | null): string | null {
  return value && uuidPattern.test(value) ? value : null;
}

function parseBoundedNumber(
  value: string | null,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (value === null || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function parseView(value: string | null): DiscoveryView {
  return value === 'list' || value === 'map' ? value : defaultDiscoveryState.view;
}

function parseEnum<const Value extends string>(
  value: string | null,
  values: readonly Value[]
): Value | null {
  return value && values.some((candidate) => candidate === value) ? (value as Value) : null;
}

function parseDistance(value: string | null): DiscoveryDistanceKm | null {
  const parsed = value === null ? Number.NaN : Number(value);
  return discoveryDistances.includes(parsed as DiscoveryDistanceKm)
    ? (parsed as DiscoveryDistanceKm)
    : null;
}

function parseText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maximumTextLength) : null;
}

function normalizeQuery(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, maximumTextLength);
}

function formatNumber(value: number, precision: number): string {
  return String(Number(value.toFixed(precision)));
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const discoveryCategories = [
  'food_drink',
  'shopping',
  'outdoors',
  'accommodation',
  'public_cultural'
] as const;
const discoveryDistances = [1, 3, 5, 10, 25] as const;
const accessAreas = ['indoors', 'outdoors', 'designated_area', 'other_bounded'] as const;
const restraintConditions = [
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
] as const;
const permissionRequirements = [
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
] as const;
const maximumTextLength = 120;
const initialMapWidth = 240;
const initialMapHeight = 220;
const mapTileSize = 512;
const minimumInitialZoom = 8;
const maximumInitialZoom = 12;

function zoomForFraction(viewportSize: number, fraction: number): number {
  return fraction > 0 ? Math.log2(viewportSize / mapTileSize / fraction) : Infinity;
}

function mercatorY(latitude: number): number {
  const constrained = Math.max(-85.051129, Math.min(85.051129, latitude));
  const radians = (constrained * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}
