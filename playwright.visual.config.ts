import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.evaluation.config';

export default defineConfig({
  ...baseConfig,
  outputDir: './test-results/visual',
  testIgnore: [],
  testMatch: 'visual.spec.ts',
  reporter: [['list'], ['json', { outputFile: 'test-results/visual/results.json' }]]
});
