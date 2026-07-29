import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

import type { StorybookConfig } from '@storybook/svelte-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.svelte'],
  addons: ['@storybook/addon-svelte-csf'],
  framework: {
    name: '@storybook/svelte-vite',
    options: {}
  },
  viteFinal: async (viteConfig) => {
    // @storybook/svelte-vite already wires @sveltejs/vite-plugin-svelte into the dev and build
    // pipeline, so the only plugin missing here is Tailwind v4's Vite plugin - without it,
    // ../src/theme.css (and the tokens.css it builds on, imported in preview.css) never gets
    // processed and every Tailwind utility class renders as nothing.
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()]
    });
  }
};

export default config;
