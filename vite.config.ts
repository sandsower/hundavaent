import posthog from '@posthog/rollup-plugin';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

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
    build: {
      chunkSizeWarningLimit: 1_100
    }
  };
});
