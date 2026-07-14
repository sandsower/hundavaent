// Script-level integration check for the launch-inventory ingestion pipeline, run against
// a live local Supabase stack (see docs/launch-inventory-runbook.md for setup).
//
// Proves, end to end through the real RPCs:
//   1. Idempotency: running the ingestion twice creates no new Candidate Places the second time.
//   2. Provenance completeness: every created Candidate has at least one Evidence record with a
//      source URL or citation and an observed-at date.
//   3. No lead is auto-published: every created Candidate's lifecycle stays 'candidate'.
//
// Run with: node --experimental-strip-types scripts/verify-launch-inventory-ingestion.ts --input <path>

import { resolveSession, runIngestion } from './ingest-launch-leads.ts';
import { getCandidatePublicationReview } from './launch-inventory/rpc-client.ts';

async function main(): Promise<void> {
  const failures: string[] = [];
  const inputArguments = process.argv.slice(2);

  console.log('=== Run 1: first ingestion ===');
  const first = await runIngestion(inputArguments);
  const firstRejectedOrFailed = first.outcomes.filter(
    (outcome) => outcome.status === 'rejected' || outcome.status === 'failed'
  );
  if (firstRejectedOrFailed.length > 0) {
    failures.push(
      `Run 1 had ${firstRejectedOrFailed.length} rejected/failed lead(s): ` +
        firstRejectedOrFailed.map((outcome) => `${outcome.leadId} (${outcome.detail})`).join('; ')
    );
  }

  const createdInFirstRun = first.outcomes.filter((outcome) => outcome.status === 'created');
  const skippedInFirstRun = first.outcomes.filter(
    (outcome) => outcome.status === 'skipped_existing'
  );
  console.log(
    `Run 1 created ${createdInFirstRun.length} Candidate Place(s), skipped ${skippedInFirstRun.length} already-existing.`
  );

  console.log('\n=== Run 2: idempotency check ===');
  const second = await runIngestion(inputArguments);
  const createdInSecondRun = second.outcomes.filter((outcome) => outcome.status === 'created');
  const skippedInSecondRun = second.outcomes.filter(
    (outcome) => outcome.status === 'skipped_existing'
  );
  console.log(
    `Run 2 created ${createdInSecondRun.length} Candidate Place(s), skipped ${skippedInSecondRun.length}.`
  );

  if (createdInSecondRun.length !== 0) {
    failures.push(
      `Run 2 created ${createdInSecondRun.length} new Candidate Place(s); a second run must create nothing new. ` +
        `Offenders: ${createdInSecondRun.map((outcome) => outcome.leadId).join(', ')}`
    );
  }
  const expectedSkipsOnSecondRun = createdInFirstRun.length + skippedInFirstRun.length;
  if (skippedInSecondRun.length !== expectedSkipsOnSecondRun) {
    failures.push(
      `Run 2 skipped ${skippedInSecondRun.length} lead(s) as already-existing, expected ` +
        `${expectedSkipsOnSecondRun} (everything Run 1 created or had already skipped).`
    );
  }

  console.log('\n=== Provenance completeness + no-auto-publish check ===');
  const session = await resolveSession();
  let reviewed = 0;
  for (const outcome of second.outcomes) {
    if (outcome.status !== 'created' && outcome.status !== 'skipped_existing') continue;
    if (!outcome.placeId) {
      failures.push(`${outcome.leadId}: no placeId recorded to review`);
      continue;
    }
    const review = await getCandidatePublicationReview(session.client, outcome.placeId);
    if (review.status !== 'success') {
      failures.push(
        `${outcome.leadId}: could not review Place ${outcome.placeId} (${review.status})`
      );
      continue;
    }
    reviewed += 1;
    if (review.value.lifecycle !== 'candidate') {
      failures.push(
        `${outcome.leadId}: lifecycle is "${review.value.lifecycle}", expected "candidate" (never published)`
      );
    }
    if (review.value.evidenceRecords.length === 0) {
      failures.push(`${outcome.leadId}: no Evidence records found on the Place`);
    }
    for (const evidence of review.value.evidenceRecords) {
      const hasSource = Boolean(evidence.sourceUrl) || Boolean(evidence.sourceCitation);
      if (!hasSource || !evidence.observedAt) {
        failures.push(
          `${outcome.leadId}: an Evidence record is missing a source url/citation or observed-at date`
        );
      }
    }
  }
  console.log(`Reviewed ${reviewed} Place(s) for provenance completeness and lifecycle.`);

  console.log('\n=== Verdict ===');
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('PASS: idempotent, provenance-complete, and no lead was auto-published.');
}

await main();
