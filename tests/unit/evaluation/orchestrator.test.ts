import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateEvidenceManifest } from '$server/evaluation/evidence';
import {
  assembleEvidenceManifest,
  collectEvaluationLaneResults,
  getManagedServerEnvironment,
  getSupabaseAuthHealthUrl,
  runRetriedResetBoundary
} from '../../../scripts/evaluate-release';
import {
  EVALUATION_LANE_SCHEMA_VERSION,
  configureEvaluationSupabase,
  evaluationLaneNames,
  evaluationLaneStages,
  getEvaluationLaneEnvironment,
  getEvaluationLaneRuntime,
  type EvaluationLaneResult
} from '../../../scripts/evaluation-lanes';

describe('release evaluation orchestration', () => {
  it('keeps production recovery fail-closed around the no-Member auth fast path', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );
    const applicationDump = workflow.indexOf('--schema public,private,security');
    const memberCount = workflow.indexOf('select count(*) from private.member_accounts');
    const zeroMemberBranch = workflow.indexOf('[[ "${member_count}" == "0" ]]');
    const fullAuthDump = workflow.indexOf('--schema auth -f recovery/auth-data.sql');

    expect(applicationDump).toBeGreaterThan(0);
    expect(memberCount).toBeGreaterThan(applicationDump);
    expect(zeroMemberBranch).toBeGreaterThan(memberCount);
    expect(fullAuthDump).toBeGreaterThan(zeroMemberBranch);
    expect(workflow).toContain('member_count="unknown"');
    expect(workflow).toContain('retaining full auth recovery handling');
  });

  it('assigns every concurrent lane a distinct runtime identity and port set', () => {
    const runtimes = evaluationLaneNames.map(getEvaluationLaneRuntime);

    expect(new Set(runtimes.map((runtime) => runtime.projectId)).size).toBe(runtimes.length);
    expect(
      new Set(
        runtimes.flatMap((runtime) => [
          runtime.apiPort,
          runtime.databasePort,
          runtime.shadowDatabasePort,
          runtime.smtpPort,
          runtime.appPort,
          runtime.gatePort,
          runtime.providerPort,
          runtime.performancePort
        ])
      ).size
    ).toBe(runtimes.length * 8);
  });

  it('configures Supabase and browser origins for an isolated lane', () => {
    const source = `project_id = "hundavaent"

[api]
port = 55321

[db]
port = 55322
shadow_port = 55320

[local_smtp]
port = 55324

[auth]
site_url = "http://127.0.0.1:5173"
additional_redirect_urls = ["http://127.0.0.1:4173/en"]
`;
    const configured = configureEvaluationSupabase(source, 'visual');
    const runtime = getEvaluationLaneRuntime('visual');

    expect(configured).toContain(`project_id = "${runtime.projectId}"`);
    expect(configured).toContain(`port = ${runtime.apiPort}`);
    expect(configured).toContain(`port = ${runtime.databasePort}`);
    expect(configured).toContain(`shadow_port = ${runtime.shadowDatabasePort}`);
    expect(configured).toContain(`site_url = "http://127.0.0.1:${runtime.appPort}"`);
    expect(configured).not.toContain('127.0.0.1:4173');
    expect(getEvaluationLaneEnvironment('visual').HUNDAVAENT_E2E_APP_PORT).toBe(
      String(runtime.appPort)
    );
  });

  it('rejects missing, duplicate, and wrong-SHA lane evidence', () => {
    const commitSha = 'a'.repeat(40);
    const makeResult = (lane: EvaluationLaneResult['lane']): EvaluationLaneResult => ({
      schemaVersion: EVALUATION_LANE_SCHEMA_VERSION,
      lane,
      requestedCommitSha: commitSha,
      commitSha,
      startedAt: '2026-07-15T10:00:00.000Z',
      finishedAt: '2026-07-15T10:01:00.000Z',
      durationMs: 60_000,
      stages: evaluationLaneStages[lane].map((name) => ({
        name,
        passed: true,
        exitCode: 0,
        evidencePaths: [`test-results/evaluation/stages/${name}.log`]
      }))
    });
    const results = evaluationLaneNames.map(makeResult);

    expect(collectEvaluationLaneResults(results, commitSha)).toMatchObject({ failures: [] });
    expect(collectEvaluationLaneResults(results.slice(1), commitSha).failures).toContain(
      'missing evaluation lane: static'
    );
    expect(
      collectEvaluationLaneResults([...results, makeResult('static')], commitSha).failures
    ).toContain('duplicate evaluation lane: static');
    expect(
      collectEvaluationLaneResults(
        results.map((result) =>
          result.lane === 'visual' ? { ...result, commitSha: 'b'.repeat(40) } : result
        ),
        commitSha
      ).failures
    ).toContain(`visual lane observed unexpected commit ${'b'.repeat(40)}`);
  });
  it('starts the managed browser server with the complete local Member auth contract', () => {
    expect(
      getManagedServerEnvironment(
        {
          apiUrl: 'http://127.0.0.1:54321',
          publishableKey: 'local-publishable-key'
        },
        { PATH: '/usr/bin', HUNDAVAENT_E2E_APP_PORT: '43173' },
        'evaluation-server-123'
      )
    ).toMatchObject({
      PATH: '/usr/bin',
      EVALUATION_MANAGED_SERVER: '1',
      HUNDAVAENT_EVALUATION_SERVER_ID: 'evaluation-server-123',
      PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
      PUBLIC_APP_URL: 'http://127.0.0.1:43173',
      AUTH_EMAIL_ENABLED: 'true',
      AUTH_FACEBOOK_ENABLED: 'false',
      MEMBER_ACTIVATION_SECRET: 'local-member-activation-capability-secret-v1'
    });
  });

  it('waits on the local Auth service after a visual database reset', () => {
    expect(getSupabaseAuthHealthUrl({ apiUrl: 'http://127.0.0.1:54321' })).toBe(
      'http://127.0.0.1:54321/auth/v1/health'
    );
  });

  it('repeats the complete database reset boundary when Auth stays unhealthy', async () => {
    let resetAttempts = 0;
    let healthAttempts = 0;

    const results = await runRetriedResetBoundary(
      async () => {
        resetAttempts += 1;
        return {
          name: 'database-reset-before-visual',
          passed: true,
          exitCode: 0,
          evidencePaths: ['reset.log']
        };
      },
      async () => {
        healthAttempts += 1;
        return {
          name: 'auth-health-before-visual',
          passed: healthAttempts > 1,
          exitCode: healthAttempts > 1 ? 0 : null,
          evidencePaths: ['auth-health.log']
        };
      },
      { retryDelayMs: 0, sleep: async () => undefined }
    );

    expect(resetAttempts).toBe(2);
    expect(healthAttempts).toBe(2);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it('emits an explicit failing manifest when required stages and evidence are missing', () => {
    const manifest = assembleEvidenceManifest({
      stageResults: [],
      testEvidence: [],
      commitSha: 'abc1234',
      generatedAt: '2026-07-09T12:00:00.000Z'
    });

    expect(manifest.verdict.status).toBe('fail');
    expect(manifest.verdict.failures).toEqual(
      expect.arrayContaining([
        'accessibility evidence is missing',
        'Icelandic visual evidence is incomplete',
        'English visual evidence is incomplete',
        'performance evidence is missing',
        'scenario failed or lacks evidence: moderator-candidate-creation'
      ])
    );
    expect(validateEvidenceManifest(manifest).valid).toBe(false);
  });
});
