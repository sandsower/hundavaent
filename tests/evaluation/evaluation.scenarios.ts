import { evaluationScenarioCatalogue } from '$server/evaluation/scenarios';

export const requiredVib1ScenarioIds = [
  'moderator-candidate-creation',
  'moderator-publication',
  'visitor-discovery-is',
  'visitor-discovery-en',
  'public-private-denials',
  'language-state-preservation',
  'map-failure-fallback',
  'maplibre-smoke',
  'accessibility-keyboard',
  'visual-is',
  'visual-en',
  'public-performance'
] as const;

export const requiredVib1ScenarioEvidence = Object.fromEntries(
  evaluationScenarioCatalogue.scenarios.map((scenario) => [scenario.id, scenario.requiredEvidence])
);
