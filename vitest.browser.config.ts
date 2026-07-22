import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  optimizeDeps: {
    include: ['@testing-library/svelte > @testing-library/dom > aria-query', 'maplibre-gl']
  },
  resolve: {
    conditions: ['browser']
  },
  test: {
    name: 'component',
    include: ['tests/component/**/*.browser.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    passWithNoTests: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          channel: 'chrome'
        }
      }),
      instances: [{ browser: 'chromium' }]
    }
  }
});
