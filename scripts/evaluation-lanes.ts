import { appendFileSync } from 'node:fs';

export const EVALUATION_LANE_SCHEMA_VERSION = 'evaluation-lane/v1' as const;

export const evaluationLaneNames = [
  'static',
  'database',
  'e2e',
  'a11y',
  'visual',
  'map',
  'performance'
] as const;

export type EvaluationLaneName = (typeof evaluationLaneNames)[number];

export interface EvaluationLaneRuntime {
  projectId: string;
  apiPort: number;
  databasePort: number;
  shadowDatabasePort: number;
  smtpPort: number;
  appPort: number;
  gatePort: number;
  providerPort: number;
  performancePort: number;
}

export interface EvaluationLaneStageResult {
  name: string;
  passed: boolean;
  exitCode: number | null;
  evidencePaths: string[];
  failure?: string;
}

export interface EvaluationLaneResult {
  schemaVersion: typeof EVALUATION_LANE_SCHEMA_VERSION;
  lane: EvaluationLaneName;
  requestedCommitSha: string;
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stages: EvaluationLaneStageResult[];
}

export const evaluationLaneStages: Record<EvaluationLaneName, readonly string[]> = {
  static: ['format', 'lint', 'check', 'unit', 'build'],
  database: ['database'],
  e2e: ['application-health-e2e', 'e2e'],
  a11y: ['application-health-a11y', 'a11y'],
  visual: ['application-health-visual', 'visual'],
  map: ['component', 'map-smoke'],
  performance: ['performance']
};

const runtimeBasePorts: Record<EvaluationLaneName, number> = {
  static: 56_000,
  database: 56_100,
  e2e: 56_200,
  a11y: 56_300,
  visual: 56_400,
  map: 56_500,
  performance: 56_600
};

export function isEvaluationLaneName(value: string): value is EvaluationLaneName {
  return evaluationLaneNames.includes(value as EvaluationLaneName);
}

export function getEvaluationLaneRuntime(lane: EvaluationLaneName): EvaluationLaneRuntime {
  const base = runtimeBasePorts[lane];
  const appBase = base - 10_000;

  return {
    projectId: `hundavaent-evaluation-${lane}`,
    apiPort: base + 21,
    databasePort: base + 22,
    shadowDatabasePort: base + 20,
    smtpPort: base + 24,
    appPort: appBase + 73,
    gatePort: appBase + 74,
    providerPort: appBase + 75,
    performancePort: appBase + 76
  };
}

export function getEvaluationLaneEnvironment(lane: EvaluationLaneName): Record<string, string> {
  const runtime = getEvaluationLaneRuntime(lane);

  return {
    HUNDAVAENT_E2E_APP_PORT: String(runtime.appPort),
    HUNDAVAENT_E2E_GATE_PORT: String(runtime.gatePort),
    HUNDAVAENT_E2E_PROVIDER_PORT: String(runtime.providerPort),
    HUNDAVAENT_PERFORMANCE_APP_PORT: String(runtime.performancePort)
  };
}

export function configureEvaluationSupabase(source: string, lane: EvaluationLaneName): string {
  const runtime = getEvaluationLaneRuntime(lane);
  const authAppPort = lane === 'performance' ? runtime.performancePort : runtime.appPort;
  let configured = source;

  configured = replaceExactly(
    configured,
    /^project_id\s*=\s*"[^"]+"$/m,
    `project_id = "${runtime.projectId}"`,
    'project_id'
  );
  configured = replaceSectionPort(configured, 'api', 'port', runtime.apiPort);
  configured = replaceSectionPort(configured, 'db', 'port', runtime.databasePort);
  configured = replaceSectionPort(configured, 'db', 'shadow_port', runtime.shadowDatabasePort);
  configured = replaceSectionPort(configured, 'local_smtp', 'port', runtime.smtpPort);
  configured = replaceExactly(
    configured,
    /site_url\s*=\s*"http:\/\/127\.0\.0\.1:\d+"/,
    `site_url = "http://127.0.0.1:${authAppPort}"`,
    'auth.site_url'
  );
  configured = configured.replaceAll(
    /http:\/\/127\.0\.0\.1:4173/g,
    `http://127.0.0.1:${authAppPort}`
  );

  return configured;
}

export function appendEvaluationLaneEnvironment(path: string, lane: EvaluationLaneName): void {
  const lines = Object.entries(getEvaluationLaneEnvironment(lane)).map(
    ([name, value]) => `${name}=${value}`
  );
  appendFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function replaceSectionPort(source: string, section: string, key: string, value: number): string {
  const sectionPattern = new RegExp(`(\\[${section}\\][\\s\\S]*?)(?=\\n\\[|$)`);
  const sectionMatch = source.match(sectionPattern);

  if (!sectionMatch) {
    throw new Error(`Supabase evaluation config is missing [${section}]`);
  }

  const configuredSection = replaceExactly(
    sectionMatch[0],
    new RegExp(`^${key}\\s*=\\s*\\d+$`, 'm'),
    `${key} = ${value}`,
    `${section}.${key}`
  );

  return source.replace(sectionPattern, configuredSection);
}

function replaceExactly(
  source: string,
  pattern: RegExp,
  replacement: string,
  label: string
): string {
  const matches = source.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));

  if (matches?.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} entry in Supabase evaluation config, found ${matches?.length ?? 0}`
    );
  }

  return source.replace(pattern, replacement);
}
