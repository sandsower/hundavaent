export const EVIDENCE_SCHEMA_VERSION = 'evaluation-evidence/v1' as const;
export const TEST_EVIDENCE_SCHEMA_VERSION = 'evaluation-test-evidence/v1' as const;

export type EvidenceVerdict = 'pass' | 'fail';
export type EvidenceLocale = 'is' | 'en';
export type EvidenceViewport = 'mobile' | 'desktop';

export interface EvidenceRun {
  id: string;
  commitSha: string;
  generatedAt: string;
}

export interface ScenarioEvidence {
  id: string;
  verdict: EvidenceVerdict;
  evidencePaths: string[];
}

export interface ConsoleEvidence {
  errors: string[];
  warnings: string[];
}

export interface FailedRequestEvidence {
  method: string;
  url: string;
  status: number | null;
}

export interface NetworkEvidence {
  failedRequests: FailedRequestEvidence[];
}

export interface AccessibilityEvidence {
  axeViolations: number;
  keyboardPassed: boolean;
  treePath: string;
}

export interface ScreenshotEvidence {
  name: string;
  locale: EvidenceLocale;
  viewport: EvidenceViewport;
  path: string;
}

export interface VisualEvidence {
  screenshots: ScreenshotEvidence[];
}

export interface PerformanceMeasurement {
  name: string;
  value: number;
  unit: string;
  budget: number;
  passed: boolean;
}

export interface PerformanceEvidence {
  measurements: PerformanceMeasurement[];
}

export interface FinalEvidenceVerdict {
  status: EvidenceVerdict;
  failures: string[];
}

export interface EvidenceManifest {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  run: EvidenceRun;
  scenarios: ScenarioEvidence[];
  console: ConsoleEvidence;
  network: NetworkEvidence;
  accessibility: AccessibilityEvidence;
  visual: VisualEvidence;
  performance: PerformanceEvidence;
  verdict: FinalEvidenceVerdict;
}

export type RequiredTestEvidence = 'axe' | 'screenshot' | 'timing';

export interface TestEvidenceArtifact {
  schemaVersion: typeof TEST_EVIDENCE_SCHEMA_VERSION;
  test: {
    title: string;
    file: string;
    status: string;
    durationMs: number;
  };
  required: RequiredTestEvidence[];
  console: ConsoleEvidence;
  network: NetworkEvidence;
  axe: Array<{ violations: number }>;
  screenshots: Array<{ name: string; path: string }>;
  timings: PerformanceMeasurement[];
}

export function validateTestEvidenceArtifact(input: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return ['test evidence must be an object'];
  }
  if (input.schemaVersion !== TEST_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${TEST_EVIDENCE_SCHEMA_VERSION}`);
  }

  if (
    !isRecord(input.test) ||
    !isNonEmptyString(input.test.title) ||
    !isNonEmptyString(input.test.file) ||
    input.test.status !== 'passed' ||
    typeof input.test.durationMs !== 'number' ||
    !Number.isFinite(input.test.durationMs) ||
    input.test.durationMs < 0
  ) {
    errors.push('test metadata is invalid');
  }

  const required = Array.isArray(input.required)
    ? input.required.filter(isRequiredTestEvidence)
    : [];
  if (
    !Array.isArray(input.required) ||
    required.length !== input.required.length ||
    new Set(required).size !== required.length
  ) {
    errors.push('required evidence categories are invalid');
  }

  if (
    !isRecord(input.console) ||
    !isStringArray(input.console.errors) ||
    !isStringArray(input.console.warnings)
  ) {
    errors.push('console evidence is invalid');
  } else if (input.console.errors.length > 0) {
    errors.push('unapproved console errors were captured');
  }

  if (!isRecord(input.network) || !Array.isArray(input.network.failedRequests)) {
    errors.push('network evidence is invalid');
  } else {
    const invalidRequest = input.network.failedRequests.some(
      (request) =>
        !isRecord(request) ||
        !isNonEmptyString(request.method) ||
        !isNonEmptyString(request.url) ||
        !(
          request.status === null ||
          (typeof request.status === 'number' && Number.isFinite(request.status))
        )
    );
    if (invalidRequest) errors.push('network evidence is invalid');
    if (input.network.failedRequests.length > 0) {
      errors.push('failed critical requests were captured');
    }
  }

  const axe = Array.isArray(input.axe) ? input.axe : [];
  if (
    !Array.isArray(input.axe) ||
    axe.some(
      (result) =>
        !isRecord(result) || !Number.isInteger(result.violations) || Number(result.violations) < 0
    )
  ) {
    errors.push('Axe evidence is invalid');
  }
  if (required.includes('axe') && axe.length === 0) {
    errors.push('required Axe result is missing');
  }
  if (
    required.includes('axe') &&
    axe.some((result) => isRecord(result) && Number(result.violations) > 0)
  ) {
    errors.push('Axe violations were captured');
  }

  const screenshots = Array.isArray(input.screenshots) ? input.screenshots : [];
  if (
    !Array.isArray(input.screenshots) ||
    screenshots.some(
      (screenshot) =>
        !isRecord(screenshot) ||
        !isNonEmptyString(screenshot.name) ||
        !isNonEmptyString(screenshot.path)
    )
  ) {
    errors.push('screenshot evidence is invalid');
  }
  if (required.includes('screenshot') && screenshots.length === 0) {
    errors.push('required screenshot evidence is missing');
  }

  const timings = Array.isArray(input.timings) ? input.timings : [];
  if (
    !Array.isArray(input.timings) ||
    timings.some(
      (timing) =>
        !isRecord(timing) ||
        !isNonEmptyString(timing.name) ||
        typeof timing.value !== 'number' ||
        !Number.isFinite(timing.value) ||
        !isNonEmptyString(timing.unit) ||
        typeof timing.budget !== 'number' ||
        !Number.isFinite(timing.budget) ||
        typeof timing.passed !== 'boolean'
    )
  ) {
    errors.push('timing evidence is invalid');
  }
  if (required.includes('timing') && timings.length === 0) {
    errors.push('required timing evidence is missing');
  }
  for (const timing of timings) {
    if (isRecord(timing) && timing.passed === false && isNonEmptyString(timing.name)) {
      errors.push(`timing budget failed: ${timing.name}`);
    }
  }

  return errors;
}

function isRequiredTestEvidence(value: unknown): value is RequiredTestEvidence {
  return value === 'axe' || value === 'screenshot' || value === 'timing';
}

export type EvidenceValidationResult =
  { valid: true; manifest: EvidenceManifest } | { valid: false; errors: string[] };

const requiredEvidenceFields = [
  'scenarios',
  'console',
  'network',
  'accessibility',
  'visual',
  'performance',
  'verdict'
] as const;

export function validateEvidenceManifest(input: unknown): EvidenceValidationResult {
  if (!isRecord(input)) {
    return { valid: false, errors: ['manifest must be an object'] };
  }

  const errors: string[] = [];

  if (input.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${EVIDENCE_SCHEMA_VERSION}`);
  }

  validateRun(input.run, errors);

  for (const field of requiredEvidenceFields) {
    if (!(field in input) || input[field] === undefined || input[field] === null) {
      errors.push(`${field} is required`);
    }
  }

  if ('scenarios' in input && input.scenarios !== undefined && input.scenarios !== null) {
    validateScenarios(input.scenarios, errors);
  }

  if ('console' in input && input.console !== undefined && input.console !== null) {
    validateConsole(input.console, errors);
  }

  if ('network' in input && input.network !== undefined && input.network !== null) {
    validateNetwork(input.network, errors);
  }

  if (
    'accessibility' in input &&
    input.accessibility !== undefined &&
    input.accessibility !== null
  ) {
    validateAccessibility(input.accessibility, errors);
  }

  if ('visual' in input && input.visual !== undefined && input.visual !== null) {
    validateVisual(input.visual, errors);
  }

  if ('performance' in input && input.performance !== undefined && input.performance !== null) {
    validatePerformance(input.performance, errors);
  }

  if ('verdict' in input && input.verdict !== undefined && input.verdict !== null) {
    validateFinalVerdict(input.verdict, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, manifest: input as unknown as EvidenceManifest };
}

function validateRun(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('run is required');
    return;
  }

  if (!isNonEmptyString(value.id)) {
    errors.push('run.id must be a non-empty string');
  }

  if (!isNonEmptyString(value.commitSha)) {
    errors.push('run.commitSha must be a non-empty string');
  }

  if (!isNonEmptyString(value.generatedAt) || Number.isNaN(Date.parse(value.generatedAt))) {
    errors.push('run.generatedAt must be an ISO date string');
  }
}

function validateScenarios(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('scenarios must be an array');
    return;
  }

  if (value.length === 0) {
    errors.push('scenarios must contain at least one item');
  }

  value.forEach((scenario, index) => {
    if (!isRecord(scenario)) {
      errors.push(`scenarios[${index}] must be an object`);
      return;
    }

    if (!isNonEmptyString(scenario.id)) {
      errors.push(`scenarios[${index}].id must be a non-empty string`);
    }

    if (!isVerdict(scenario.verdict)) {
      errors.push(`scenarios[${index}].verdict must be pass or fail`);
    }

    if (!isNonEmptyStringArray(scenario.evidencePaths)) {
      errors.push(`scenarios[${index}].evidencePaths must contain at least one path`);
    }
  });
}

function validateConsole(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('console must be an object');
    return;
  }

  if (!isStringArray(value.errors)) {
    errors.push('console.errors must be an array of strings');
  }

  if (!isStringArray(value.warnings)) {
    errors.push('console.warnings must be an array of strings');
  }
}

function validateNetwork(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('network must be an object');
    return;
  }

  if (!Array.isArray(value.failedRequests)) {
    errors.push('network.failedRequests must be an array');
    return;
  }

  value.failedRequests.forEach((request, index) => {
    if (
      !isRecord(request) ||
      !isNonEmptyString(request.method) ||
      !isNonEmptyString(request.url) ||
      !(request.status === null || typeof request.status === 'number')
    ) {
      errors.push(`network.failedRequests[${index}] is invalid`);
    }
  });
}

function validateAccessibility(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('accessibility must be an object');
    return;
  }

  if (!Number.isInteger(value.axeViolations) || Number(value.axeViolations) < 0) {
    errors.push('accessibility.axeViolations must be a non-negative integer');
  } else if (value.axeViolations !== 0) {
    errors.push('accessibility.axeViolations must equal zero');
  }

  if (typeof value.keyboardPassed !== 'boolean') {
    errors.push('accessibility.keyboardPassed must be a boolean');
  }

  if (!isNonEmptyString(value.treePath)) {
    errors.push('accessibility.treePath must be a non-empty string');
  }
}

function validateVisual(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !Array.isArray(value.screenshots)) {
    errors.push('visual.screenshots must be an array');
    return;
  }

  if (value.screenshots.length === 0) {
    errors.push('visual.screenshots must contain at least one item');
  }

  value.screenshots.forEach((screenshot, index) => {
    if (
      !isRecord(screenshot) ||
      !isNonEmptyString(screenshot.name) ||
      !isEvidenceLocale(screenshot.locale) ||
      !isEvidenceViewport(screenshot.viewport) ||
      !isNonEmptyString(screenshot.path)
    ) {
      errors.push(`visual.screenshots[${index}] is invalid`);
    }
  });
}

function validatePerformance(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !Array.isArray(value.measurements)) {
    errors.push('performance.measurements must be an array');
    return;
  }

  if (value.measurements.length === 0) {
    errors.push('performance.measurements must contain at least one item');
  }

  value.measurements.forEach((measurement, index) => {
    if (
      !isRecord(measurement) ||
      !isNonEmptyString(measurement.name) ||
      typeof measurement.value !== 'number' ||
      !Number.isFinite(measurement.value) ||
      !isNonEmptyString(measurement.unit) ||
      typeof measurement.budget !== 'number' ||
      !Number.isFinite(measurement.budget) ||
      typeof measurement.passed !== 'boolean'
    ) {
      errors.push(`performance.measurements[${index}] is invalid`);
    } else if (measurement.passed !== true) {
      errors.push(`performance.measurements[${index}] failed its budget`);
    }
  });
}

function validateFinalVerdict(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('verdict must be an object');
    return;
  }

  if (!isVerdict(value.status)) {
    errors.push('verdict.status must be pass or fail');
  }

  if (!isStringArray(value.failures)) {
    errors.push('verdict.failures must be an array of strings');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isVerdict(value: unknown): value is EvidenceVerdict {
  return value === 'pass' || value === 'fail';
}

function isEvidenceLocale(value: unknown): value is EvidenceLocale {
  return value === 'is' || value === 'en';
}

function isEvidenceViewport(value: unknown): value is EvidenceViewport {
  return value === 'mobile' || value === 'desktop';
}
