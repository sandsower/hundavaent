import { mergeConfig } from 'vite';

import type { StorybookConfig } from '@storybook/svelte-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.svelte'],
  addons: ['@storybook/addon-svelte-csf'],
  framework: {
    name: '@storybook/svelte-vite',
    options: {}
  },
  // The svelte and tailwind plugins live in ../vite.config.ts, which the framework adopts as its
  // base - that ordering puts the svelte transform ahead of Storybook's docgen plugin, where a
  // viteFinal injection cannot reach.
  viteFinal: async (viteConfig) => {
    return mergeConfig(viteConfig, {
      // The app is browsed on 127.0.0.1 (magic-link cookies demand it), so Storybook answers on
      // the same host instead of insisting on the literal "localhost".
      server: { allowedHosts: ['127.0.0.1', 'localhost'] }
    });
  }
};

export default config;
