import { realpathSync } from 'node:fs';

import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Component tests load their harness from `node_modules` over HTTP. When `node_modules` is a
 * symlink into a parent checkout, the real path falls outside the Vite root and every module
 * request is refused, which surfaces as the whole suite failing to import its test files. Allowing
 * the resolved path keeps that layout working and is a no-op for a real directory.
 */
function allowedFilesystemRoots(): string[] {
  const roots = [searchForWorkspaceRoot(process.cwd())];
  try {
    roots.push(realpathSync('node_modules'));
  } catch {
    // No node_modules to resolve: the default workspace root is all this run needs.
  }
  return roots;
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), svelteTesting()],
  server: {
    fs: { allow: allowedFilesystemRoots() }
  },
  optimizeDeps: {
    include: [
      '@testing-library/svelte > @testing-library/dom > aria-query',
      '@testing-library/svelte > @testing-library/dom > lz-string',
      'maplibre-gl'
    ]
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
