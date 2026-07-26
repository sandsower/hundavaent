const giscoAddressSearchUrl = 'https://gisco-services.ec.europa.eu/addressapi/search';
const nominatimSearchUrl = 'https://nominatim.openstreetmap.org/search';

export interface AddressSearchResult {
  id: string;
  label: string;
  addressLine: string;
  locality: string;
  postalCode: string;
  municipality: string;
  latitude: number;
  longitude: number;
  source: 'EU GISCO Address API' | 'OpenStreetMap Nominatim';
}

interface GiscoAddressResult {
  LD?: unknown;
  TF?: unknown;
  L2?: unknown;
  L0?: unknown;
  PC?: unknown;
  OL?: unknown;
  XY?: unknown;
}

interface GiscoAddressResponse {
  results?: unknown;
}

interface NominatimAddressResult {
  place_id?: unknown;
  osm_type?: unknown;
  osm_id?: unknown;
  name?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  address?: unknown;
}

interface NominatimAddress {
  road?: unknown;
  pedestrian?: unknown;
  house_number?: unknown;
  postcode?: unknown;
  city?: unknown;
  town?: unknown;
  village?: unknown;
  municipality?: unknown;
  county?: unknown;
  country_code?: unknown;
}

const municipalityByOfficialName = new Map([
  ['REYKJAVÍKURBORG', { id: 'reykjavik', locality: 'Reykjavík' }],
  ['REYKJAVÍK', { id: 'reykjavik', locality: 'Reykjavík' }],
  ['KÓPAVOGSBÆR', { id: 'kopavogur', locality: 'Kópavogur' }],
  ['KÓPAVOGUR', { id: 'kopavogur', locality: 'Kópavogur' }],
  ['SELTJARNARNESBÆR', { id: 'seltjarnarnes', locality: 'Seltjarnarnes' }],
  ['SELTJARNARNES', { id: 'seltjarnarnes', locality: 'Seltjarnarnes' }],
  ['GARÐABÆR', { id: 'gardabaer', locality: 'Garðabær' }],
  ['HAFNARFJARÐARKAUPSTAÐUR', { id: 'hafnarfjordur', locality: 'Hafnarfjörður' }],
  ['HAFNARFJÖRÐUR', { id: 'hafnarfjordur', locality: 'Hafnarfjörður' }],
  ['MOSFELLSBÆR', { id: 'mosfellsbaer', locality: 'Mosfellsbær' }],
  ['KJÓSARHREPPUR', { id: 'kjosarhreppur', locality: 'Kjósarhreppur' }],
  ['KJÓS', { id: 'kjosarhreppur', locality: 'Kjósarhreppur' }]
]);

export async function searchAddresses(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<AddressSearchResult[]> {
  const normalizedQuery = query.trim().slice(0, 120);
  if (normalizedQuery.length < 3) return [];

  let giscoError: unknown;
  try {
    const results = await searchGiscoAddresses(normalizedQuery, fetcher);
    if (results.length > 0) return results;
  } catch (error) {
    giscoError = error;
  }

  try {
    return await searchNominatimPlaces(normalizedQuery, fetcher);
  } catch (error) {
    throw giscoError ?? error;
  }
}

async function searchGiscoAddresses(
  query: string,
  fetcher: typeof fetch
): Promise<AddressSearchResult[]> {
  const url = new URL(giscoAddressSearchUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('country', 'IS');
  const response = await fetcher(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`GISCO address search failed with ${response.status}`);

  const payload = (await response.json()) as GiscoAddressResponse;
  return collectResults(payload.results, normalizeGiscoAddress);
}

async function searchNominatimPlaces(
  query: string,
  fetcher: typeof fetch
): Promise<AddressSearchResult[]> {
  const url = new URL(nominatimSearchUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'is');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  const response = await fetcher(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Hundavaent location search'
    },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`Nominatim place search failed with ${response.status}`);

  return collectResults(await response.json(), normalizeNominatimPlace);
}

function collectResults(
  values: unknown,
  normalize: (value: unknown) => AddressSearchResult | null
): AddressSearchResult[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const results: AddressSearchResult[] = [];
  for (const candidate of values) {
    const result = normalize(candidate);
    if (!result || seen.has(result.id)) continue;
    seen.add(result.id);
    results.push(result);
    if (results.length === 8) break;
  }
  return results;
}

export function normalizeGiscoAddress(value: unknown): AddressSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as GiscoAddressResult;
  if (result.L0 !== 'IS' || typeof result.L2 !== 'string') return null;
  const municipality = municipalityByOfficialName.get(result.L2.toLocaleUpperCase('is'));
  if (!municipality) return null;
  if (!Array.isArray(result.XY) || result.XY.length < 2) return null;

  const longitude = Number(result.XY[0]);
  const latitude = Number(result.XY[1]);
  const street = text(result.TF);
  const number = text(result.LD);
  const postalCode = text(result.PC);
  if (
    !street ||
    !postalCode ||
    !/^\d{3}$/.test(postalCode) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const addressLine = `${titleCase(street)}${number ? ` ${number}` : ''}`;
  const id = text(result.OL) || `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  return {
    id,
    label: `${addressLine}, ${postalCode} ${municipality.locality}`,
    addressLine,
    locality: municipality.locality,
    postalCode,
    municipality: municipality.id,
    latitude: rounded(latitude),
    longitude: rounded(longitude),
    source: 'EU GISCO Address API'
  };
}

export function normalizeNominatimPlace(value: unknown): AddressSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as NominatimAddressResult;
  if (!result.address || typeof result.address !== 'object') return null;
  const address = result.address as NominatimAddress;
  if (text(address.country_code).toLocaleLowerCase('en') !== 'is') return null;

  const municipality = [
    address.municipality,
    address.city,
    address.town,
    address.village,
    address.county
  ]
    .map(text)
    .map((name) => municipalityByOfficialName.get(name.toLocaleUpperCase('is')))
    .find((candidate) => candidate !== undefined);
  if (!municipality) return null;

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const postalCode = text(address.postcode);
  const road = text(address.road) || text(address.pedestrian);
  const name = text(result.name);
  const addressLine = `${road || name}${road && text(address.house_number) ? ` ${text(address.house_number)}` : ''}`;
  if (
    !addressLine ||
    !postalCode ||
    !/^\d{3}$/.test(postalCode) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const providerId =
    scalarText(result.place_id) ||
    [text(result.osm_type), scalarText(result.osm_id)].filter(Boolean).join('-');
  const id = providerId || `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  const placePrefix = name && name !== addressLine ? `${name} - ` : '';
  return {
    id: `nominatim-${id}`,
    label: `${placePrefix}${addressLine}, ${postalCode} ${municipality.locality}`,
    addressLine,
    locality: municipality.locality,
    postalCode,
    municipality: municipality.id,
    latitude: rounded(latitude),
    longitude: rounded(longitude),
    source: 'OpenStreetMap Nominatim'
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('is')
    .replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase('is'));
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
