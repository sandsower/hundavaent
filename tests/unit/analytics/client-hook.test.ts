import { describe, expect, it, vi } from 'vitest';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { captureException }
}));

import { captureClientError } from '$lib/analytics/client-error';

describe('client error hook', () => {
  it('forwards only the error, route, status, and source to analytics', () => {
    const error = new Error('Navigation render failed');

    captureClientError({
      error,
      event: {
        url: new URL('https://hundavaent.is/en/private-path?q=secret#fragment')
      } as never,
      status: 500,
      message: 'Internal Error'
    });

    expect(captureException).toHaveBeenCalledWith(error, {
      source: 'sveltekit',
      route: '/en/private-path',
      status: 500
    });
  });
});
