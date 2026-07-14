import { defineConfig, devices } from '@playwright/test';

import {
  getLocalMemberAuthEnvironment,
  getLocalSupabaseStatus
} from './tests/e2e/support/local-supabase';

const localSupabase = getLocalSupabaseStatus();
const appOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_APP_PORT ?? '4173'}`;
const gateOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_GATE_PORT ?? '4174'}`;
const providerPolicyOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_PROVIDER_PORT ?? '4175'}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e/results.json' }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: appOrigin,
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'on',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: `./node_modules/.bin/vite dev --host 127.0.0.1 --port ${process.env.HUNDAVAENT_E2E_APP_PORT ?? '4173'}`,
      env: {
        PUBLIC_SUPABASE_URL: localSupabase.apiUrl,
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabase.publishableKey,
        ...getLocalMemberAuthEnvironment(appOrigin)
      },
      url: appOrigin,
      reuseExistingServer: process.env.EVALUATION_MANAGED_SERVER === '1' || !process.env.CI,
      timeout: 120_000
    },
    {
      // Dedicated gated server: SITE_GATE_PASSWORD would lock every other spec out of 4173.
      command: `./node_modules/.bin/vite dev --host 127.0.0.1 --port ${process.env.HUNDAVAENT_E2E_GATE_PORT ?? '4174'}`,
      env: {
        PUBLIC_SUPABASE_URL: localSupabase.apiUrl,
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabase.publishableKey,
        HUNDAVAENT_VITE_CACHE_DIR: 'node_modules/.vite-gate',
        SITE_GATE_PASSWORD: 'gate-test-password'
      },
      url: `${gateOrigin}/gate`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      // Dedicated provider-policy server: the tenant policy remains email-only while this
      // deployment intentionally attempts Facebook, so the real HTTP callback must fail closed.
      command: `./node_modules/.bin/vite dev --host 127.0.0.1 --port ${process.env.HUNDAVAENT_E2E_PROVIDER_PORT ?? '4175'}`,
      env: {
        PUBLIC_SUPABASE_URL: localSupabase.apiUrl,
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabase.publishableKey,
        PUBLIC_APP_URL: providerPolicyOrigin,
        AUTH_EMAIL_ENABLED: 'false',
        AUTH_FACEBOOK_ENABLED: 'true',
        HUNDAVAENT_VITE_CACHE_DIR: 'node_modules/.vite-facebook-policy'
      },
      url: providerPolicyOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
