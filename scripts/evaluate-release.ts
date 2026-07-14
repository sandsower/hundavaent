import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceManifest,
  type EvidenceManifest,
  type EvidenceVerdict,
  type ScreenshotEvidence,
  type TestEvidenceArtifact
} from '../src/lib/server/evaluation/evidence.ts';
import { evaluationScenarioCatalogue } from '../src/lib/server/evaluation/scenarios.ts';
import {
  getLocalMemberAuthEnvironment,
  getLocalSupabaseStatus,
  type LocalSupabaseStatus
} from '../tests/e2e/support/local-supabase.ts';
import { waitForHealth } from './wait-for-health.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const artifactRoot = join(repositoryRoot, 'test-results/evaluation');
const stageRoot = join(artifactRoot, 'stages');

export interface EvaluationStageResult {
  name: string;
  passed: boolean;
  exitCode: number | null;
  evidencePaths: string[];
  failure?: string;
}

interface LoadedTestEvidence {
  path: string;
  artifact: TestEvidenceArtifact;
}

export interface ManifestAssemblyInput {
  stageResults: EvaluationStageResult[];
  testEvidence: LoadedTestEvidence[];
  commitSha: string;
  generatedAt: string;
}

const scenarioStages: Record<string, string[]> = {
  'moderator-candidate-creation': ['e2e'],
  'moderator-publication': ['database', 'e2e'],
  'visitor-discovery-is': ['e2e'],
  'visitor-discovery-en': ['e2e'],
  'public-private-denials': ['database', 'e2e'],
  'language-state-preservation': ['component', 'e2e'],
  'map-failure-fallback': ['e2e'],
  'maplibre-smoke': ['map-smoke'],
  'accessibility-keyboard': ['a11y'],
  'visual-is': ['visual'],
  'visual-en': ['visual'],
  'public-performance': ['performance']
};

export function assembleEvidenceManifest({
  stageResults,
  testEvidence,
  commitSha,
  generatedAt
}: ManifestAssemblyInput): EvidenceManifest {
  const failures = stageResults
    .filter((stage) => !stage.passed)
    .map((stage) => `${stage.name}: ${stage.failure ?? `exit ${stage.exitCode}`}`);
  const stageByName = new Map(stageResults.map((stage) => [stage.name, stage]));
  const a11yEvidence = testEvidence.filter((item) =>
    item.artifact.test.file.endsWith('a11y.spec.ts')
  );
  const visualEvidence = testEvidence.filter((item) =>
    item.artifact.test.file.endsWith('visual.spec.ts')
  );
  const performanceEvidence = testEvidence.filter((item) =>
    item.artifact.test.file.endsWith('performance.spec.ts')
  );

  const consoleErrors = testEvidence.flatMap((item) => item.artifact.console.errors);
  const consoleWarnings = testEvidence.flatMap((item) => item.artifact.console.warnings);
  const failedRequests = testEvidence.flatMap((item) => item.artifact.network.failedRequests);
  if (consoleErrors.length > 0) failures.push('evaluation evidence contains console errors');
  if (failedRequests.length > 0) failures.push('evaluation evidence contains failed requests');

  const screenshots = visualEvidence.flatMap((item) =>
    item.artifact.screenshots.map((screenshot): ScreenshotEvidence => ({
      name: screenshot.name.replace(/\.png$/, ''),
      locale: screenshot.name.includes('-is-') ? 'is' : 'en',
      viewport: screenshot.name.includes('-mobile') ? 'mobile' : 'desktop',
      path: screenshot.path
    }))
  );
  const performanceMeasurements = performanceEvidence.flatMap((item) => item.artifact.timings);
  const axeViolations = a11yEvidence
    .flatMap((item) => item.artifact.axe)
    .reduce((total, result) => total + result.violations, 0);

  if (a11yEvidence.length === 0) failures.push('accessibility evidence is missing');
  if (screenshots.filter((item) => item.locale === 'is').length < 8) {
    failures.push('Icelandic visual evidence is incomplete');
  }
  if (screenshots.filter((item) => item.locale === 'en').length < 8) {
    failures.push('English visual evidence is incomplete');
  }
  if (performanceMeasurements.length === 0) failures.push('performance evidence is missing');

  const scenarios = evaluationScenarioCatalogue.scenarios.map((scenario) => {
    const requiredStages = scenarioStages[scenario.id] ?? [];
    const stages = requiredStages.map((name) => stageByName.get(name));
    const evidencePaths = unique(
      stages
        .flatMap((stage) => stage?.evidencePaths ?? [])
        .concat(
          scenario.id === 'accessibility-keyboard'
            ? a11yEvidence.map((item) => item.path)
            : scenario.id === 'visual-is'
              ? screenshots.filter((item) => item.locale === 'is').map((item) => item.path)
              : scenario.id === 'visual-en'
                ? screenshots.filter((item) => item.locale === 'en').map((item) => item.path)
                : scenario.id === 'public-performance'
                  ? performanceEvidence.map((item) => item.path)
                  : []
        )
    );
    const passed =
      requiredStages.length > 0 &&
      stages.every((stage) => stage?.passed === true) &&
      evidencePaths.length > 0;
    if (!passed) failures.push(`scenario failed or lacks evidence: ${scenario.id}`);
    return {
      id: scenario.id,
      verdict: (passed ? 'pass' : 'fail') as EvidenceVerdict,
      evidencePaths: evidencePaths.length > 0 ? evidencePaths : [`missing/${scenario.id}`]
    };
  });

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    run: {
      id: `evaluation-${generatedAt.replaceAll(/[^0-9]/g, '').slice(0, 14)}`,
      commitSha,
      generatedAt
    },
    scenarios,
    console: { errors: consoleErrors, warnings: consoleWarnings },
    network: { failedRequests },
    accessibility: {
      axeViolations,
      keyboardPassed: stageByName.get('a11y')?.passed === true,
      treePath: a11yEvidence[0]?.path ?? 'missing/a11y-evidence.json'
    },
    visual: { screenshots },
    performance: { measurements: performanceMeasurements },
    verdict: {
      status: failures.length === 0 ? 'pass' : 'fail',
      failures: unique(failures)
    }
  };
}

async function runCommandStage(
  name: string,
  args: string[],
  extraEvidencePaths: string[] = []
): Promise<EvaluationStageResult> {
  const logPath = join(stageRoot, `${name}.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  const log = createWriteStream(logPath, { flags: 'w' });
  console.log(`\n[${name}] pnpm ${args.join(' ')}`);

  return new Promise((resolveStage) => {
    const child = spawn('pnpm', args, {
      cwd: repositoryRoot,
      env: { ...process.env, EVALUATION_MANAGED_SERVER: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    child.once('error', (error) => {
      log.end();
      resolveStage({
        name,
        passed: false,
        exitCode: null,
        failure: error.message,
        evidencePaths: [relative(repositoryRoot, logPath), ...extraEvidencePaths]
      });
    });
    child.once('exit', (exitCode) => {
      log.end();
      resolveStage({
        name,
        passed: exitCode === 0,
        exitCode,
        failure: exitCode === 0 ? undefined : `command exited with ${exitCode}`,
        evidencePaths: [relative(repositoryRoot, logPath), ...extraEvidencePaths]
      });
    });
  });
}

async function runRetriedSetupStage(
  name: string,
  args: string[],
  attempts = 3,
  retryDelayMs = 2_000
): Promise<EvaluationStageResult> {
  let result = await runCommandStage(name, args);

  for (let attempt = 2; !result.passed && attempt <= attempts; attempt += 1) {
    console.warn(
      `[${name}] local Supabase setup attempt ${attempt - 1} failed; retrying after ${retryDelayMs}ms`
    );
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, retryDelayMs));
    result = await runCommandStage(name, args);
  }

  return result;
}

async function resetDatabaseBefore(stageName: string): Promise<EvaluationStageResult[]> {
  const reset = await runRetriedSetupStage(`database-reset-before-${stageName}`, [
    'exec',
    'supabase',
    'db',
    'reset'
  ]);
  if (!reset.passed) return [reset];

  // The CLI can return from db reset while GoTrue is still restarting on a loaded CI runner.
  // Treat Auth readiness as part of every reset boundary before the next stage provisions users.
  return [reset, await waitForSupabaseAuthStage(`auth-health-before-${stageName}`)];
}

async function startManagedServer(): Promise<{
  child: ChildProcess;
  result: EvaluationStageResult;
}> {
  const status = getLocalSupabaseStatus();
  const serverId = randomUUID();
  const appOrigin = getEvaluationAppOrigin(process.env);
  const appPort = new URL(appOrigin).port;
  const healthUrl = new URL('/api/health', appOrigin).toString();
  const logPath = join(stageRoot, 'application-health.log');
  const log = createWriteStream(logPath, { flags: 'w' });
  const child = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', appPort], {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    env: getManagedServerEnvironment(status, process.env, serverId),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk: Buffer) => log.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => log.write(chunk));

  try {
    await Promise.race([
      waitForHealth({
        url: healthUrl,
        timeoutMs: 60_000,
        acceptResponse: (response) =>
          response.headers.get('x-hundavaent-evaluation-server') === serverId
      }),
      new Promise<never>((_, reject) => {
        child.once('exit', (code) => reject(new Error(`application server exited with ${code}`)));
      })
    ]);
    log.write(`Healthy: ${healthUrl}\n`);
    return {
      child,
      result: {
        name: 'application-health',
        passed: true,
        exitCode: 0,
        evidencePaths: [relative(repositoryRoot, logPath)]
      }
    };
  } catch (error) {
    return {
      child,
      result: {
        name: 'application-health',
        passed: false,
        exitCode: child.exitCode,
        failure: error instanceof Error ? error.message : String(error),
        evidencePaths: [relative(repositoryRoot, logPath)]
      }
    };
  }
}

export function getManagedServerEnvironment(
  status: Pick<LocalSupabaseStatus, 'apiUrl' | 'publishableKey'>,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  evaluationServerId?: string
): NodeJS.ProcessEnv {
  const appOrigin = getEvaluationAppOrigin(baseEnvironment);
  return {
    ...baseEnvironment,
    EVALUATION_MANAGED_SERVER: '1',
    ...(evaluationServerId ? { HUNDAVAENT_EVALUATION_SERVER_ID: evaluationServerId } : {}),
    PUBLIC_SUPABASE_URL: status.apiUrl,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
    ...getLocalMemberAuthEnvironment(appOrigin)
  };
}

export function getEvaluationAppOrigin(baseEnvironment: NodeJS.ProcessEnv = process.env): string {
  const port = baseEnvironment.HUNDAVAENT_E2E_APP_PORT?.trim() || '4173';
  return `http://127.0.0.1:${port}`;
}

export function getSupabaseAuthHealthUrl(status: Pick<LocalSupabaseStatus, 'apiUrl'>): string {
  return new URL('/auth/v1/health', status.apiUrl).toString();
}

async function waitForSupabaseAuthStage(name: string): Promise<EvaluationStageResult> {
  const logPath = join(stageRoot, `${name}.log`);
  const url = getSupabaseAuthHealthUrl(getLocalSupabaseStatus());
  try {
    await waitForHealth({ url, timeoutMs: 60_000 });
    writeFileSync(logPath, `Healthy: ${url}\n`, 'utf8');
    return {
      name,
      passed: true,
      exitCode: 0,
      evidencePaths: [relative(repositoryRoot, logPath)]
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    writeFileSync(logPath, `${failure}\n`, 'utf8');
    return {
      name,
      passed: false,
      exitCode: null,
      failure,
      evidencePaths: [relative(repositoryRoot, logPath)]
    };
  }
}

async function stopManagedServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.pid) return;
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
  if (process.platform === 'win32') child.kill('SIGTERM');
  else process.kill(-child.pid, 'SIGTERM');
  await Promise.race([exited, new Promise<void>((resolveWait) => setTimeout(resolveWait, 5_000))]);
  if (child.exitCode === null) {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  }
}

async function main(): Promise<void> {
  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });
  const stageResults: EvaluationStageResult[] = [];
  let server: ChildProcess | undefined;

  stageResults.push(
    await runCommandStage('database-stop', ['exec', 'supabase', 'stop', '--no-backup'])
  );
  stageResults.push(await runRetriedSetupStage('database-start', ['exec', 'supabase', 'start']));
  stageResults.push(
    await runRetriedSetupStage('database-reset', ['exec', 'supabase', 'db', 'reset'])
  );
  stageResults.push(await runCommandStage('format', ['format:check']));
  stageResults.push(await runCommandStage('lint', ['lint']));
  stageResults.push(await runCommandStage('check', ['check']));
  stageResults.push(await runCommandStage('unit', ['test:unit']));
  stageResults.push(await runCommandStage('component', ['test:component']));
  stageResults.push(...(await resetDatabaseBefore('database')));
  stageResults.push(await runCommandStage('database', ['test:database']));
  stageResults.push(await runCommandStage('map-smoke', ['test:map-smoke']));
  stageResults.push(...(await resetDatabaseBefore('browser-journeys')));

  try {
    const application = await startManagedServer();
    server = application.child;
    stageResults.push(application.result);
    stageResults.push(
      await runCommandStage('e2e', ['test:e2e'], ['test-results/e2e/results.json'])
    );
    stageResults.push(...(await resetDatabaseBefore('a11y')));
    stageResults.push(
      await runCommandStage('a11y', ['test:a11y'], ['test-results/a11y/results.json'])
    );
    stageResults.push(...(await resetDatabaseBefore('visual')));
    stageResults.push(
      await runCommandStage('visual', ['test:visual'], ['test-results/visual/results.json'])
    );
  } catch (error) {
    stageResults.push({
      name: 'application-health',
      passed: false,
      exitCode: null,
      failure: error instanceof Error ? error.message : String(error),
      evidencePaths: ['test-results/evaluation/stages/application-health.log']
    });
  } finally {
    if (server) await stopManagedServer(server);
  }

  stageResults.push(...(await resetDatabaseBefore('performance')));
  stageResults.push(
    await runCommandStage(
      'performance',
      ['test:performance'],
      ['test-results/performance/results.json']
    )
  );
  stageResults.push(await runCommandStage('build', ['build']));

  const generatedAt = new Date().toISOString();
  const manifest = assembleEvidenceManifest({
    stageResults,
    testEvidence: [
      join(repositoryRoot, 'test-results/a11y'),
      join(repositoryRoot, 'test-results/visual'),
      join(repositoryRoot, 'test-results/performance')
    ].flatMap(loadTestEvidence),
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8'
    }).trim(),
    generatedAt
  });
  const validation = validateEvidenceManifest(manifest);
  if (!validation.valid) {
    manifest.verdict.status = 'fail';
    manifest.verdict.failures.push(...validation.errors.map((error) => `manifest: ${error}`));
  }
  const manifestPath = join(artifactRoot, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nEvaluation evidence: ${relative(repositoryRoot, manifestPath)}`);
  console.log(`Verdict: ${manifest.verdict.status}`);
  if (manifest.verdict.failures.length > 0) {
    for (const failure of manifest.verdict.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

function loadTestEvidence(root: string): LoadedTestEvidence[] {
  if (!existsSync(root)) return [];
  return walkFiles(root)
    .filter((path) => path.endsWith('.json') && path.includes('evaluation-evidence-'))
    .map((path) => ({
      path: relative(repositoryRoot, path),
      artifact: JSON.parse(readFileSync(path, 'utf8')) as TestEvidenceArtifact
    }));
}

function walkFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
