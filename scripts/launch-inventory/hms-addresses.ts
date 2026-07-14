export interface HmsAddressRecord {
  coordinateId: number;
  postalCode: string;
  streetName: string;
  houseNumber: number | null;
  houseLetter: string | null;
  locationQualifier?: string | null;
  displayAddress: string;
  latitude: number;
  longitude: number;
  coordinateType: number | null;
  reviewStatus: number | null;
}

export interface AddressLookup {
  addressLine: string;
  postalCode: string;
}

export interface NamedPlaceLookup {
  name: string;
  postalCode: string;
}

export type HmsAddressMatch =
  | {
      status: 'resolved';
      latitude: number;
      longitude: number;
      coordinateIds: number[];
      matchedAddresses: string[];
    }
  | {
      status: 'unresolved';
      reason: 'address_number_missing' | 'no_exact_match' | 'ambiguous_match';
    };

interface ParsedAddress {
  streetName: string;
  startNumber: number;
  endNumber: number;
  houseLetter: string | null;
}

interface InventoryLead {
  leadId: string;
  geometryNeeded?: boolean;
  location: {
    latitude: number;
    longitude: number;
    geometryPrecision?: string;
  };
}

interface LaunchInventory {
  municipalityAnchors?: Record<string, { latitude: number; longitude: number }>;
  leads?: InventoryLead[];
}

export interface GeometryAudit {
  pendingGeometryCount: number;
  duplicatePendingGroups: Array<{
    latitude: number;
    longitude: number;
    count: number;
    leadIds: string[];
  }>;
  publishableMunicipalityAnchors: string[];
}

interface HmsFeatureCollection {
  features?: Array<{
    properties?: Record<string, unknown>;
  }>;
}

export function parseHmsFeatureCollection(value: HmsFeatureCollection): HmsAddressRecord[] {
  if (!Array.isArray(value.features)) return [];
  const records: HmsAddressRecord[] = [];

  for (const feature of value.features) {
    const properties = feature.properties;
    if (!properties) continue;
    const coordinateId = finiteNumber(properties.HNITNUM);
    const postalCode = finiteNumber(properties.POSTNR);
    const houseNumber = nullableFiniteNumber(properties.HUSNR);
    const latitude = finiteNumber(properties.N_HNIT_WGS84);
    const longitude = finiteNumber(properties.E_HNIT_WGS84);
    const streetName = text(properties.HEITI_NF);
    const displayAddress = text(properties.VEF_BIRTING)
      ?.replace(/\s+\([^)]*\)\s*$/, '')
      .trim();
    if (
      coordinateId === null ||
      postalCode === null ||
      latitude === null ||
      longitude === null ||
      !streetName ||
      !displayAddress
    ) {
      continue;
    }
    records.push({
      coordinateId,
      postalCode: String(postalCode),
      streetName,
      houseNumber,
      houseLetter: text(properties.BOKST),
      locationQualifier: text(properties.VIDSK),
      displayAddress,
      latitude,
      longitude,
      coordinateType: finiteNumber(properties.TEGHNIT),
      reviewStatus: finiteNumber(properties.YFIRFARID)
    });
  }

  return records;
}

export function auditLaunchInventoryGeometry(inventory: LaunchInventory): GeometryAudit {
  const leads = Array.isArray(inventory.leads) ? inventory.leads : [];
  const anchors = Object.values(inventory.municipalityAnchors ?? {});
  const pending = leads.filter(
    (lead) =>
      lead.geometryNeeded === true ||
      lead.location.geometryPrecision === 'municipality_anchor_pending_geocode'
  );
  const groups = new Map<string, InventoryLead[]>();

  for (const lead of pending) {
    const key = `${lead.location.latitude},${lead.location.longitude}`;
    groups.set(key, [...(groups.get(key) ?? []), lead]);
  }

  return {
    pendingGeometryCount: pending.length,
    duplicatePendingGroups: [...groups.values()]
      .filter((group) => group.length > 1)
      .map((group) => ({
        latitude: group[0].location.latitude,
        longitude: group[0].location.longitude,
        count: group.length,
        leadIds: group.map((lead) => lead.leadId).sort()
      }))
      .sort((left, right) => right.count - left.count),
    publishableMunicipalityAnchors: leads
      .filter(
        (lead) =>
          !pending.includes(lead) &&
          anchors.some(
            (anchor) =>
              anchor.latitude === lead.location.latitude &&
              anchor.longitude === lead.location.longitude
          )
      )
      .map((lead) => lead.leadId)
      .sort()
  };
}

export function matchHmsAddress(
  lookup: AddressLookup,
  records: readonly HmsAddressRecord[]
): HmsAddressMatch {
  const parsed = parseAddress(lookup.addressLine);
  if (!parsed) return { status: 'unresolved', reason: 'address_number_missing' };

  const baseCandidates = records.filter(
    (record) =>
      record.postalCode === lookup.postalCode &&
      normalize(record.streetName) === normalize(parsed.streetName)
  );
  const requestedNumbers =
    parsed.startNumber === parsed.endNumber
      ? [parsed.startNumber]
      : [parsed.startNumber, parsed.endNumber];
  const selected: HmsAddressRecord[] = [];
  const coordinateIds: number[] = [];

  for (const number of requestedNumbers) {
    const numbered = baseCandidates.filter((record) => record.houseNumber === number);
    const atNumber = selectAddressPoints(numbered, parsed.houseLetter);
    if (atNumber.status === 'none') {
      return { status: 'unresolved', reason: 'no_exact_match' };
    }
    if (atNumber.status === 'ambiguous') {
      return { status: 'unresolved', reason: 'ambiguous_match' };
    }
    selected.push(atNumber.representative);
    coordinateIds.push(...atNumber.records.map((record) => record.coordinateId));
  }
  const matches = [...selected].sort(
    (left, right) => (left.houseNumber ?? 0) - (right.houseNumber ?? 0)
  );

  return {
    status: 'resolved',
    latitude: average(matches.map((record) => record.latitude)),
    longitude: average(matches.map((record) => record.longitude)),
    coordinateIds: [...new Set(coordinateIds)].sort((left, right) => left - right),
    matchedAddresses: [...new Set(matches.map((record) => record.displayAddress))]
  };
}

export function matchHmsNamedPlace(
  lookup: NamedPlaceLookup,
  records: readonly HmsAddressRecord[]
): HmsAddressMatch {
  const exact = records.filter(
    (record) =>
      record.postalCode === lookup.postalCode &&
      normalize(record.streetName) === normalize(lookup.name) &&
      record.houseNumber === null &&
      !record.locationQualifier
  );
  const reviewed = exact.filter((record) => record.reviewStatus === 1);
  const eligible = reviewed.length > 0 ? reviewed : exact;
  if (eligible.length === 0) return { status: 'unresolved', reason: 'no_exact_match' };
  if (eligible.length !== 1) return { status: 'unresolved', reason: 'ambiguous_match' };

  const match = eligible[0];
  return {
    status: 'resolved',
    latitude: match.latitude,
    longitude: match.longitude,
    coordinateIds: [match.coordinateId],
    matchedAddresses: [match.displayAddress]
  };
}

function parseAddress(value: string): ParsedAddress | null {
  const match = value
    .trim()
    .match(/^(.+?)\s+(\d+)([A-Za-zÁÐÉÍÓÚÝÞÆÖáðéíóúýþæö]?)(?:-(\d+))?(?:\b|,|$)/u);
  if (!match) return null;
  const startNumber = Number(match[2]);
  return {
    streetName: match[1],
    startNumber,
    endNumber: match[4] ? Number(match[4]) : startNumber,
    houseLetter: match[3] ? normalize(match[3]) : null
  };
}

type AddressPointSelection =
  | { status: 'none' }
  | { status: 'ambiguous' }
  | {
      status: 'selected';
      representative: HmsAddressRecord;
      records: HmsAddressRecord[];
    };

function selectAddressPoints(
  candidates: readonly HmsAddressRecord[],
  requestedLetter: string | null
): AddressPointSelection {
  const letterMatches = requestedLetter
    ? candidates.filter((candidate) => normalize(candidate.houseLetter) === requestedLetter)
    : candidates.filter((candidate) => candidate.houseLetter === null);
  const reviewed = letterMatches.filter((candidate) => candidate.reviewStatus === 1);
  const exact = reviewed.length > 0 ? reviewed : letterMatches;
  if (exact.length === 0) return { status: 'none' };

  const bestPriority = Math.min(
    ...exact.map((candidate) => coordinateTypePriority(candidate.coordinateType))
  );
  if (bestPriority === UNKNOWN_COORDINATE_TYPE_PRIORITY) return { status: 'ambiguous' };

  const best = exact
    .filter((candidate) => coordinateTypePriority(candidate.coordinateType) === bestPriority)
    .sort((left, right) => left.coordinateId - right.coordinateId);
  const points = new Set(
    best.map(
      (candidate) =>
        `${candidate.latitude.toFixed(12)}:${candidate.longitude.toFixed(12)}:${normalize(candidate.displayAddress)}`
    )
  );
  if (points.size !== 1) return { status: 'ambiguous' };

  return { status: 'selected', representative: best[0], records: best };
}

const UNKNOWN_COORDINATE_TYPE_PRIORITY = 6;

function coordinateTypePriority(value: number | null): number {
  const priority = [2, 4, 1, 3, 5, 0].indexOf(value ?? 0);
  return priority === -1 ? UNKNOWN_COORDINATE_TYPE_PRIORITY : priority;
}

function normalize(value: string | null): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableFiniteNumber(value: unknown): number | null {
  return finiteNumber(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
