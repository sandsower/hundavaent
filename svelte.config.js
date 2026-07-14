import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';

function configuredOrigin(value) {
  if (!value?.trim()) return [];
  try {
    return [new URL(value).origin];
  } catch {
    return [];
  }
}

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const publicEnvironment = {
  ...loadEnv(mode, process.cwd(), 'PUBLIC_'),
  ...process.env
};
const supabaseOrigins = configuredOrigin(publicEnvironment.PUBLIC_SUPABASE_URL);
const supabaseWebSocketOrigins = supabaseOrigins.map((origin) => origin.replace(/^http/, 'ws'));
const postHogOrigins = configuredOrigin(publicEnvironment.PUBLIC_POSTHOG_HOST);
const mapOrigins = [
  ...new Set([
    'https://api.maptiler.com',
    ...configuredOrigin(publicEnvironment.PUBLIC_MAP_STYLE_URL)
  ])
];

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ platformProxy: { persist: false } }),
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'base-uri': ['self'],
        'connect-src': [
          'self',
          ...supabaseOrigins,
          ...supabaseWebSocketOrigins,
          ...postHogOrigins,
          ...mapOrigins
        ],
        'font-src': ['self', 'data:'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
        // Supabase origins: approved Place photos and Moderator Evidence previews are <img>
        // tags pointing at short-lived signed Storage URLs on the Supabase origin (place-media).
        'img-src': ['self', 'data:', 'blob:', ...supabaseOrigins, ...mapOrigins],
        'object-src': ['none'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        'worker-src': ['self', 'blob:']
      }
    },
    alias: {
      $domain: './src/lib/domain',
      $discovery: './src/lib/discovery',
      $i18n: './src/lib/i18n',
      $map: './src/lib/map',
      $server: './src/lib/server'
    }
  }
};

export default config;
