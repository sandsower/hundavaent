import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  parseCliOptions,
  validateMemberRetentionReport,
  writeMemberRetentionReport
} from '../../../scripts/report-member-retention.ts';

const directory = join(tmpdir(), `hundavaent-retention-${process.pid}`);
mkdirSync(directory, { recursive: true });

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('Member retention report command', () => {
  it('parses only the required report path and explicit non-local confirmation', () => {
    expect(
      parseCliOptions(['--', '--allow-non-local', '--report', join(directory, 'report.json')])
    ).toEqual({ reportPath: join(directory, 'report.json'), allowNonLocal: true });
    expect(() => parseCliOptions(['--report', 'one.json', '--report', 'two.json'])).toThrow(
      'Member retention reporting arguments are invalid.'
    );
    expect(() => parseCliOptions(['--history', 'member'])).toThrow(
      'Member retention reporting arguments are invalid.'
    );
  });

  it('normalizes the exact aggregate schema and rejects accidental private fields', () => {
    const report = validReport();
    expect(validateMemberRetentionReport(report)).toEqual(report);
    expect(() =>
      validateMemberRetentionReport({ ...report, member_id: crypto.randomUUID() })
    ).toThrow('Member retention report returned an invalid aggregate shape.');
    expect(() =>
      validateMemberRetentionReport({
        ...report,
        cohorts: report.cohorts.map((cohort, index) =>
          index === 0 ? { ...cohort, suppressed: true, cohortMemberCount: 4 } : cohort
        )
      })
    ).toThrow('Member retention report returned an invalid aggregate shape.');
  });

  it('creates a private report exactly once', () => {
    const path = join(directory, 'private-report.json');
    const report = validateMemberRetentionReport(validReport());
    writeMemberRetentionReport(path, report);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(report);
    expect(() => writeMemberRetentionReport(path, report)).toThrow(
      'Member retention report path already exists.'
    );
  });
});

function validReport() {
  const cohortStart = new Date('2026-03-30T00:00:00.000Z');
  const cohorts = Array.from({ length: 12 }, (_, index) => {
    const week1 = new Date(cohortStart);
    week1.setUTCDate(week1.getUTCDate() + index * 7);
    const week4 = new Date(week1);
    week4.setUTCDate(week4.getUTCDate() + 21);
    return {
      week1StartsOn: week1.toISOString().slice(0, 10),
      week4StartsOn: week4.toISOString().slice(0, 10),
      suppressed: false,
      cohortMemberCount: 10,
      retainedMemberCount: 5,
      retentionRate: 0.5
    };
  });
  return {
    schemaVersion: 'member-retention-report/v1' as const,
    generatedAt: '2026-07-23T12:00:00.000Z',
    reportingWeekStartsOn: '2026-07-20',
    timeZone: 'Atlantic/Reykjavik' as const,
    suppressionThreshold: 5 as const,
    cohorts,
    rollingFourWeek: {
      windowStartsOn: '2026-06-22',
      windowEndsOn: '2026-07-19',
      suppressed: false,
      engagedMemberCount: 8
    },
    guardrails: {
      windowStartsOn: '2026-06-22',
      windowEndsOn: '2026-07-19',
      signals: [
        'duplicate_check_ins',
        'replayed_requests',
        'rejected_suggestions',
        'rejected_corrections_or_reports',
        'revoked_contributions',
        'excluded_ratings',
        'active_conduct_flags'
      ].map((kind) => ({ kind, suppressed: false, eventCount: 5 }))
    }
  };
}
