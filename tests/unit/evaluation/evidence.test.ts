import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_SCHEMA_VERSION,
  TEST_EVIDENCE_SCHEMA_VERSION,
  validateEvidenceManifest,
  validateTestEvidenceArtifact,
  type TestEvidenceArtifact
} from '$server/evaluation/evidence';
import {
  EVALUATION_SCENARIO_VERSION,
  validateScenarioCatalogue,
  evaluationScenarioCatalogue
} from '$server/evaluation/scenarios';
import {
  requiredVib1ScenarioEvidence,
  requiredVib1ScenarioIds
} from '../../evaluation/evaluation.scenarios';

const validManifest = {
  schemaVersion: 'evaluation-evidence/v1',
  run: {
    id: 'evaluation-local-001',
    commitSha: 'abc1234',
    generatedAt: '2026-07-09T12:00:00.000Z'
  },
  scenarios: [
    {
      id: 'public-discovery-is',
      verdict: 'pass',
      evidencePaths: ['test-results/e2e/public-discovery-is/trace.zip']
    }
  ],
  console: {
    errors: [],
    warnings: []
  },
  network: {
    failedRequests: []
  },
  accessibility: {
    axeViolations: 0,
    keyboardPassed: true,
    treePath: 'test-results/evaluation/accessibility-tree.yml'
  },
  visual: {
    screenshots: [
      {
        name: 'directory-is-desktop',
        locale: 'is',
        viewport: 'desktop',
        path: 'test-results/evaluation/directory-is-desktop.png'
      }
    ]
  },
  performance: {
    measurements: [
      {
        name: 'initial-javascript',
        value: 82,
        unit: 'kb',
        budget: 150,
        passed: true
      }
    ]
  },
  verdict: {
    status: 'pass',
    failures: []
  }
};

describe('evaluation evidence manifest', () => {
  it('accepts a complete versioned manifest', () => {
    const result = validateEvidenceManifest(validManifest);

    expect(EVIDENCE_SCHEMA_VERSION).toBe('evaluation-evidence/v1');
    expect(result).toEqual({ valid: true, manifest: validManifest });
  });

  it.each([
    'scenarios',
    'console',
    'network',
    'accessibility',
    'visual',
    'performance',
    'verdict'
  ] as const)('rejects a manifest without %s evidence', (field) => {
    const incomplete = structuredClone(validManifest) as Record<string, unknown>;
    delete incomplete[field];

    const result = validateEvidenceManifest(incomplete);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain(`${field} is required`);
    }
  });

  it('rejects empty scenario, visual, and performance coverage', () => {
    const incomplete = structuredClone(validManifest);
    incomplete.scenarios = [];
    incomplete.visual.screenshots = [];
    incomplete.performance.measurements = [];

    const result = validateEvidenceManifest(incomplete);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'scenarios must contain at least one item',
          'visual.screenshots must contain at least one item',
          'performance.measurements must contain at least one item'
        ])
      );
    }
  });

  it('rejects nonzero Axe violations and failed performance budgets', () => {
    const unsafe = structuredClone(validManifest);
    unsafe.accessibility.axeViolations = 1;
    unsafe.performance.measurements[0].passed = false;

    const result = validateEvidenceManifest(unsafe);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'accessibility.axeViolations must equal zero',
          'performance.measurements[0] failed its budget'
        ])
      );
    }
  });
});

describe('required evaluation scenario catalogue', () => {
  it('contains every required scenario exactly once with evidence expectations', () => {
    expect(EVALUATION_SCENARIO_VERSION).toBe('evaluation-scenarios/v1');
    expect(validateScenarioCatalogue(evaluationScenarioCatalogue)).toEqual([]);
    expect(evaluationScenarioCatalogue.scenarios.map((scenario) => scenario.id)).toEqual(
      requiredVib1ScenarioIds
    );
    expect(Object.keys(requiredVib1ScenarioEvidence)).toHaveLength(requiredVib1ScenarioIds.length);
    expect(requiredVib1ScenarioEvidence['moderator-publication']).toEqual(
      expect.arrayContaining(['audit', 'database', 'trace'])
    );
    expect(requiredVib1ScenarioEvidence['accessibility-keyboard']).toContain('axe');
    expect(requiredVib1ScenarioEvidence['visual-is']).toContain('screenshot');
    expect(requiredVib1ScenarioEvidence['public-performance']).toContain('timing');
  });

  it('rejects duplicate scenarios and missing evidence expectations', () => {
    const invalidCatalogue = {
      ...evaluationScenarioCatalogue,
      scenarios: [
        ...evaluationScenarioCatalogue.scenarios,
        {
          ...evaluationScenarioCatalogue.scenarios[0],
          requiredEvidence: []
        }
      ]
    };

    expect(validateScenarioCatalogue(invalidCatalogue)).toEqual(
      expect.arrayContaining([
        'duplicate scenario id: moderator-candidate-creation',
        'moderator-candidate-creation: required evidence is empty'
      ])
    );
  });
});

describe('per-test evaluation evidence', () => {
  const completeArtifact: TestEvidenceArtifact = {
    schemaVersion: TEST_EVIDENCE_SCHEMA_VERSION,
    test: {
      title: 'captures proof',
      file: 'tests/evaluation/example.spec.ts',
      status: 'passed',
      durationMs: 100
    },
    required: ['axe', 'screenshot', 'timing'],
    console: { errors: [], warnings: [] },
    network: { failedRequests: [] },
    axe: [{ violations: 0 }],
    screenshots: [
      {
        name: 'directory-is',
        path: 'tests/evaluation/screenshots/example.png'
      }
    ],
    timings: [
      {
        name: 'ttfb',
        value: 100,
        unit: 'ms',
        budget: 1_000,
        passed: true
      }
    ]
  };

  it('accepts complete clean evidence', () => {
    expect(validateTestEvidenceArtifact(completeArtifact)).toEqual([]);
  });

  it('rejects console, network, missing category, and timing failures', () => {
    const invalid: TestEvidenceArtifact = {
      ...structuredClone(completeArtifact),
      console: { errors: ['secret-safe error'], warnings: [] },
      network: {
        failedRequests: [{ method: 'GET', url: 'https://example.invalid', status: 500 }]
      },
      axe: [],
      screenshots: [],
      timings: [{ ...completeArtifact.timings[0], passed: false }]
    };

    expect(validateTestEvidenceArtifact(invalid)).toEqual(
      expect.arrayContaining([
        'unapproved console errors were captured',
        'failed critical requests were captured',
        'required Axe result is missing',
        'required screenshot evidence is missing',
        'timing budget failed: ttfb'
      ])
    );
  });

  it('rejects accessibility artifacts that omit required Axe proof', () => {
    const invalid: TestEvidenceArtifact = {
      ...structuredClone(completeArtifact),
      test: { ...completeArtifact.test, file: 'tests/evaluation/a11y.spec.ts' },
      required: [],
      axe: []
    };

    expect(validateTestEvidenceArtifact(invalid)).toContain(
      'accessibility test evidence must declare and contain Axe proof'
    );
  });
});
