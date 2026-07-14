export const EVALUATION_SCENARIO_VERSION = 'evaluation-scenarios/v1' as const;

export type EvaluationStage =
  'database' | 'unit' | 'component' | 'browser' | 'accessibility' | 'visual' | 'performance';

export type ScenarioEvidenceKind =
  | 'assertions'
  | 'audit'
  | 'axe'
  | 'console'
  | 'database'
  | 'network'
  | 'screenshot'
  | 'timing'
  | 'trace';

export interface Vib1ScenarioDefinition {
  id: string;
  title: string;
  stage: EvaluationStage;
  specPaths: readonly string[];
  requiredEvidence: readonly ScenarioEvidenceKind[];
}

export interface Vib1ScenarioCatalogue {
  version: typeof EVALUATION_SCENARIO_VERSION;
  scenarios: readonly Vib1ScenarioDefinition[];
}

export const evaluationScenarioCatalogue = {
  version: EVALUATION_SCENARIO_VERSION,
  scenarios: [
    {
      id: 'moderator-candidate-creation',
      title: 'Moderator creates a private Candidate',
      stage: 'browser',
      specPaths: ['tests/e2e/moderator-candidate.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'trace']
    },
    {
      id: 'moderator-publication',
      title: 'Moderator verifies and publishes a Place atomically',
      stage: 'browser',
      specPaths: [
        'tests/e2e/moderator-publish.spec.ts',
        'supabase/tests/database/008_publication.test.sql'
      ],
      requiredEvidence: ['assertions', 'audit', 'database', 'console', 'network', 'trace']
    },
    {
      id: 'visitor-discovery-is',
      title: 'Visitor discovers the verified Place in Icelandic',
      stage: 'browser',
      specPaths: ['tests/e2e/public-discovery.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'trace']
    },
    {
      id: 'visitor-discovery-en',
      title: 'Visitor discovers the verified Place in English',
      stage: 'browser',
      specPaths: ['tests/e2e/public-discovery.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'trace']
    },
    {
      id: 'public-private-denials',
      title: 'Private and unverified Places stay denied publicly',
      stage: 'browser',
      specPaths: ['tests/e2e/public-denials.spec.ts'],
      requiredEvidence: ['assertions', 'database', 'console', 'network', 'trace']
    },
    {
      id: 'language-state-preservation',
      title: 'Language switching preserves canonical discovery state',
      stage: 'component',
      specPaths: [
        'tests/component/public-tracer.browser.test.ts',
        'tests/e2e/public-discovery.spec.ts'
      ],
      requiredEvidence: ['assertions']
    },
    {
      id: 'map-failure-fallback',
      title: 'Map failure preserves the complete localized list',
      stage: 'browser',
      specPaths: ['tests/e2e/map-fallback.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'trace']
    },
    {
      id: 'maplibre-smoke',
      title: 'MapLibre implements the deterministic map interface',
      stage: 'component',
      specPaths: ['tests/component/map-contract.browser.test.ts'],
      requiredEvidence: ['assertions']
    },
    {
      id: 'accessibility-keyboard',
      title: 'Public and Moderator paths meet accessibility requirements',
      stage: 'accessibility',
      specPaths: ['tests/evaluation/a11y.spec.ts'],
      requiredEvidence: ['assertions', 'axe', 'console', 'network', 'trace']
    },
    {
      id: 'visual-is',
      title: 'Icelandic product states match approved visual baselines',
      stage: 'visual',
      specPaths: ['tests/evaluation/visual.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'screenshot']
    },
    {
      id: 'visual-en',
      title: 'English product states match approved visual baselines',
      stage: 'visual',
      specPaths: ['tests/evaluation/visual.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'screenshot']
    },
    {
      id: 'public-performance',
      title: 'Public routes and on-demand map loading meet budgets',
      stage: 'performance',
      specPaths: ['tests/evaluation/performance.spec.ts'],
      requiredEvidence: ['assertions', 'console', 'network', 'timing']
    }
  ]
} as const satisfies Vib1ScenarioCatalogue;

export function validateScenarioCatalogue(catalogue: Vib1ScenarioCatalogue): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const scenario of catalogue.scenarios) {
    if (!scenario.id.trim()) errors.push('scenario id is required');
    if (seenIds.has(scenario.id)) errors.push(`duplicate scenario id: ${scenario.id}`);
    seenIds.add(scenario.id);
    if (!scenario.title.trim()) errors.push(`${scenario.id}: title is required`);
    if (scenario.specPaths.length === 0) errors.push(`${scenario.id}: spec path is required`);
    if (scenario.requiredEvidence.length === 0) {
      errors.push(`${scenario.id}: required evidence is empty`);
    }
  }

  return errors;
}
