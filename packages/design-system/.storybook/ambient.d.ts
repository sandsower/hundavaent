// preview.ts imports './preview.css' for its side effect (loading the design system's theme into
// Storybook). This package's tsconfig is standalone - it does not extend a SvelteKit-generated
// tsconfig, so it has no ambient declaration for CSS side-effect imports the way the app root does
// (via .svelte-kit's generated types). Declaring the module shape here is the minimal fix: it
// covers exactly the side-effect import Storybook config needs, without pulling in the rest of
// vite/client's ambient globals (import.meta.env, asset URL imports, etc.) that this package does
// not otherwise use.
declare module '*.css';
