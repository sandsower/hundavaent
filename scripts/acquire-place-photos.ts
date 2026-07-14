import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveSession } from './ingest-launch-leads.ts';
import { runPhotoAcquisition } from './place-photo-acquisition/coordinator.ts';
import { SupabasePhotoAcquisitionAdapter } from './place-photo-acquisition/supabase-adapter.ts';
import type { AcquisitionReport } from './place-photo-acquisition/types.ts';
import { WikimediaCommonsSource } from './place-photo-acquisition/wikimedia-commons.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface CliOptions {
  mode: 'dry_run' | 'live';
  allowNonLocal: boolean;
  includeUnpublishedExternalSearch: boolean;
  approvedSourceIds: string[];
  reportPath: string;
}

export async function runPhotoAcquisitionCli(argv: readonly string[]): Promise<AcquisitionReport> {
  const options = parseOptions(argv);
  const session = await resolveSession({ allowNonLocal: options.allowNonLocal });
  const adapter = new SupabasePhotoAcquisitionAdapter(session.client);
  const source = new WikimediaCommonsSource();
  const approvedSourceIds = new Set(options.approvedSourceIds);

  console.log(`Photo acquisition mode: ${options.mode}`);
  console.log(`Authenticated as: ${session.description}`);
  console.log(`Target API origin: ${session.apiUrl}`);

  const report = await runPhotoAcquisition({
    mode: options.mode,
    listInventory: () => adapter.listInventory(),
    canDiscover: (place) =>
      place.lifecycle === 'published' || options.includeUnpublishedExternalSearch,
    discover: (place) => source.discover(place),
    acceptCandidate:
      approvedSourceIds.size > 0
        ? (_place, candidate) => approvedSourceIds.has(candidate.sourceId)
        : undefined,
    download: (candidate) => adapter.download(candidate),
    upload: (input) => adapter.upload(input),
    remove: (objectPath) => adapter.remove(objectPath),
    register: (input) => adapter.register(input)
  });

  const absoluteReportPath = resolveReportPath(options.reportPath);
  mkdirSync(dirname(absoluteReportPath), { recursive: true });
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Places accounted for: ${report.totalPlaces}`);
  console.log('Outcomes:', report.countsByStatus);
  console.log(`Report written to: ${absoluteReportPath}`);
  return report;
}

export function parseOptions(argv: readonly string[]): CliOptions {
  let mode: CliOptions['mode'] = 'dry_run';
  let allowNonLocal = false;
  let includeUnpublishedExternalSearch = false;
  const approvedSourceIds: string[] = [];
  let reportPath = '.beislid/reports/place-photo-acquisition.json';
  let selectedMode = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run' || argument === '--live') {
      if (selectedMode) throw new Error('Choose exactly one of --dry-run or --live');
      selectedMode = true;
      mode = argument === '--live' ? 'live' : 'dry_run';
    } else if (argument === '--allow-non-local') {
      allowNonLocal = true;
    } else if (argument === '--include-unpublished-external-search') {
      includeUnpublishedExternalSearch = true;
    } else if (argument === '--approved-source-id') {
      index += 1;
      const value = argv[index]?.trim();
      if (!value || !/^wikimedia-commons:\d+$/.test(value)) {
        throw new Error('--approved-source-id requires a Wikimedia Commons source ID');
      }
      approvedSourceIds.push(value);
    } else if (argument === '--report') {
      index += 1;
      const value = argv[index]?.trim();
      if (!value) throw new Error('--report requires a repo-relative JSON path');
      reportPath = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return {
    mode,
    allowNonLocal,
    includeUnpublishedExternalSearch,
    approvedSourceIds,
    reportPath
  };
}

function resolveReportPath(reportPath: string): string {
  const absolute = resolve(repositoryRoot, reportPath);
  if (!absolute.startsWith(`${repositoryRoot}/`) || !absolute.endsWith('.json')) {
    throw new Error('Report path must be a .json file inside the repository');
  }
  return absolute;
}

async function main(): Promise<void> {
  const report = await runPhotoAcquisitionCli(process.argv.slice(2));
  if ((report.countsByStatus.failed ?? 0) > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
