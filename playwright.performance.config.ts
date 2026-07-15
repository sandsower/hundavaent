import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.evaluation.config';

const performanceOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_PERFORMANCE_APP_PORT ?? '4174'}`;
const productWebServer = Array.isArray(baseConfig.webServer)
  ? baseConfig.webServer[0]
  : baseConfig.webServer;

export default defineConfig({
  ...baseConfig,
  outputDir: './test-results/performance',
  testIgnore: [],
  testMatch: 'performance.spec.ts',
  reporter: [['list'], ['json', { outputFile: 'test-results/performance/results.json' }]],
  use: {
    ...baseConfig.use,
    baseURL: performanceOrigin
  },
  webServer: {
    ...productWebServer,
    command: `./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --host 127.0.0.1 --port ${process.env.HUNDAVAENT_PERFORMANCE_APP_PORT ?? '4174'}`,
    reuseExistingServer: false,
    url: performanceOrigin,
    env: {
      ...productWebServer?.env,
      PUBLIC_APP_URL: performanceOrigin
    }
  }
});
