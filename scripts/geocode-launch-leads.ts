import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  auditLaunchInventoryGeometry,
  matchHmsAddress,
  matchHmsNamedPlace,
  parseHmsFeatureCollection
} from './launch-inventory/hms-addresses.ts';

type AuthoritativeLookup =
  | {
      kind: 'address';
      addressLine: string;
      postalCode: string;
      evidenceUrl: string;
    }
  | {
      kind: 'named_place';
      name: string;
      postalCode: string;
      evidenceUrl: string;
    };

const inputArgument = process.argv.find((argument) => argument.startsWith('--input='));
const lookupArgument = process.argv.find((argument) => argument.startsWith('--lookups-file='));
const sourceFileArgument = process.argv.find((argument) => argument.startsWith('--source-file='));
const shouldWrite = process.argv.includes('--write');
const auditOnly = process.argv.includes('--audit');
const inventoryPath = inputArgument?.slice('--input='.length);
const lookupsFile = lookupArgument?.slice('--lookups-file='.length);
const sourceFile = sourceFileArgument?.slice('--source-file='.length);

await main();

async function main(): Promise<void> {
  if (!inventoryPath) {
    throw new Error('Pass --input=/path/to/private-leads.json.');
  }
  const resolvedInventoryPath = resolve(inventoryPath);
  const inventory = JSON.parse(await readFile(resolvedInventoryPath, 'utf8'));
  const authoritativeLookups: Record<string, AuthoritativeLookup> = lookupsFile
    ? JSON.parse(await readFile(resolve(lookupsFile), 'utf8'))
    : {};
  const before = auditLaunchInventoryGeometry(inventory);

  if (!sourceFile) {
    printAudit('Current inventory', before);
    if (!auditOnly) {
      console.log('\nPass --source-file=/path/to/hms-addresses.json to resolve exact addresses.');
    }
    process.exitCode = shouldWrite ? 1 : 0;
    return;
  }

  const featureCollection = JSON.parse(await readFile(resolve(sourceFile), 'utf8'));
  const records = parseHmsFeatureCollection(featureCollection);
  const resolutions: Array<{ leadId: string; matchedAddresses: string[] }> = [];
  const unresolved: Array<{ leadId: string; reason: string }> = [];

  for (const lead of inventory.leads) {
    if (
      lead.geometryNeeded !== true &&
      lead.location.geometryPrecision !== 'municipality_anchor_pending_geocode' &&
      lead.location.geometryPrecision !== 'exact'
    ) {
      continue;
    }
    const authoritativeLookup = authoritativeLookups[lead.leadId];
    const match =
      authoritativeLookup?.kind === 'named_place'
        ? matchHmsNamedPlace(
            { name: authoritativeLookup.name, postalCode: authoritativeLookup.postalCode },
            records
          )
        : matchHmsAddress(
            {
              addressLine:
                authoritativeLookup?.kind === 'address'
                  ? authoritativeLookup.addressLine
                  : lead.location.addressLine,
              postalCode:
                authoritativeLookup?.kind === 'address'
                  ? authoritativeLookup.postalCode
                  : lead.location.postalCode
            },
            records
          );
    if (match.status !== 'resolved') {
      unresolved.push({ leadId: lead.leadId, reason: match.reason });
      continue;
    }

    lead.geometryNeeded = false;
    if (authoritativeLookup?.kind === 'address') {
      lead.location.addressLine = authoritativeLookup.addressLine;
      lead.location.postalCode = authoritativeLookup.postalCode;
    } else if (authoritativeLookup?.kind === 'named_place') {
      lead.location.addressLine = authoritativeLookup.name;
      lead.location.postalCode = authoritativeLookup.postalCode;
    }
    lead.location.latitude = Number(match.latitude.toFixed(7));
    lead.location.longitude = Number(match.longitude.toFixed(7));
    lead.location.geometryPrecision =
      authoritativeLookup?.kind === 'named_place'
        ? 'official_representative_centroid'
        : 'official_address_point';
    lead.location.geometryNote = [
      `Resolved from HMS Staðfangaskrá WFS (${match.matchedAddresses.join(' + ')}).`,
      `Coordinate IDs: ${match.coordinateIds.join(', ')}.`,
      authoritativeLookup ? `Place/address evidence: ${authoritativeLookup.evidenceUrl}.` : null,
      'WGS84 values persisted under the Icelandic public-information reuse terms.'
    ]
      .filter(Boolean)
      .join(' ');
    resolutions.push({ leadId: lead.leadId, matchedAddresses: match.matchedAddresses });
  }

  console.log(`HMS address records loaded: ${records.length}`);
  console.log(`Exact lead resolutions: ${resolutions.length}`);
  for (const resolution of resolutions) {
    console.log(`  resolved ${resolution.leadId}: ${resolution.matchedAddresses.join(' + ')}`);
  }
  console.log(`Still pending: ${unresolved.length}`);
  for (const item of unresolved) console.log(`  pending ${item.leadId}: ${item.reason}`);

  if (shouldWrite) {
    inventory.notes.geometryResolution =
      'Exact numbered addresses were resolved from HMS Staðfangaskrá WFS using reviewed WGS84 address points. Source: https://gatt.natt.is/geonetwork/srv/api/records/{A879D973-CA98-49D7-AA50-7BC35047E461}. Ambiguous or non-address locations remain explicitly pending and cannot be published.';
    await writeFile(resolvedInventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`\nUpdated ${resolvedInventoryPath}`);
  }

  printAudit(
    shouldWrite ? 'Updated inventory' : 'Proposed inventory',
    auditLaunchInventoryGeometry(inventory)
  );
}

function printAudit(label: string, audit: ReturnType<typeof auditLaunchInventoryGeometry>): void {
  console.log(`\n--- ${label} geometry audit ---`);
  console.log(`Pending geometry: ${audit.pendingGeometryCount}`);
  console.log(`Publishable municipality anchors: ${audit.publishableMunicipalityAnchors.length}`);
  for (const group of audit.duplicatePendingGroups) {
    console.log(`Pending duplicate group ${group.latitude},${group.longitude}: ${group.count}`);
  }
}
