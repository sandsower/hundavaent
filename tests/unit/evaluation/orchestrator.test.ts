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
  it('deploys successful main CI commits automatically while retaining protected manual operations', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );
    const jobsStart = workflow.indexOf('\njobs:\n');
    const migrateStart = workflow.indexOf('\n  migrate:\n', jobsStart);
    const deployStart = workflow.indexOf('\n  deploy:\n', migrateStart);
    const translationFinalizeStart = workflow.indexOf(
      '\n  finalize-translation-capability:\n',
      deployStart
    );
    const achievementActivationStart = workflow.indexOf(
      '\n  activate-achievement-milestones:\n',
      translationFinalizeStart
    );
    const trustedActivationStart = workflow.indexOf(
      '\n  activate-trusted-contributor:\n',
      achievementActivationStart
    );
    const migrateJob = workflow.slice(migrateStart, deployStart);
    const deployJob = workflow.slice(deployStart, translationFinalizeStart);
    const achievementActivationJob = workflow.slice(
      achievementActivationStart,
      trustedActivationStart
    );
    const trustedActivationJob = workflow.slice(trustedActivationStart);

    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain("workflows: ['CI']");
    expect(workflow).toContain('types: [completed]');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain(
      "RELEASE_SHA: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || inputs.sha }}"
    );
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(migrateJob).toContain("github.event_name == 'workflow_run'");
    expect(migrateJob).toContain('inputs.migrate &&');
    expect(migrateJob).toContain('!inputs.activate_achievement_milestones');
    expect(migrateJob).toContain('!inputs.activate_trusted_contributor');
    expect(deployJob).toContain("github.event_name == 'workflow_run'");
    expect(deployJob).toContain('inputs.deploy &&');
    expect(deployJob).toContain('!inputs.activate_achievement_milestones');
    expect(deployJob).toContain('!inputs.activate_trusted_contributor');
    expect(workflow.match(/inputs\.sha/g)).toHaveLength(1);
    expect(workflow).toContain('ref: ${{ env.RELEASE_SHA }}');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "${RELEASE_SHA}"');
    expect(workflow).toContain('activate_achievement_milestones:');
    expect(achievementActivationJob).toContain('needs: recovery-point');
    expect(achievementActivationJob).toContain(
      'test "$(jq -r \'.release\' <<< "${health}")" = "${RELEASE_SHA}"'
    );
    expect(achievementActivationJob).toContain('set local role service_role;');
    expect(achievementActivationJob).toContain("'achievement-collections-v1'");
    expect(achievementActivationJob).toContain('set local role anon;');
    expect(workflow).toContain('activate_trusted_contributor:');
    expect(trustedActivationJob).toContain('needs: recovery-point');
    expect(trustedActivationJob).toContain(
      'test "$(jq -r \'.release\' <<< "${health}")" = "${RELEASE_SHA}"'
    );
    expect(trustedActivationJob).toContain('set local role service_role;');
    expect(trustedActivationJob).toContain("'trusted-contributor-v1'");
    expect(trustedActivationJob).toContain("'sustained_quality_contributor'");
    expect(trustedActivationJob).toContain('"trusted-contributor-v1|5|1 year|3|3|0|t|0"');
  });

  it('excludes hard identity rows while preserving and neutralizing core application data', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );
    const applicationDump = workflow.indexOf(
      'dump_snapshot_data "public|private|security" recovery/data.sql'
    );
    const storageSchema = workflow.indexOf(
      'dump_snapshot_schema "storage" recovery/storage-schema.sql'
    );
    const storageData = workflow.indexOf('dump_snapshot_data "storage" recovery/storage-data.sql');
    const checkRelaxationDerivation = workflow.indexOf(
      'order by 1" > recovery/auth-recovery-check-relaxations.txt'
    );
    const generatedCheckDrop = workflow.indexOf(
      'printf \'ALTER TABLE "%s"."%s" DROP CONSTRAINT "%s";\\n\''
    );
    const generatedNeutralization = workflow.indexOf(
      'printf \'UPDATE "%s"."%s" SET "%s" = NULL WHERE "%s" IS NOT NULL;\\n\''
    );
    const restoredAbsenceProof = workflow.indexOf(
      'A recovery-relaxed Auth-dependent check constraint remains installed.'
    );
    const manifestAssembly = workflow.indexOf(
      'auth_recovery_check_relaxations: $auth_recovery_check_relaxations'
    );

    expect(applicationDump).toBeGreaterThan(0);
    expect(checkRelaxationDerivation).toBeGreaterThan(0);
    expect(checkRelaxationDerivation).toBeLessThan(applicationDump);
    expect(generatedCheckDrop).toBeGreaterThan(0);
    expect(generatedCheckDrop).toBeLessThan(generatedNeutralization);
    expect(restoredAbsenceProof).toBeGreaterThan(applicationDump);
    expect(manifestAssembly).toBeGreaterThan(restoredAbsenceProof);
    expect(storageSchema).toBeGreaterThan(applicationDump);
    expect(storageData).toBeGreaterThan(storageSchema);
    expect(workflow).not.toContain('dump_snapshot_schema "auth"');
    expect(workflow).not.toContain('dump_snapshot_data "auth"');
    expect(workflow).not.toContain('select count(*) from auth.users');
    expect(workflow).toContain(
      'Managed Auth and hard identity-owned test rows: intentionally skipped'
    );
    expect(workflow).toContain('with recursive hard_auth_tables(table_oid)');
    expect(workflow).toContain("select 'auth.users'::regclass::oid");
    expect(workflow).toContain("grep -Fxq 'private.member_accounts'");
    expect(workflow).toContain("grep -Fxq 'private.places'");
    expect(workflow).toContain("grep -Fxq 'private.place_media'");
    expect(workflow).toContain('recovery/auth-hard-excluded-counts.txt');
    expect(workflow).toContain('recovery/auth-hard-excluded-restored-counts.txt');
    expect(workflow).toContain('recovery/auth-neutralized-references.txt');
    expect(workflow).toContain('recovery/auth-neutralized-restored-counts.txt');
    expect(workflow).toContain('recovery/auth-recovery-check-relaxations.txt');
    expect(workflow).toContain('f.attnum = any(check_constraint.conkey)');
    expect(workflow).toContain('ALTER TABLE "%s"."%s" DROP CONSTRAINT "%s";');
    expect(workflow).toContain('private.place_media|place_media_approval_requires_metadata_check');
    expect(workflow).toContain('private.auth_pending_intents|auth_pending_intent_lifecycle_check');
    expect(workflow).toContain('auth_recovery_check_relaxations');
    expect(workflow).toContain(
      'A recovery-relaxed Auth-dependent check constraint remains installed.'
    );
    expect(workflow).toContain(
      'Composite foreign keys cross the disposable Auth recovery boundary.'
    );
    expect(workflow).toContain('where not attribute_row.attnotnull');
    expect(workflow).toContain('"${table}.${column}" == "private.place_media.uploaded_by"');
    expect(workflow).toContain('constraint_row.confrelid in (${hard_parent_oids})');
    expect(workflow).toContain('exclusion_args+=("--exclude-table-data=${table}")');
    expect(workflow).toContain('SET "%s" = NULL WHERE "%s" IS NOT NULL');
    expect(workflow).toContain('hard_excluded_auth_tables');
    expect(workflow).toContain('neutralized_auth_references');
    expect(workflow).toContain(
      'any(.neutralized_auth_references[]; .table == "private.places" and .column == "created_by")'
    );
    expect(workflow).toContain(
      'any(.neutralized_auth_references[]; .table == "private.place_media" and .column == "uploaded_by")'
    );
    expect(workflow).toContain(
      'all(.hard_excluded_auth_tables[]; .table != "private.places" and .table != "private.place_media")'
    );
    expect(workflow).toContain('(.auth_recovery_schema_relaxations | length == 1)');
    expect(workflow).toContain(
      'ALTER TABLE "private"."place_media" ALTER COLUMN "uploaded_by" DROP NOT NULL;'
    );
    expect(workflow).toContain('Restored Place media uploader attribution is not nullable.');
    expect(workflow).toContain("'^private\\.places [0-9]+$'");
    expect(workflow).toContain("'^private\\.place_media [0-9]+$'");
    expect(workflow).toContain(
      'BACKUP_PASSPHRASE: ${{ secrets.HUNDAVAENT_PRODUCTION_BACKUP_PASSPHRASE }}'
    );
    expect(workflow).toContain(
      'AUTH_EMAIL_ENABLED: ${{ vars.HUNDAVAENT_PRODUCTION_AUTH_EMAIL_ENABLED }}'
    );
    expect(workflow).toContain(
      'AUTH_FACEBOOK_ENABLED: ${{ vars.HUNDAVAENT_PRODUCTION_AUTH_FACEBOOK_ENABLED }}'
    );
    expect(workflow.match(/AUTH_EMAIL_ENABLED}" != "false"/g)).toHaveLength(2);
    expect(workflow.match(/AUTH_FACEBOOK_ENABLED}" != "false"/g)).toHaveLength(2);
  });

  it('retains only an encrypted, checksummed recovery archive and fail-closes plaintext upload', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );

    expect(workflow).toContain("--sort=name --mtime='UTC 1970-01-01'");
    expect(workflow).toContain('--owner=0 --group=0 --numeric-owner');
    expect(workflow).toContain('gzip -n -9');
    expect(workflow).toContain('openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000');
    expect(workflow).toContain('plaintext_archive_sha256');
    expect(workflow).toContain('ciphertext_sha256');
    expect(workflow).toContain('managed_auth_mode');
    expect(workflow).toContain('excluded-prelaunch-auth-and-hard-identity-rows-providers-disabled');
    expect(workflow).toContain('rm -rf recovery');
    expect(workflow).toContain('test ! -e recovery');
    expect(workflow).toContain('test ! -e "${plaintext_archive}"');
    expect(workflow).toContain('retained-recovery/recovery-manifest.json');
    expect(workflow).toContain('path: retained-recovery/');
    expect(workflow).toContain('retention-days: 90');
    expect(workflow).not.toContain('path: recovery/');
    expect(workflow).toContain("'*.sql'");
    expect(workflow).toContain("'*.log'");
    expect(workflow).toContain("'*.txt'");
    expect(workflow).toContain("'*.tar.gz'");
  });

  it('uses one permission-compatible exported snapshot for every production read', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );
    const exportedSnapshot = workflow.indexOf('SELECT pg_export_snapshot()');
    const applicationDump = workflow.indexOf(
      'dump_snapshot_data "public|private|security" recovery/data.sql'
    );
    const storageDump = workflow.indexOf('dump_snapshot_data "storage" recovery/storage-data.sql');
    const applicationCounts = workflow.indexOf("n.nspname in ('public', 'private', 'security')");
    const release = workflow.indexOf('release_recovery_snapshot', storageDump);

    expect(workflow).not.toMatch(/LOCK TABLE/i);
    expect(workflow).toContain('SET TRANSACTION SNAPSHOT');
    expect(workflow).toContain('--snapshot "${recovery_snapshot}"');
    expect(workflow).toContain(
      'public.ecr.aws/supabase/postgres:17.6.1.143@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453'
    );
    expect(workflow).not.toContain('docker run --rm supabase/postgres:17.6.1.143');
    expect(workflow).toContain('pg_dump --version');
    expect(workflow).toContain('psql -X -qAt -v ON_ERROR_STOP=1 "$1"');
    expect(workflow).toContain("psql -X -qAt -F ' ' -v ON_ERROR_STOP=1");
    expect(workflow).toContain('${query};\n          COMMIT;');
    expect(workflow).toContain('--quote-all-identifier');
    expect(workflow).toContain('--role "postgres"');
    expect(workflow).not.toContain('--exclude-table "auth.schema_migrations"');
    expect(workflow).not.toContain('--exclude-table "storage.migrations"');
    expect(workflow.match(/snapshot_query/g)).toHaveLength(13);
    expect(workflow.match(/dump_snapshot_data/g)).toHaveLength(3);
    expect(exportedSnapshot).toBeGreaterThan(0);
    expect(applicationDump).toBeGreaterThan(exportedSnapshot);
    expect(storageDump).toBeGreaterThan(applicationDump);
    expect(applicationCounts).toBeGreaterThan(storageDump);
    expect(release).toBeGreaterThan(applicationCounts);
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

  it('restores and exactly verifies Storage without preserving test Auth identities', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/production.yml', import.meta.url),
      'utf8'
    );

    expect(workflow).toContain('dump_snapshot_schema "storage" recovery/storage-schema.sql');
    expect(workflow).toContain('dump_snapshot_data "storage" recovery/storage-data.sql');
    expect(workflow).toContain("and n.nspname = 'storage'\" |");
    expect(workflow).not.toContain("c.relname <> 'migrations'");
    expect(workflow).toContain("array_to_string(roles, ',')");
    expect(workflow).toContain('quote_nullable(with_check)');
    expect(workflow).toContain('[[ ! -s recovery/storage-schema.sql ]]');
    expect(workflow).not.toContain("-c 'drop schema if exists auth cascade'");
    expect(workflow).toContain(
      'psql -v ON_ERROR_STOP=1 "${RESTORE_DB_URL}?user=supabase_admin" \\\n' +
        "            -c 'alter schema storage rename to scratch_storage'"
    );
    expect(workflow).toContain('psql "${RESTORE_DB_URL}" -f recovery/roles.sql || true');
    expect(workflow).toContain(
      'psql -v ON_ERROR_STOP=1 "${RESTORE_DB_URL}" -f recovery/schema.sql'
    );
    for (const recoveryFile of ['storage-schema.sql', 'storage-data.sql', 'data.sql']) {
      expect(workflow).toContain(
        `psql -v ON_ERROR_STOP=1 "\${RESTORE_DB_URL}?user=supabase_admin" \\\n` +
          `            -f recovery/${recoveryFile}`
      );
      expect(workflow).not.toContain(
        `psql -v ON_ERROR_STOP=1 "\${RESTORE_DB_URL}" -f recovery/${recoveryFile}`
      );
    }
    expect(workflow).toContain(
      'actual="$(psql -At "${recovery_db_url}" -c "select count(*) from ${table}")"'
    );
    expect(workflow).toContain('recovery/storage-restored-counts.txt');
    expect(workflow).toContain('recovery/storage-production-schema.txt');
    expect(workflow).toContain('recovery/storage-restored-schema.txt');
    expect(workflow).toContain('diff -u recovery/storage-dump-counts.txt');
    expect(workflow).not.toContain('recovery/auth-data.sql');
    expect(workflow).not.toContain('recovery/auth-schema.sql');
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
