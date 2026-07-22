const giscoAddressSearchUrl = 'https://gisco-services.ec.europa.eu/addressapi/search';

export interface ModerationAddressResult {
  id: string;
  label: string;
  addressLine: string;
  locality: string;
  postalCode: string;
  municipality: string;
  latitude: number;
  longitude: number;
  source: 'EU GISCO Address API';
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

const municipalityByOfficialName = new Map([
  ['REYKJAVÍKURBORG', { id: 'reykjavik', locality: 'Reykjavík' }],
  ['KÓPAVOGSBÆR', { id: 'kopavogur', locality: 'Kópavogur' }],
  ['SELTJARNARNESBÆR', { id: 'seltjarnarnes', locality: 'Seltjarnarnes' }],
  ['GARÐABÆR', { id: 'gardabaer', locality: 'Garðabær' }],
  ['HAFNARFJARÐARKAUPSTAÐUR', { id: 'hafnarfjordur', locality: 'Hafnarfjörður' }],
  ['MOSFELLSBÆR', { id: 'mosfellsbaer', locality: 'Mosfellsbær' }],
  ['KJÓSARHREPPUR', { id: 'kjosarhreppur', locality: 'Kjósarhreppur' }]
]);

export async function searchModerationAddresses(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<ModerationAddressResult[]> {
  const normalizedQuery = query.trim().slice(0, 120);
  if (normalizedQuery.length < 3) return [];

  const url = new URL(giscoAddressSearchUrl);
  url.searchParams.set('q', normalizedQuery);
  url.searchParams.set('country', 'IS');
  const response = await fetcher(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`GISCO address search failed with ${response.status}`);

  const payload = (await response.json()) as GiscoAddressResponse;
  if (!Array.isArray(payload.results)) return [];

  const seen = new Set<string>();
  const results: ModerationAddressResult[] = [];
  for (const candidate of payload.results) {
    const result = normalizeGiscoAddress(candidate);
    if (!result || seen.has(result.id)) continue;
    seen.add(result.id);
    results.push(result);
    if (results.length === 8) break;
  }
  return results;
}

export function normalizeGiscoAddress(value: unknown): ModerationAddressResult | null {
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

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('is')
    .replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase('is'));
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
