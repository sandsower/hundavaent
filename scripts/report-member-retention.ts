import { closeSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/server/db/generated.types.ts';
import { getLocalSupabaseStatus } from '../tests/e2e/support/local-supabase.ts';

const schemaVersion = 'member-retention-report/v2';
const timeZone = 'Atlantic/Reykjavik';
const suppressionThreshold = 5;
const guardrailKinds = [
  'duplicate_check_ins',
  'replayed_requests',
  'rejected_suggestions',
  'rejected_corrections_or_reports',
  'revoked_contributions',
  'excluded_ratings',
  'active_conduct_flags'
] as const;

interface CliOptions {
  reportPath: string;
  allowNonLocal: boolean;
}

// Shallow counts self-asserted activity (Favourite, Check-in); deep counts activity that enters
// Moderator review. Both series share the headline cohort denominator and suppression rule, and
// they overlap by design: a Member active in both depths is counted in both.
interface CohortRetention {
  week1StartsOn: string;
  week4StartsOn: string;
  suppressed: boolean;
  cohortMemberCount: number | null;
  retainedMemberCount: number | null;
  retentionRate: number | null;
  shallowRetainedMemberCount: number | null;
  shallowRetentionRate: number | null;
  deepRetainedMemberCount: number | null;
  deepRetentionRate: number | null;
}

interface IntegritySignal {
  kind: (typeof guardrailKinds)[number];
  suppressed: boolean;
  eventCount: number | null;
}

export interface MemberRetentionReport {
  schemaVersion: typeof schemaVersion;
  generatedAt: string;
  reportingWeekStartsOn: string;
  timeZone: typeof timeZone;
  suppressionThreshold: typeof suppressionThreshold;
  cohorts: CohortRetention[];
  rollingFourWeek: {
    windowStartsOn: string;
    windowEndsOn: string;
    suppressed: boolean;
    engagedMemberCount: number | null;
    shallowEngagedMemberCount: number | null;
    deepEngagedMemberCount: number | null;
  };
  guardrails: {
    windowStartsOn: string;
    windowEndsOn: string;
    signals: IntegritySignal[];
  };
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  let reportPath: string | null = null;
  let allowNonLocal = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--' && index === 0) continue;
    if (argument === '--allow-non-local') {
      if (allowNonLocal) throw new Error('Member retention reporting arguments are invalid.');
      allowNonLocal = true;
      continue;
    }
    if (argument === '--report') {
      if (reportPath !== null) throw new Error('Member retention reporting arguments are invalid.');
      reportPath = argv[index + 1] ?? null;
      index += 1;
      if (!reportPath || reportPath.startsWith('--')) {
        throw new Error('Member retention reporting arguments are invalid.');
      }
      continue;
    }
    throw new Error('Member retention reporting arguments are invalid.');
  }

  if (!reportPath) throw new Error('Member retention report path is required.');
  return { reportPath: resolve(reportPath), allowNonLocal };
}

export function validateMemberRetentionReport(value: unknown): MemberRetentionReport {
  const report = exactObject(value, [
    'schemaVersion',
    'generatedAt',
    'reportingWeekStartsOn',
    'timeZone',
    'suppressionThreshold',
    'cohorts',
    'rollingFourWeek',
    'guardrails'
  ]);
  if (
    report.schemaVersion !== schemaVersion ||
    report.timeZone !== timeZone ||
    report.suppressionThreshold !== suppressionThreshold ||
    !isTimestamp(report.generatedAt) ||
    !isDateOnly(report.reportingWeekStartsOn) ||
    !Array.isArray(report.cohorts) ||
    report.cohorts.length !== 12
  ) {
    invalidShape();
  }

  const cohorts = report.cohorts.map(parseCohort);
  for (let index = 0; index < cohorts.length; index += 1) {
    const cohort = cohorts[index];
    if (addDays(cohort.week1StartsOn, 21) !== cohort.week4StartsOn) invalidShape();
    if (index > 0 && addDays(cohorts[index - 1].week1StartsOn, 7) !== cohort.week1StartsOn) {
      invalidShape();
    }
  }

  const rolling = exactObject(report.rollingFourWeek, [
    'windowStartsOn',
    'windowEndsOn',
    'suppressed',
    'engagedMemberCount',
    'shallowEngagedMemberCount',
    'deepEngagedMemberCount'
  ]);
  if (
    !isDateOnly(rolling.windowStartsOn) ||
    !isDateOnly(rolling.windowEndsOn) ||
    typeof rolling.suppressed !== 'boolean'
  ) {
    invalidShape();
  }
  const engagedMemberCount = nullableCount(rolling.engagedMemberCount);
  const shallowEngagedMemberCount = nullableCount(rolling.shallowEngagedMemberCount);
  const deepEngagedMemberCount = nullableCount(rolling.deepEngagedMemberCount);
  enforceSuppression(rolling.suppressed, [
    engagedMemberCount,
    shallowEngagedMemberCount,
    deepEngagedMemberCount
  ]);
  // Two active weeks at one depth are also two active weeks overall, so neither depth can exceed
  // the undifferentiated series it decomposes.
  if (
    engagedMemberCount !== null &&
    shallowEngagedMemberCount !== null &&
    deepEngagedMemberCount !== null &&
    (shallowEngagedMemberCount > engagedMemberCount || deepEngagedMemberCount > engagedMemberCount)
  ) {
    invalidShape();
  }

  const guardrails = exactObject(report.guardrails, ['windowStartsOn', 'windowEndsOn', 'signals']);
  if (
    !isDateOnly(guardrails.windowStartsOn) ||
    !isDateOnly(guardrails.windowEndsOn) ||
    !Array.isArray(guardrails.signals) ||
    guardrails.signals.length !== guardrailKinds.length ||
    guardrails.windowStartsOn !== rolling.windowStartsOn ||
    guardrails.windowEndsOn !== rolling.windowEndsOn
  ) {
    invalidShape();
  }
  const signals = guardrails.signals.map((signal, index) =>
    parseSignal(signal, guardrailKinds[index])
  );

  return {
    schemaVersion,
    generatedAt: report.generatedAt,
    reportingWeekStartsOn: report.reportingWeekStartsOn,
    timeZone,
    suppressionThreshold,
    cohorts,
    rollingFourWeek: {
      windowStartsOn: rolling.windowStartsOn,
      windowEndsOn: rolling.windowEndsOn,
      suppressed: rolling.suppressed,
      engagedMemberCount,
      shallowEngagedMemberCount,
      deepEngagedMemberCount
    },
    guardrails: {
      windowStartsOn: guardrails.windowStartsOn,
      windowEndsOn: guardrails.windowEndsOn,
      signals
    }
  };
}

function parseCohort(value: unknown): CohortRetention {
  const cohort = exactObject(value, [
    'week1StartsOn',
    'week4StartsOn',
    'suppressed',
    'cohortMemberCount',
    'retainedMemberCount',
    'retentionRate',
    'shallowRetainedMemberCount',
    'shallowRetentionRate',
    'deepRetainedMemberCount',
    'deepRetentionRate'
  ]);
  if (
    !isDateOnly(cohort.week1StartsOn) ||
    !isDateOnly(cohort.week4StartsOn) ||
    typeof cohort.suppressed !== 'boolean'
  ) {
    invalidShape();
  }
  const cohortMemberCount = nullableCount(cohort.cohortMemberCount);
  const retainedMemberCount = nullableCount(cohort.retainedMemberCount);
  const retentionRate = nullableRate(cohort.retentionRate);
  const shallowRetainedMemberCount = nullableCount(cohort.shallowRetainedMemberCount);
  const shallowRetentionRate = nullableRate(cohort.shallowRetentionRate);
  const deepRetainedMemberCount = nullableCount(cohort.deepRetainedMemberCount);
  const deepRetentionRate = nullableRate(cohort.deepRetentionRate);
  enforceSuppression(cohort.suppressed, [
    cohortMemberCount,
    retainedMemberCount,
    retentionRate,
    shallowRetainedMemberCount,
    shallowRetentionRate,
    deepRetainedMemberCount,
    deepRetentionRate
  ]);
  if (!cohort.suppressed) {
    if (
      cohortMemberCount === null ||
      cohortMemberCount < suppressionThreshold ||
      retainedMemberCount === null ||
      retainedMemberCount > cohortMemberCount ||
      retentionRate === null ||
      Math.abs(retentionRate - retainedMemberCount / cohortMemberCount) > 0.00005
    ) {
      invalidShape();
    }
    // Each depth decomposes the headline series over the same denominator, so neither may exceed it.
    for (const [count, rate] of [
      [shallowRetainedMemberCount, shallowRetentionRate],
      [deepRetainedMemberCount, deepRetentionRate]
    ] as const) {
      if (
        count === null ||
        count > retainedMemberCount ||
        rate === null ||
        Math.abs(rate - count / cohortMemberCount) > 0.00005
      ) {
        invalidShape();
      }
    }
  }
  return {
    week1StartsOn: cohort.week1StartsOn,
    week4StartsOn: cohort.week4StartsOn,
    suppressed: cohort.suppressed,
    cohortMemberCount,
    retainedMemberCount,
    retentionRate,
    shallowRetainedMemberCount,
    shallowRetentionRate,
    deepRetainedMemberCount,
    deepRetentionRate
  };
}

function parseSignal(value: unknown, expectedKind: IntegritySignal['kind']): IntegritySignal {
  const signal = exactObject(value, ['kind', 'suppressed', 'eventCount']);
  if (signal.kind !== expectedKind || typeof signal.suppressed !== 'boolean') invalidShape();
  const eventCount = nullableCount(signal.eventCount);
  enforceSuppression(signal.suppressed, [eventCount]);
  return { kind: expectedKind, suppressed: signal.suppressed, eventCount };
}

function enforceSuppression(suppressed: boolean, values: Array<number | null>): void {
  if (
    suppressed ? values.some((value) => value !== null) : values.some((value) => value === null)
  ) {
    invalidShape();
  }
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidShape();
  const object = value as Record<string, unknown>;
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalidShape();
  }
  return object;
}

function nullableCount(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalidShape();
  return value as number;
}

function nullableRate(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    invalidShape();
  }
  return value;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function invalidShape(): never {
  throw new Error('Member retention report returned an invalid aggregate shape.');
}

interface ReportingSession {
  client: SupabaseClient<Database>;
}

export function resolveReportingSession(
  allowNonLocal: boolean,
  environment: NodeJS.ProcessEnv = process.env
): ReportingSession {
  const explicitUrl = environment.PUBLIC_SUPABASE_URL?.trim();
  const explicitKey = environment.SUPABASE_SECRET_KEY?.trim();
  if (Boolean(explicitUrl) !== Boolean(explicitKey)) {
    throw new Error('Member retention reporting configuration is incomplete.');
  }

  const status = !explicitUrl ? getLocalSupabaseStatus() : null;
  const url = explicitUrl ?? status!.apiUrl;
  const key = explicitKey ?? status!.secretKey;
  const parsed = new URL(url);
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (!local && !allowNonLocal) {
    throw new Error('Non-local reporting requires --allow-non-local.');
  }
  if (!local && parsed.protocol !== 'https:') {
    throw new Error('Non-local reporting requires HTTPS.');
  }

  return {
    client: createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

export async function requestMemberRetentionReport(
  client: SupabaseClient<Database>
): Promise<MemberRetentionReport> {
  const { data, error } = await client.rpc('get_member_retention_report');
  if (error) throw new Error('Member retention report request failed.');
  return validateMemberRetentionReport(data);
}

export function writeMemberRetentionReport(path: string, report: MemberRetentionReport): void {
  let descriptor: number;
  try {
    descriptor = openSync(path, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Member retention report path already exists.');
    }
    throw new Error('Member retention report could not be written.');
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8' });
  } finally {
    closeSync(descriptor);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCliOptions(argv);
  const session = resolveReportingSession(options.allowNonLocal);
  const report = await requestMemberRetentionReport(session.client);
  writeMemberRetentionReport(options.reportPath, report);
  process.stdout.write(`Member retention aggregate written to ${options.reportPath}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Member retention reporting failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
