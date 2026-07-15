import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  TEST_EVIDENCE_SCHEMA_VERSION,
  validateEvidenceManifest,
  type TestEvidenceArtifact
} from '$server/evaluation/evidence';
import {
  assembleEvidenceManifest,
  collectEvaluationLaneResults,
  getManagedServerEnvironment,
  loadTestEvidence,
  validateEvaluationLaneArtifactFiles,
  validateManifestArtifactFiles
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
import { verifyRecoveryCopyDump } from '../../../scripts/verify-recovery-copy-dump';

describe('release evaluation orchestration', () => {
  it('keeps production recovery fail-closed around the no-Member auth fast path', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );
    const applicationDump = workflow.indexOf('--schema public,private,security');
    const memberCount = workflow.indexOf('select count(*) from private.member_accounts');
    const authUserCount = workflow.indexOf('select count(*) from auth.users');
    const authIdentityCount = workflow.indexOf('select count(*) from auth.identities');
    const zeroMemberBranch = workflow.indexOf('[[ "${member_count}" == "0" ]]');
    const fullAuthDump = workflow.indexOf('--schema auth -f recovery/auth-data.sql');

    expect(applicationDump).toBeGreaterThan(0);
    expect(memberCount).toBeGreaterThan(applicationDump);
    expect(authUserCount).toBeGreaterThan(memberCount);
    expect(authIdentityCount).toBeGreaterThan(authUserCount);
    expect(zeroMemberBranch).toBeGreaterThan(authIdentityCount);
    expect(fullAuthDump).toBeGreaterThan(zeroMemberBranch);
    expect(workflow).toContain('member_count="unknown"');
    expect(workflow).toContain('retaining full auth recovery handling');
    expect(workflow).toContain('[[ "${auth_user_count}" == "0" ]]');
    expect(workflow).toContain('[[ "${auth_identity_count}" == "0" ]]');
  });

  it('holds a production write lock across application and identity capture', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );
    const acquire = workflow.indexOf('acquire_recovery_lock "${db_url}"');
    const applicationDump = workflow.indexOf('--schema public,private,security');
    const identityCounts = workflow.indexOf('(select count(*) from auth.identities)');
    const authDump = workflow.indexOf('--schema auth -f recovery/auth-data.sql');
    const release = workflow.indexOf('release_recovery_lock', authDump);

    expect(workflow).toContain("IN ('public', 'private', 'security', 'auth')");
    expect(workflow).toContain("'lock table ' || table_list || ' in share mode'");
    expect(acquire).toBeGreaterThan(0);
    expect(applicationDump).toBeGreaterThan(acquire);
    expect(identityCounts).toBeGreaterThan(applicationDump);
    expect(authDump).toBeGreaterThan(identityCounts);
    expect(release).toBeGreaterThan(authDump);
  });

  it('rejects invalid or incomplete Auth COPY recovery dumps', () => {
    expect(
      verifyRecoveryCopyDump(
        'COPY auth.users (id) FROM stdin;\nuser-1\n\\.\nCOPY auth.identities (id) FROM stdin;\nidentity-1\n\\.\n',
        'auth.identities 1\nauth.users 1\n'
      )
    ).toBe('auth.identities 1\nauth.users 1');
    expect(() =>
      verifyRecoveryCopyDump('COPY auth.users (id) FROM stdin;\nuser-1\n', 'auth.users 1\n')
    ).toThrow('unterminated');
    expect(() =>
      verifyRecoveryCopyDump(
        'COPY auth.users (id) FROM stdin;\nuser-1\n\\.\n',
        'auth.users 1\nauth.identities 1\n'
      )
    ).toThrow('dump is missing table auth.identities');
    expect(() => verifyRecoveryCopyDump('SET statement_timeout = 0;\n', '')).toThrow(
      'expected table set is empty'
    );
  });

  it('requires non-empty Auth recovery to restore and match every table', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );

    expect(workflow).not.toContain('Auth data restore is not testable');
    expect(workflow).toContain(
      'psql -v ON_ERROR_STOP=1 "${RESTORE_DB_URL}" -f recovery/auth-data.sql'
    );
    expect(workflow).toContain('recovery/auth-production-counts.txt');
    expect(workflow).toContain('recovery/auth-dump-counts.txt');
    expect(workflow).toContain('recovery/auth-restored-counts.txt');
    expect(workflow.match(/\[\[ ! -s recovery\/auth-production-counts\.txt \]\]/g)).toHaveLength(3);
    expect(workflow.match(/\[\[ ! -s recovery\/auth-dump-counts\.txt \]\]/g)).toHaveLength(3);
    expect(workflow.match(/'\^auth\\\.users \[0-9\]\+\$'/g)).toHaveLength(6);
    expect(workflow.match(/'\^auth\\\.identities \[0-9\]\+\$'/g)).toHaveLength(6);
    expect(workflow).toContain(
      'diff -u recovery/auth-dump-counts.txt recovery/auth-restored-counts.txt'
    );
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
    expect(collectEvaluationLaneResults([null, 'not-a-lane'], commitSha).failures).toContain(
      'invalid evaluation lane record'
    );
  });

  it('rejects foreign or duplicate stages, inconsistent exits, and empty evidence', () => {
    const commitSha = 'a'.repeat(40);
    const result = makeLaneResult('static', commitSha);
    result.stages.push({
      name: 'e2e',
      passed: true,
      exitCode: 0,
      evidencePaths: ['test-results/e2e/results.json']
    });
    result.stages.push({ ...result.stages[0] });
    result.stages[1] = { ...result.stages[1], passed: true, exitCode: 1 };
    result.stages[2] = { ...result.stages[2], evidencePaths: ['  '] };

    expect(collectEvaluationLaneResults([result], commitSha).failures).toEqual(
      expect.arrayContaining([
        'static lane contains foreign stage: e2e',
        'static lane contains duplicate stage: format',
        'static lane stage lint has inconsistent passed/exitCode values',
        'static lane stage check must contain non-empty evidence paths'
      ])
    );
  });

  it('rejects traversal, foreign roots, missing files, and non-files in lane evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'hundavaent-evaluation-'));
    const stageRoot = join(root, 'test-results/evaluation/stages');
    mkdirSync(stageRoot, { recursive: true });
    writeFileSync(join(stageRoot, 'format.log'), 'passed\n');
    writeFileSync(join(root, 'outside.log'), 'outside\n');
    symlinkSync(join(root, 'outside.log'), join(stageRoot, 'escaped-link.log'));
    mkdirSync(join(stageRoot, 'directory.log'));
    const result = makeLaneResult('static', 'a'.repeat(40));
    result.stages[0].evidencePaths = [
      'test-results/evaluation/stages/format.log',
      'test-results/evaluation/stages/escaped-link.log'
    ];
    result.stages[1].evidencePaths = ['../outside.log'];
    result.stages[2].evidencePaths = ['test-results/visual/foreign.json'];
    result.stages[3].evidencePaths = ['test-results/evaluation/stages/missing.log'];
    result.stages[4].evidencePaths = ['test-results/evaluation/stages/directory.log'];

    expect(validateEvaluationLaneArtifactFiles([result], root)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'format evidence escapes its allowed artifact roots: test-results/evaluation/stages/escaped-link.log'
        ),
        expect.stringContaining('lint evidence escapes its allowed artifact roots'),
        expect.stringContaining('check evidence escapes its allowed artifact roots'),
        expect.stringContaining('unit evidence is missing'),
        expect.stringContaining('build evidence is not a regular file')
      ])
    );
  });

  it('accepts complete stage and runner evidence from the expected lane roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'hundavaent-valid-lane-'));
    const result = makeLaneResult('e2e', 'a'.repeat(40));
    for (const stage of result.stages) {
      const logPath = join(root, stage.evidencePaths[0]);
      mkdirSync(join(logPath, '..'), { recursive: true });
      writeFileSync(logPath, 'passed\n');
    }
    const resultsPath = 'test-results/e2e/results.json';
    mkdirSync(join(root, 'test-results/e2e'), { recursive: true });
    writeFileSync(join(root, resultsPath), '{}\n');
    result.stages.find((stage) => stage.name === 'e2e')?.evidencePaths.push(resultsPath);

    expect(validateEvaluationLaneArtifactFiles([result], root)).toEqual([]);
  });

  it('rejects malformed test evidence and missing screenshot files', () => {
    const root = mkdtempSync(join(tmpdir(), 'hundavaent-test-evidence-'));
    const visualRoot = join(root, 'test-results/visual');
    mkdirSync(visualRoot, { recursive: true });
    writeFileSync(join(visualRoot, 'evaluation-evidence-malformed.json'), '{bad json');
    writeFileSync(join(visualRoot, 'evaluation-evidence-invalid.json'), '{}');
    writeFileSync(
      join(visualRoot, 'evaluation-evidence-missing-shot.json'),
      JSON.stringify(
        makeTestEvidence({
          screenshots: [{ name: 'missing', path: 'test-results/visual/screenshots/missing.png' }]
        })
      )
    );

    const loaded = loadTestEvidence(visualRoot, root);

    expect(loaded.evidence).toHaveLength(0);
    expect(loaded.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('could not parse test evidence'),
        expect.stringContaining('invalid test evidence'),
        expect.stringContaining('screenshot is missing')
      ])
    );
  });

  it('accepts structurally valid test evidence with a confined screenshot file', () => {
    const root = mkdtempSync(join(tmpdir(), 'hundavaent-valid-evidence-'));
    const visualRoot = join(root, 'test-results/visual');
    const screenshotPath = 'test-results/visual/screenshots/valid.png';
    mkdirSync(join(root, 'test-results/visual/screenshots'), { recursive: true });
    writeFileSync(join(root, screenshotPath), 'png');
    writeFileSync(
      join(visualRoot, 'evaluation-evidence-valid.json'),
      JSON.stringify(makeTestEvidence({ screenshots: [{ name: 'valid', path: screenshotPath }] }))
    );

    const loaded = loadTestEvidence(visualRoot, root);

    expect(loaded.failures).toEqual([]);
    expect(loaded.evidence).toHaveLength(1);
  });

  it('fails the manifest for Axe violations and failed performance measurements', () => {
    const evidence = makeTestEvidence({
      test: {
        title: 'budgets',
        file: 'tests/evaluation/performance.spec.ts',
        status: 'passed',
        durationMs: 10
      },
      required: ['axe', 'timing'],
      axe: [{ violations: 1 }],
      timings: [{ name: 'ttfb', value: 2_000, unit: 'ms', budget: 1_000, passed: false }]
    });
    const manifest = assembleEvidenceManifest({
      stageResults: [],
      testEvidence: [
        { path: 'test-results/performance/evaluation-evidence-budgets.json', artifact: evidence }
      ],
      commitSha: 'a'.repeat(40),
      generatedAt: '2026-07-15T12:00:00.000Z'
    });

    expect(manifest.verdict.failures).toEqual(
      expect.arrayContaining([
        'accessibility evidence contains Axe violations',
        'performance timing failed: ttfb'
      ])
    );
  });

  it('requires every final manifest path to resolve to a regular artifact file', () => {
    const root = mkdtempSync(join(tmpdir(), 'hundavaent-manifest-'));
    const manifest = assembleEvidenceManifest({
      stageResults: [],
      testEvidence: [],
      commitSha: 'a'.repeat(40),
      generatedAt: '2026-07-15T12:00:00.000Z'
    });
    manifest.scenarios[0].evidencePaths = ['../outside.log'];
    manifest.accessibility.treePath = 'test-results/a11y/missing.json';

    expect(validateManifestArtifactFiles(manifest, root)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('manifest path escapes its allowed artifact roots'),
        expect.stringContaining('manifest path is missing')
      ])
    );
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

  it('starts each database-backed lane once and requires browser health evidence', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/evaluation.yml', import.meta.url),
      'utf8'
    );

    expect(workflow.match(/pnpm exec supabase start/g)).toHaveLength(2);
    expect(workflow).not.toContain('supabase db reset');
    expect(evaluationLaneStages.database).toContain('supabase-health-database');
    expect(evaluationLaneStages.e2e).toContain('supabase-health-e2e');
    expect(evaluationLaneStages.a11y).toContain('supabase-health-a11y');
    expect(evaluationLaneStages.visual).toContain('supabase-health-visual');
    expect(evaluationLaneStages.performance).toContain('supabase-health-performance');
    expect(evaluationLaneStages.e2e).toContain('application-health-e2e');
    expect(evaluationLaneStages.a11y).toContain('application-health-a11y');
    expect(evaluationLaneStages.visual).toContain('application-health-visual');
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

function makeLaneResult(
  lane: EvaluationLaneResult['lane'],
  commitSha: string
): EvaluationLaneResult {
  return {
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
  };
}

function makeTestEvidence(overrides: Partial<TestEvidenceArtifact> = {}): TestEvidenceArtifact {
  return {
    schemaVersion: TEST_EVIDENCE_SCHEMA_VERSION,
    test: {
      title: 'visual proof',
      file: 'tests/evaluation/visual.spec.ts',
      status: 'passed',
      durationMs: 10
    },
    required: ['screenshot'],
    console: { errors: [], warnings: [] },
    network: { failedRequests: [] },
    axe: [],
    screenshots: [],
    timings: [],
    ...overrides
  };
}
