import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import { test as base, expect } from '@playwright/test';

import {
  TEST_EVIDENCE_SCHEMA_VERSION,
  validateTestEvidenceArtifact,
  type PerformanceMeasurement,
  type RequiredTestEvidence,
  type TestEvidenceArtifact
} from '$server/evaluation/evidence';

interface AllowedResponse {
  status: number;
  urlIncludes: string;
}

export interface EvaluationEvidenceRecorder {
  require(...kinds: RequiredTestEvidence[]): void;
  recordAxe(violations: number): void;
  recordScreenshot(name: string, path: string): void;
  recordTiming(measurement: PerformanceMeasurement): void;
  allowHttpStatus(status: number, urlIncludes: string): void;
  allowConsoleError(textIncludes: string): void;
}

interface EvaluationFixtures {
  evidence: EvaluationEvidenceRecorder;
}

export const test = base.extend<EvaluationFixtures>({
  evidence: async ({ page }, use, testInfo) => {
    const startedAt = Date.now();
    const required = new Set<RequiredTestEvidence>();
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const failedRequests: TestEvidenceArtifact['network']['failedRequests'] = [];
    const axe: TestEvidenceArtifact['axe'] = [];
    const screenshots: TestEvidenceArtifact['screenshots'] = [];
    const timings: PerformanceMeasurement[] = [];
    const allowedResponses: AllowedResponse[] = [];
    const allowedConsoleErrors: string[] = [];

    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !allowedConsoleErrors.some((allowed) => message.text().includes(allowed))
      ) {
        consoleErrors.push(message.text());
      }
      if (message.type() === 'warning') consoleWarnings.push(message.text());
    });
    page.on('requestfailed', (request) => {
      // ERR_ABORTED means the browser itself cancelled the request - a navigation
      // superseded an in-flight fetch (__data.json, dev-server modules, fonts) or the
      // requesting element was removed. Server and app defects keep distinct signals:
      // HTTP >= 400 arrives through the response listener below, and connection, DNS,
      // and CSP failures carry their own errorText values and are still captured here.
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;

      failedRequests.push({
        method: request.method(),
        url: request.url(),
        status: null
      });
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const allowed = allowedResponses.some(
        (candidate) =>
          candidate.status === response.status() && response.url().includes(candidate.urlIncludes)
      );
      if (!allowed) {
        failedRequests.push({
          method: response.request().method(),
          url: response.url(),
          status: response.status()
        });
      }
    });

    const recorder: EvaluationEvidenceRecorder = {
      require: (...kinds) => kinds.forEach((kind) => required.add(kind)),
      recordAxe: (violations) => axe.push({ violations }),
      recordScreenshot: (name, path) => screenshots.push({ name, path }),
      recordTiming: (measurement) => timings.push(measurement),
      allowHttpStatus: (status, urlIncludes) => allowedResponses.push({ status, urlIncludes }),
      allowConsoleError: (textIncludes) => allowedConsoleErrors.push(textIncludes)
    };

    await use(recorder);

    for (const screenshot of screenshots) {
      try {
        await access(resolve(process.cwd(), screenshot.path));
      } catch {
        consoleErrors.push(`missing screenshot evidence: ${screenshot.path}`);
      }
    }

    const artifact: TestEvidenceArtifact = {
      schemaVersion: TEST_EVIDENCE_SCHEMA_VERSION,
      test: {
        title: testInfo.title,
        file: relative(process.cwd(), testInfo.file),
        status: testInfo.status ?? 'unknown',
        durationMs: Date.now() - startedAt
      },
      required: [...required],
      console: { errors: consoleErrors, warnings: consoleWarnings },
      network: { failedRequests },
      axe,
      screenshots,
      timings
    };
    const artifactPath = testInfo.outputPath('evidence.json');
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await testInfo.attach('evaluation-evidence', {
      path: artifactPath,
      contentType: 'application/json'
    });

    expect(validateTestEvidenceArtifact(artifact), 'evaluation evidence must be complete').toEqual(
      []
    );
  }
});

export { expect };
