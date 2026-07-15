import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

const productWebServer = Array.isArray(baseConfig.webServer)
  ? baseConfig.webServer[0]
  : baseConfig.webServer;

export default defineConfig({
  ...baseConfig,
  testDir: './tests/evaluation',
  testIgnore: 'performance.spec.ts',
  outputDir: './test-results/evaluation',
  fullyParallel: false,
  workers: 1,
  // Evaluation journeys capture dozens of product states per locale in a single test; the
  // feature-spec 30s budget cannot fit them as the product grows.
  timeout: 180_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/evaluation/results.json' }]],
  use: {
    ...baseConfig.use,
    // Keep long evidence journeys viable, but do not let one stale locator consume the complete
    // three-minute test budget before Playwright records the real failure.
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  },
  webServer: productWebServer
});
