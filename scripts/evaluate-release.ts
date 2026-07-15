import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
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
import {
  EVALUATION_LANE_SCHEMA_VERSION,
  evaluationLaneNames,
  evaluationLaneStages,
  isEvaluationLaneName,
  type EvaluationLaneName,
  type EvaluationLaneResult
} from './evaluation-lanes.ts';
import { waitForHealth } from './wait-for-health.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const artifactRoot = join(repositoryRoot, 'test-results/evaluation');
const stageRoot = join(artifactRoot, 'stages');
const laneRoot = join(artifactRoot, 'lanes');

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

export interface CollectedEvaluationLanes {
  stageResults: EvaluationStageResult[];
  failures: string[];
}

export function collectEvaluationLaneResults(
  laneResults: EvaluationLaneResult[],
  expectedCommitSha: string
): CollectedEvaluationLanes {
  const failures: string[] = [];
  const lanes = new Map<EvaluationLaneName, EvaluationLaneResult>();

  for (const result of laneResults) {
    if (!isEvaluationLaneName(result.lane)) {
      failures.push(`unknown evaluation lane: ${String(result.lane)}`);
      continue;
    }
    if (result.schemaVersion !== EVALUATION_LANE_SCHEMA_VERSION) {
      failures.push(`${result.lane} lane has unsupported schema ${result.schemaVersion}`);
      continue;
    }
    if (!Array.isArray(result.stages)) {
      failures.push(`${result.lane} lane has an invalid stage collection`);
      continue;
    }
    if (
      result.stages.some(
        (stage) =>
          typeof stage?.name !== 'string' ||
          typeof stage.passed !== 'boolean' ||
          !Array.isArray(stage.evidencePaths)
      )
    ) {
      failures.push(`${result.lane} lane has an invalid stage result`);
      continue;
    }
    if (lanes.has(result.lane)) {
      failures.push(`duplicate evaluation lane: ${result.lane}`);
      continue;
    }
    lanes.set(result.lane, result);
    if (result.requestedCommitSha !== expectedCommitSha) {
      failures.push(`${result.lane} lane requested unexpected commit ${result.requestedCommitSha}`);
    }
    if (result.commitSha !== expectedCommitSha) {
      failures.push(`${result.lane} lane observed unexpected commit ${result.commitSha}`);
    }

    const stageNames = new Set(result.stages.map((stage) => stage.name));
    for (const requiredStage of evaluationLaneStages[result.lane]) {
      if (!stageNames.has(requiredStage)) {
        failures.push(`${result.lane} lane is missing required stage: ${requiredStage}`);
      }
    }
  }

  for (const lane of evaluationLaneNames) {
    if (!lanes.has(lane)) failures.push(`missing evaluation lane: ${lane}`);
  }

  return {
    stageResults: evaluationLaneNames.flatMap((lane) => lanes.get(lane)?.stages ?? []),
    failures: unique(failures)
  };
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

interface RetriedResetBoundaryOptions {
  attempts?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onRetry?: (attempt: number) => void;
}

export async function runRetriedResetBoundary(
  runReset: () => Promise<EvaluationStageResult>,
  runHealth: () => Promise<EvaluationStageResult>,
  {
    attempts = 3,
    retryDelayMs = 2_000,
    sleep = (milliseconds) =>
      new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds)),
    onRetry = () => undefined
  }: RetriedResetBoundaryOptions = {}
): Promise<EvaluationStageResult[]> {
  let resetResult: EvaluationStageResult | undefined;
  let healthResult: EvaluationStageResult | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    resetResult = await runReset();
    healthResult = resetResult.passed ? await runHealth() : undefined;

    if (resetResult.passed && healthResult?.passed) {
      return [resetResult, healthResult];
    }

    if (attempt < attempts) {
      onRetry(attempt);
      await sleep(retryDelayMs);
    }
  }

  return healthResult ? [resetResult!, healthResult] : [resetResult!];
}

async function startManagedServer(lane: 'e2e' | 'a11y' | 'visual'): Promise<{
  child: ChildProcess;
  result: EvaluationStageResult;
}> {
  const status = getLocalSupabaseStatus();
  const serverId = randomUUID();
  const appOrigin = getEvaluationAppOrigin(process.env);
  const appPort = new URL(appOrigin).port;
  const healthUrl = new URL('/api/health', appOrigin).toString();
  const stageName = `application-health-${lane}`;
  const logPath = join(stageRoot, `${stageName}.log`);
  const log = createWriteStream(logPath, { flags: 'w' });
  const child = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', appPort], {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    env: getManagedServerEnvironment(status, process.env, serverId),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk: Buffer) => log.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => log.write(chunk));
  child.once('exit', () => log.end());
  child.once('error', () => log.end());

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
        child.once('error', reject);
      })
    ]);
    log.write(`Healthy: ${healthUrl}\n`);
    return {
      child,
      result: {
        name: stageName,
        passed: true,
        exitCode: 0,
        evidencePaths: [relative(repositoryRoot, logPath)]
      }
    };
  } catch (error) {
    return {
      child,
      result: {
        name: stageName,
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

async function runEvaluationLane(
  lane: EvaluationLaneName,
  requestedCommitSha: string
): Promise<void> {
  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });
  mkdirSync(laneRoot, { recursive: true });
  const stageResults: EvaluationStageResult[] = [];
  const startedAt = new Date();
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }).trim();
  let server: ChildProcess | undefined;

  if (commitSha !== requestedCommitSha) {
    stageResults.push({
      name: evaluationLaneStages[lane][0],
      passed: false,
      exitCode: null,
      failure: `checked-out commit ${commitSha} does not match requested commit ${requestedCommitSha}`,
      evidencePaths: []
    });
  } else if (lane === 'static') {
    stageResults.push(await runCommandStage('format', ['format:check']));
    stageResults.push(await runCommandStage('lint', ['lint']));
    stageResults.push(await runCommandStage('check', ['check']));
    stageResults.push(await runCommandStage('unit', ['test:unit']));
    stageResults.push(await runCommandStage('build', ['build']));
  } else if (lane === 'database') {
    stageResults.push(await runCommandStage('database', ['test:database']));
  } else if (lane === 'map') {
    stageResults.push(await runCommandStage('component', ['test:component']));
    stageResults.push(await runCommandStage('map-smoke', ['test:map-smoke']));
  } else if (lane === 'performance') {
    stageResults.push(
      await runCommandStage(
        'performance',
        ['test:performance'],
        ['test-results/performance/results.json']
      )
    );
  } else {
    try {
      const application = await startManagedServer(lane);
      server = application.child;
      stageResults.push(application.result);
      stageResults.push(
        await runCommandStage(lane, [`test:${lane}`], [`test-results/${lane}/results.json`])
      );
    } catch (error) {
      stageResults.push({
        name: `application-health-${lane}`,
        passed: false,
        exitCode: null,
        failure: error instanceof Error ? error.message : String(error),
        evidencePaths: [`test-results/evaluation/stages/application-health-${lane}.log`]
      });
    } finally {
      if (server) await stopManagedServer(server);
    }
  }

  const finishedAt = new Date();
  const laneResult: EvaluationLaneResult = {
    schemaVersion: EVALUATION_LANE_SCHEMA_VERSION,
    lane,
    requestedCommitSha,
    commitSha,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    stages: stageResults
  };
  const resultPath = join(laneRoot, `${lane}.json`);
  writeFileSync(resultPath, `${JSON.stringify(laneResult, null, 2)}\n`, 'utf8');

  console.log(`\nEvaluation lane evidence: ${relative(repositoryRoot, resultPath)}`);
  if (stageResults.some((stage) => !stage.passed)) process.exitCode = 1;
}

async function aggregateEvaluationLanes(expectedCommitSha: string): Promise<void> {
  mkdirSync(stageRoot, { recursive: true });
  const aggregateCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }).trim();
  const laneReadFailures: string[] = [];
  const laneResults = existsSync(laneRoot)
    ? readdirSync(laneRoot)
        .filter((name) => name.endsWith('.json'))
        .flatMap((name) => {
          try {
            return [JSON.parse(readFileSync(join(laneRoot, name), 'utf8')) as EvaluationLaneResult];
          } catch (error) {
            laneReadFailures.push(
              `could not read evaluation lane ${name}: ${error instanceof Error ? error.message : String(error)}`
            );
            return [];
          }
        })
    : [];
  const collected = collectEvaluationLaneResults(laneResults, expectedCommitSha);
  const missingEvidence = collected.stageResults
    .filter((stage) => stage.passed)
    .flatMap((stage) =>
      stage.evidencePaths
        .filter((path) => !existsSync(join(repositoryRoot, path)))
        .map((path) => `${stage.name} evidence is missing: ${path}`)
    );
  const aggregationFailures = unique([
    ...collected.failures,
    ...laneReadFailures,
    ...missingEvidence,
    ...(aggregateCommitSha === expectedCommitSha
      ? []
      : [
          `aggregate observed unexpected commit ${aggregateCommitSha}; expected ${expectedCommitSha}`
        ])
  ]);
  const measuredLaneResults = laneResults.filter(
    (result) => Number.isFinite(result.durationMs) && result.durationMs >= 0
  );
  const serialEquivalentMs = measuredLaneResults.reduce(
    (total, result) => total + result.durationMs,
    0
  );
  const parallelCriticalPathMs = Math.max(
    0,
    ...measuredLaneResults.map((result) => result.durationMs)
  );
  const timingPath = join(artifactRoot, 'timings.json');
  writeFileSync(
    timingPath,
    `${JSON.stringify(
      {
        measuredScope: 'evaluation commands after dependency and runtime setup',
        lanes: measuredLaneResults.map(({ lane, durationMs }) => ({ lane, durationMs })),
        serialEquivalentMs,
        parallelCriticalPathMs,
        reductionPercent:
          serialEquivalentMs === 0
            ? 0
            : Math.round((1 - parallelCriticalPathMs / serialEquivalentMs) * 100)
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  const aggregationLogPath = join(stageRoot, 'aggregation.log');
  writeFileSync(
    aggregationLogPath,
    aggregationFailures.length === 0
      ? `Aggregated ${laneResults.length} exact-SHA evaluation lanes.\n`
      : `${aggregationFailures.join('\n')}\n`,
    'utf8'
  );
  const stageResults = [
    ...collected.stageResults,
    {
      name: 'aggregation',
      passed: aggregationFailures.length === 0,
      exitCode: aggregationFailures.length === 0 ? 0 : 1,
      failure: aggregationFailures.length === 0 ? undefined : aggregationFailures.join('; '),
      evidencePaths: [relative(repositoryRoot, aggregationLogPath)]
    }
  ];

  const generatedAt = new Date().toISOString();
  const manifest = assembleEvidenceManifest({
    stageResults,
    testEvidence: [
      join(repositoryRoot, 'test-results/a11y'),
      join(repositoryRoot, 'test-results/visual'),
      join(repositoryRoot, 'test-results/performance')
    ].flatMap(loadTestEvidence),
    commitSha: expectedCommitSha,
    generatedAt
  });
  const validation = validateEvidenceManifest(manifest);
  if (!validation.valid) {
    manifest.verdict.status = 'fail';
    manifest.verdict.failures.push(...validation.errors.map((error) => `manifest: ${error}`));
  }
  const manifestPath = join(artifactRoot, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Parallel evaluation\n\n- Commit: ${expectedCommitSha}\n- Lanes received: ${laneResults.length}/${evaluationLaneNames.length}\n- Serial-equivalent command time: ${formatDuration(serialEquivalentMs)}\n- Parallel command critical path: ${formatDuration(parallelCriticalPathMs)}\n- Command-time reduction: ${serialEquivalentMs === 0 ? 0 : Math.round((1 - parallelCriticalPathMs / serialEquivalentMs) * 100)}%\n- Verdict: ${manifest.verdict.status}\n`,
      'utf8'
    );
  }

  console.log(`\nEvaluation evidence: ${relative(repositoryRoot, manifestPath)}`);
  console.log(`Verdict: ${manifest.verdict.status}`);
  if (manifest.verdict.failures.length > 0) {
    for (const failure of manifest.verdict.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function main(): Promise<void> {
  const laneIndex = process.argv.indexOf('--lane');
  const aggregate = process.argv.includes('--aggregate');
  const shaIndex = process.argv.indexOf('--sha');
  const lane = laneIndex >= 0 ? process.argv[laneIndex + 1] : undefined;
  const requestedCommitSha = shaIndex >= 0 ? process.argv[shaIndex + 1] : undefined;

  if (!requestedCommitSha || !/^[0-9a-f]{40}$/.test(requestedCommitSha)) {
    throw new Error('--sha must be a full 40-character lowercase commit SHA');
  }
  if (aggregate) {
    await aggregateEvaluationLanes(requestedCommitSha);
    return;
  }
  if (!lane || !isEvaluationLaneName(lane)) {
    throw new Error('--lane must name one supported evaluation lane');
  }

  await runEvaluationLane(lane, requestedCommitSha);
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
