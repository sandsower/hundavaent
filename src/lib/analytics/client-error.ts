import type { HandleClientError } from '@sveltejs/kit';

import { postHogAnalytics } from './posthog';

export const captureClientError: HandleClientError = ({ error, event, status }) => {
  try {
    postHogAnalytics.captureException(error, {
      source: 'sveltekit',
      route: event.url.pathname,
      status
    });
  } catch {
    // SvelteKit requires error hooks to remain fail-safe even if telemetry is unavailable.
  }
};
