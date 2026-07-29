import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Storybook's svelte-vite framework adopts this file as its base config, which is what puts the
// svelte transform ahead of Storybook's own docgen plugin - injecting the plugin via viteFinal
// lands it after docgen, and docgen then chokes on raw .svelte source. The app itself never reads
// this file; it compiles the package's source through its own SvelteKit config.
export default defineConfig({
  plugins: [tailwindcss(), svelte()]
});
