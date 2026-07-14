import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.evaluation.config';

export default defineConfig({
  ...baseConfig,
  outputDir: './test-results/a11y',
  testIgnore: [],
  testMatch: 'a11y.spec.ts',
  reporter: [['list'], ['json', { outputFile: 'test-results/a11y/results.json' }]]
});
