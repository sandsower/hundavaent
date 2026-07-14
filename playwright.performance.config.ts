import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.evaluation.config';

export default defineConfig({
  ...baseConfig,
  outputDir: './test-results/performance',
  testIgnore: [],
  testMatch: 'performance.spec.ts',
  reporter: [['list'], ['json', { outputFile: 'test-results/performance/results.json' }]],
  use: {
    ...baseConfig.use,
    baseURL: 'http://127.0.0.1:4174'
  },
  webServer: {
    ...baseConfig.webServer,
    command:
      './node_modules/.bin/vite build && ./node_modules/.bin/vite preview --host 127.0.0.1 --port 4174',
    reuseExistingServer: false,
    url: 'http://127.0.0.1:4174'
  }
});
