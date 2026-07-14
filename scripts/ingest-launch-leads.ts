// Launch-inventory ingestion.
//
// Reads an explicitly supplied lead file and creates one unpublished Candidate Place (with its
// Location, Evidence, and Access Condition) per lead, via the same public.create_candidate_place
// RPC the product's own Moderator "create candidate" flow uses (see
// src/lib/server/moderation/place-moderation.ts for the product's own caller; this script calls
// the identical RPC through scripts/launch-inventory/rpc-client.ts, a runtime-import-safe
// duplicate of that same wrapper - see that file's header comment for why). Publication is never
// called from here: leads always land as candidates for Moderator review.
//
// Idempotent by leadId: before creating a candidate, this script asks
// public.get_moderation_place_by_lead_id(leadId) whether a Place already carries Evidence for
// that lead, and skips if so. Re-running creates nothing new.
//
// See docs/launch-inventory-runbook.md for local and production usage.
//
// Run with: node --experimental-strip-types scripts/ingest-launch-leads.ts --input <path>
//   [--dry-run] [--report <path>] [--allow-non-local]

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/server/db/generated.types.ts';
import {
  assertLocalEvaluationUrl,
  getLocalSupabaseStatus
} from '../tests/e2e/support/local-supabase.ts';
import {
  buildCandidateCommand,
  parseLeadFile,
  type Lead,
  type LeadRejection
} from './launch-inventory/lead-schema.ts';
import { createCandidatePlace } from './launch-inventory/rpc-client.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');

const localFixtureModeratorEmail = 'launch-inventory-moderator@example.invalid';
const localFixtureModeratorPassword = 'Launch-inventory-fixture-password-1!';

export interface LeadOutcome {
  leadId: string;
  municipality: string;
  confidenceTier: string;
  status: 'created' | 'skipped_existing' | 'rejected' | 'failed' | 'planned';
  placeId: string | null;
  detail: string | null;
}

export interface IngestionReport {
  generatedAt: string;
  mode: 'dry_run' | 'live';
  supabaseUrl: string;
  totalLeadsInFile: number;
  outcomes: LeadOutcome[];
  countsByStatus: Record<string, number>;
  countsByTier: Record<string, number>;
  countsByMunicipality: Record<string, number>;
}

interface CliOptions {
  dryRun: boolean;
  reportPath: string | null;
  allowNonLocal: boolean;
  inputPath: string | null;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    reportPath: null,
    allowNonLocal: false,
    inputPath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--allow-non-local') options.allowNonLocal = true;
    else if (argument.startsWith('--input=')) options.inputPath = argument.slice('--input='.length);
    else if (argument === '--input') {
      index += 1;
      options.inputPath = argv[index] ?? null;
    } else if (argument === '--report') {
      index += 1;
      options.reportPath = argv[index] ?? null;
    }
  }
  return options;
}

interface ResolvedSession {
  client: SupabaseClient<Database>;
  apiUrl: string;
  description: string;
}

/** Resolves a Supabase client authenticated as a Moderator.
 *
 * Production path (explicit env vars set): signs in with credentials the human operator already
 * provisioned through the normal product flow. Never touches the service role or the admin API.
 *
 * Local convenience path (default, no env vars set): auto-provisions (idempotently) a fixture
 * Moderator account against the local stack discovered via `supabase status`, guarded by
 * assertLocalEvaluationUrl so this can never silently run against a non-local URL. */
export async function resolveSession(
  options: Pick<CliOptions, 'allowNonLocal'> = { allowNonLocal: false }
): Promise<ResolvedSession> {
  const explicitUrl = process.env.PUBLIC_SUPABASE_URL?.trim();
  const explicitKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const explicitEmail = process.env.LAUNCH_INGESTION_MODERATOR_EMAIL?.trim();
  const explicitPassword = process.env.LAUNCH_INGESTION_MODERATOR_PASSWORD?.trim();

  if (explicitUrl && explicitKey && explicitEmail && explicitPassword) {
    if (!options.allowNonLocal) {
      try {
        assertLocalEvaluationUrl(explicitUrl);
      } catch {
        throw new Error(
          `PUBLIC_SUPABASE_URL (${explicitUrl}) is not a local origin. Pass --allow-non-local to ` +
            'confirm this is an intentional, human-approved production run.'
        );
      }
    }
    const client = createClient<Database>(explicitUrl, explicitKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await client.auth.signInWithPassword({
      email: explicitEmail,
      password: explicitPassword
    });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(
        `Could not sign in as the configured Moderator: ${signedIn.error?.message ?? 'no session'}`
      );
    }
    return { client, apiUrl: explicitUrl, description: `explicit session as ${explicitEmail}` };
  }

  const status = getLocalSupabaseStatus();
  assertLocalEvaluationUrl(status.apiUrl);
  const admin = createClient<Database>(status.apiUrl, status.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const existingUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existingUsers.error) {
    throw new Error(`Could not inspect local users: ${existingUsers.error.message}`);
  }
  let user = existingUsers.data.users.find(
    (candidate) => candidate.email === localFixtureModeratorEmail
  );
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: localFixtureModeratorEmail,
      password: localFixtureModeratorPassword,
      email_confirm: true
    });
    if (created.error || !created.data.user) {
      throw new Error(
        `Could not create the local ingestion Moderator: ${created.error?.message ?? 'unknown error'}`
      );
    }
    user = created.data.user;
  }

  const provisioned = await admin.rpc('provision_moderator', { command_user_id: user.id });
  if (provisioned.error) {
    throw new Error(`Could not grant the Moderator role: ${provisioned.error.message}`);
  }

  const client = createClient<Database>(status.apiUrl, status.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signedIn = await client.auth.signInWithPassword({
    email: localFixtureModeratorEmail,
    password: localFixtureModeratorPassword
  });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(
      `Could not sign in as the local ingestion Moderator: ${signedIn.error?.message ?? 'no session'}`
    );
  }

  return {
    client,
    apiUrl: status.apiUrl,
    description: `local fixture Moderator (${localFixtureModeratorEmail}), auto-provisioned`
  };
}

function planLead(lead: Lead): LeadOutcome {
  const base = {
    leadId: lead.leadId,
    municipality: lead.municipality,
    confidenceTier: lead.confidenceTier
  };
  buildCandidateCommand(lead); // Throws only on a shape the type system should already prevent.
  return {
    ...base,
    status: 'planned',
    placeId: null,
    detail: 'dry-run: would create a Candidate Place'
  };
}

async function ingestLead(client: SupabaseClient<Database>, lead: Lead): Promise<LeadOutcome> {
  const base = {
    leadId: lead.leadId,
    municipality: lead.municipality,
    confidenceTier: lead.confidenceTier
  };

  const existing = await client.rpc('get_moderation_place_by_lead_id', {
    requested_lead_id: lead.leadId
  });
  if (existing.error) {
    return {
      ...base,
      status: 'failed',
      placeId: null,
      detail: `lookup failed: ${existing.error.message}`
    };
  }
  if (existing.data) {
    return {
      ...base,
      status: 'skipped_existing',
      placeId: existing.data,
      detail: 'Evidence for this leadId already exists; not re-ingested'
    };
  }

  const command = buildCandidateCommand(lead);
  const result = await createCandidatePlace(client, command, randomUUID());
  if (result.status === 'success') {
    return { ...base, status: 'created', placeId: result.value.placeId, detail: null };
  }
  return {
    ...base,
    status: 'failed',
    placeId: null,
    detail: `create_candidate_place: ${result.status}`
  };
}

function tally(
  outcomes: readonly LeadOutcome[],
  key: 'status' | 'confidenceTier' | 'municipality'
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const outcome of outcomes) {
    counts[outcome[key]] = (counts[outcome[key]] ?? 0) + 1;
  }
  return counts;
}

export async function runIngestion(argv: readonly string[]): Promise<IngestionReport> {
  const options = parseCliOptions(argv);
  if (!options.inputPath) {
    throw new Error('Pass --input <path> to a private lead inventory outside the repository.');
  }
  const inputPath = resolve(options.inputPath);
  const raw: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
  const { valid, rejected } = parseLeadFile(raw);

  const rejectedOutcomes: LeadOutcome[] = rejected.map((rejection: LeadRejection) => ({
    leadId: rejection.leadId ?? '(unknown)',
    municipality: '(unknown)',
    confidenceTier: '(unknown)',
    status: 'rejected',
    placeId: null,
    detail: rejection.reasons.join('; ')
  }));

  for (const outcome of rejectedOutcomes) {
    console.error(`[rejected] ${outcome.leadId}: ${outcome.detail}`);
  }

  let session: ResolvedSession | null = null;
  const outcomes: LeadOutcome[] = [...rejectedOutcomes];

  if (options.dryRun) {
    for (const lead of valid) {
      outcomes.push(planLead(lead));
    }
  } else {
    session = await resolveSession(options);
    console.log(`Ingesting as: ${session.description} (${session.apiUrl})`);
    for (const lead of valid) {
      const outcome = await ingestLead(session.client, lead);
      outcomes.push(outcome);
      console.log(
        `[${outcome.status}] ${outcome.leadId}${outcome.placeId ? ` -> ${outcome.placeId}` : ''}`
      );
    }
  }

  const report: IngestionReport = {
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? 'dry_run' : 'live',
    supabaseUrl: session?.apiUrl ?? '(dry-run: no session)',
    totalLeadsInFile: valid.length + rejected.length,
    outcomes,
    countsByStatus: tally(outcomes, 'status'),
    countsByTier: tally(outcomes, 'confidenceTier'),
    countsByMunicipality: tally(outcomes, 'municipality')
  };

  console.log('\n--- Launch-inventory ingestion report ---');
  console.log('By status:', report.countsByStatus);
  console.log('By tier:', report.countsByTier);
  console.log('By municipality:', report.countsByMunicipality);

  if (options.reportPath) {
    const absoluteReportPath = resolve(repositoryRoot, options.reportPath);
    mkdirSync(dirname(absoluteReportPath), { recursive: true });
    writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Report written to ${absoluteReportPath}`);
  }

  return report;
}

async function main(): Promise<void> {
  const report = await runIngestion(process.argv.slice(2));
  const failures = report.outcomes.filter(
    (outcome) => outcome.status === 'failed' || outcome.status === 'rejected'
  );
  if (failures.length > 0) {
    console.error(`\n${failures.length} lead(s) failed or were rejected.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
