import { realpathSync } from 'node:fs';

import posthog from '@posthog/rollup-plugin';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';

/**
 * The bundled webfonts are served out of `node_modules` in dev. When `node_modules` is a symlink
 * into a parent checkout, the real path falls outside the Vite root and every font request is
 * refused with a 403, so the app renders in fallback type. Allowing the resolved path keeps that
 * layout working and is a no-op for a real directory.
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

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const personalApiKey = environment.POSTHOG_API_KEY?.trim();
  const projectId = environment.POSTHOG_PROJECT_ID?.trim();
  const host = environment.POSTHOG_HOST?.trim();
  const releaseVersion = environment.GITHUB_SHA?.trim();
  const sourceMapPlugin =
    personalApiKey && projectId
      ? posthog({
          personalApiKey,
          projectId,
          host: host || undefined,
          sourcemaps: {
            enabled: true,
            releaseName: 'hundavaent',
            releaseVersion: releaseVersion || undefined,
            deleteAfterUpload: true
          }
        })
      : undefined;

  return {
    cacheDir: environment.HUNDAVAENT_VITE_CACHE_DIR || 'node_modules/.vite',
    plugins: [tailwindcss(), sveltekit(), ...(sourceMapPlugin ? [sourceMapPlugin] : [])],
    server: {
      fs: { allow: allowedFilesystemRoots() }
    },
    build: {
      chunkSizeWarningLimit: 1_100
    }
  };
});
