import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveSession } from './ingest-launch-leads.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface AuditFinding {
  placeId: string;
  mediaId: string;
  problem: string;
}

interface AcquisitionAuditReport {
  schemaVersion: 1;
  generatedAt: string;
  totalPlaces: number;
  acquiredPhotoCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  findings: AuditFinding[];
}

export async function runAcquisitionAudit(
  argv: readonly string[]
): Promise<AcquisitionAuditReport> {
  const options = parseOptions(argv);
  const session = await resolveSession({ allowNonLocal: options.allowNonLocal });
  const inventory = await session.client.rpc('get_photo_acquisition_inventory');
  if (inventory.error)
    throw new Error(`Could not list acquisition inventory: ${inventory.error.message}`);

  const findings: AuditFinding[] = [];
  let acquiredPhotoCount = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  const hashes = new Set<string>();

  for (const place of inventory.data) {
    const media = await session.client.rpc('get_moderation_place_media', {
      requested_place_id: place.place_id
    });
    if (media.error) {
      findings.push({
        placeId: place.place_id,
        mediaId: '(inventory)',
        problem: media.error.message
      });
      continue;
    }

    for (const item of media.data.filter((row) => row.kind === 'photo' && row.content_sha256)) {
      acquiredPhotoCount += 1;
      if (item.approval_state === 'pending') pendingCount += 1;
      else if (item.approval_state === 'approved') approvedCount += 1;
      else rejectedCount += 1;

      const required = [
        item.source_url,
        item.rights_basis,
        item.rights_evidence_reference,
        item.license_reference,
        item.license_url,
        item.photographer_or_uploader,
        item.attribution_text,
        item.source_or_capture_date,
        item.alt_text_is,
        item.alt_text_en
      ];
      if (required.some((value) => value === null || String(value).trim() === '')) {
        findings.push({
          placeId: place.place_id,
          mediaId: item.media_id,
          problem: 'Acquired photo has incomplete rights metadata'
        });
      }
      if (item.content_sha256 && hashes.has(item.content_sha256)) {
        findings.push({
          placeId: place.place_id,
          mediaId: item.media_id,
          problem: 'Acquired content hash is duplicated'
        });
      }
      if (item.content_sha256) hashes.add(item.content_sha256);
      if (options.requirePending && item.approval_state !== 'pending') {
        findings.push({
          placeId: place.place_id,
          mediaId: item.media_id,
          problem: `Expected pending immediately after import, found ${item.approval_state}`
        });
      }
    }
  }

  const report: AcquisitionAuditReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totalPlaces: inventory.data.length,
    acquiredPhotoCount,
    pendingCount,
    approvedCount,
    rejectedCount,
    findings
  };
  const reportPath = resolveReportPath(options.reportPath);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    `Audited ${report.totalPlaces} Places and ${report.acquiredPhotoCount} acquired photos.`
  );
  console.log(`Pending: ${pendingCount}; approved: ${approvedCount}; rejected: ${rejectedCount}.`);
  console.log(`Findings: ${findings.length}.`);
  console.log(`Report written to: ${reportPath}`);
  return report;
}

function parseOptions(argv: readonly string[]): {
  allowNonLocal: boolean;
  requirePending: boolean;
  reportPath: string;
} {
  let allowNonLocal = false;
  let requirePending = true;
  let reportPath = '.beislid/reports/place-photo-acquisition-audit.json';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-non-local') allowNonLocal = true;
    else if (argument === '--allow-reviewed') requirePending = false;
    else if (argument === '--report') {
      index += 1;
      const value = argv[index]?.trim();
      if (!value) throw new Error('--report requires a repo-relative JSON path');
      reportPath = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return { allowNonLocal, requirePending, reportPath };
}

function resolveReportPath(value: string): string {
  const absolute = resolve(repositoryRoot, value);
  if (!absolute.startsWith(`${repositoryRoot}/`) || !absolute.endsWith('.json')) {
    throw new Error('Report path must be a .json file inside the repository');
  }
  return absolute;
}

async function main(): Promise<void> {
  const report = await runAcquisitionAudit(process.argv.slice(2));
  if (report.findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
