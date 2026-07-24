import { error } from '@sveltejs/kit';

// Unknown localized paths land here so the branded [lang=lang]/+error page
// renders; without a catch-all SvelteKit falls back to its bare default 404.
export const load = () => {
  error(404);
};
