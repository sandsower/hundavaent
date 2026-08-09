import { env } from '$env/dynamic/private';

export interface DeploymentContext {
  environment: string;
  release: string;
}

export interface ServerErrorLog {
  requestId: string;
  method: string;
  routeId: string;
  status: number;
  errorType: string;
}

export interface RequestOutcomeLog {
  requestId: string;
  method: string;
  routeId: string;
  status: number;
  durationMs: number;
}

export interface HealthFailureLog {
  requestId: string;
  check: 'database' | 'translations';
}

export interface TelemetryLogger {
  serverError(record: ServerErrorLog): void;
  serverFailure(record: RequestOutcomeLog): void;
  slowRequest(record: RequestOutcomeLog): void;
  healthFailure(record: HealthFailureLog): void;
}

export function createTelemetryLogger(
  write: (serializedRecord: string) => void = writeStructuredRuntimeRecord,
  readDeploymentContext: () => DeploymentContext = () => createDeploymentContext(env)
): TelemetryLogger {
  const serialize = (
    level: 'error' | 'warn',
    event: 'request.error' | 'request.failed' | 'request.slow' | 'health.unavailable',
    record: ServerErrorLog | RequestOutcomeLog | HealthFailureLog
  ) =>
    JSON.stringify({
      level,
      event,
      ...readDeploymentContext(),
      ...record
    });

  return {
    serverError: (record) => write(serialize('error', 'request.error', record)),
    serverFailure: (record) => write(serialize('error', 'request.failed', record)),
    slowRequest: (record) => write(serialize('warn', 'request.slow', record)),
    healthFailure: (record) => write(serialize('error', 'health.unavailable', record))
  };
}

function writeStructuredRuntimeRecord(serializedRecord: string): void {
  console.error(JSON.parse(serializedRecord));
}

const environmentPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{6,127}$/;

export function createDeploymentContext(
  source: Record<string, string | undefined>
): DeploymentContext {
  const environment = source.APP_ENVIRONMENT?.trim() ?? '';
  const release = source.APP_RELEASE?.trim() ?? '';

  return {
    environment: environmentPattern.test(environment) ? environment : 'unknown',
    release: releasePattern.test(release) ? release : 'unknown'
  };
}

export const telemetryLogger = createTelemetryLogger();
