import { describe, expect, it, vi } from 'vitest';

import {
  createPostHogAnalytics,
  resolvePostHogConfig,
  sanitizePostHogEvent
} from '$lib/analytics/posthog';

function createClient() {
  return {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn()
  };
}

const environment = {
  PUBLIC_POSTHOG_TOKEN: 'phc_project-token',
  PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com'
};

describe('PostHog analytics configuration', () => {
  it('stays disabled when public configuration is absent or partial', () => {
    expect(resolvePostHogConfig({})).toBeNull();
    expect(resolvePostHogConfig({ PUBLIC_POSTHOG_TOKEN: 'phc_project-token' })).toBeNull();
    expect(resolvePostHogConfig({ PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com' })).toBeNull();
  });

  it('rejects analytics hosts that are not a secure origin', () => {
    expect(
      resolvePostHogConfig({
        PUBLIC_POSTHOG_TOKEN: 'phc_project-token',
        PUBLIC_POSTHOG_HOST: 'http://eu.i.posthog.com'
      })
    ).toBeNull();
    expect(
      resolvePostHogConfig({
        PUBLIC_POSTHOG_TOKEN: 'phc_project-token',
        PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com/ingest'
      })
    ).toBeNull();
  });

  it('normalizes valid public configuration', () => {
    expect(
      resolvePostHogConfig({
        PUBLIC_POSTHOG_TOKEN: '  phc_project-token  ',
        PUBLIC_POSTHOG_HOST: '  https://eu.i.posthog.com  '
      })
    ).toEqual({
      token: 'phc_project-token',
      host: 'https://eu.i.posthog.com'
    });
  });

  it('initializes once with cookieless web analytics and no broad autocapture', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();

    expect(analytics.initialize(environment, client)).toBe(true);
    expect(analytics.initialize(environment, client)).toBe(false);
    expect(client.init).toHaveBeenCalledTimes(1);
    expect(client.init).toHaveBeenCalledWith(
      'phc_project-token',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        defaults: '2026-05-30',
        cookieless_mode: 'always',
        capture_pageview: 'history_change',
        capture_pageleave: true,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        person_profiles: 'identified_only',
        before_send: sanitizePostHogEvent
      })
    );
  });

  it('removes query strings and fragments from automatically collected URLs', () => {
    expect(
      sanitizePostHogEvent({
        uuid: '00000000-0000-4000-8000-000000000000',
        event: '$pageview',
        properties: {
          $current_url: 'https://hundavaent.is/en?q=private-search#selected',
          $referrer: 'https://search.example/?q=private-search',
          $pathname: '/en',
          safe_property: 'kept'
        }
      })
    ).toEqual({
      uuid: '00000000-0000-4000-8000-000000000000',
      event: '$pageview',
      properties: {
        $current_url: 'https://hundavaent.is/en',
        $referrer: 'https://search.example/',
        $pathname: '/en',
        safe_property: 'kept'
      }
    });
  });

  it('captures only typed product events after initialization', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();
    analytics.initialize(environment, client);

    expect(
      analytics.capture('place viewed', {
        place_id: '30000000-0000-4000-8000-000000000003',
        category: 'park',
        source: 'map',
        language: 'en'
      })
    ).toBe(true);
    expect(client.capture).toHaveBeenCalledWith('place viewed', {
      place_id: '30000000-0000-4000-8000-000000000003',
      category: 'park',
      source: 'map',
      language: 'en'
    });
  });

  it('queues, sanitizes, and deduplicates browser exceptions until initialization', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();
    const error = new Error('Could not load https://hundavaent.is/en?token=secret#fragment');

    expect(
      analytics.captureException(error, {
        source: 'sveltekit',
        route: 'https://hundavaent.is/en?token=secret#fragment',
        status: 500
      })
    ).toBe(false);
    expect(analytics.captureException(error, { source: 'window.error', route: '/en' })).toBe(false);

    analytics.initialize(environment, client);

    expect(client.captureException).toHaveBeenCalledTimes(1);
    const [capturedError, properties] = client.captureException.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('Could not load https://hundavaent.is/en');
    expect(properties).toEqual({ source: 'sveltekit', route: '/en', status: 500 });
  });

  it('captures global errors and rejected promises without retaining URL details', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();
    const listeners = new Map<string, EventListener>();
    const target = {
      location: { href: 'https://hundavaent.is/en?q=private#selected' },
      addEventListener: vi.fn((name: string, listener: EventListener) => {
        listeners.set(name, listener);
      }),
      removeEventListener: vi.fn((name: string) => {
        listeners.delete(name);
      })
    } as unknown as Window;
    analytics.initialize(environment, client);

    const stop = analytics.startBrowserErrorTracking(target);
    const error = new Error('Render failed');
    listeners.get('error')?.({ error, message: error.message } as ErrorEvent);
    listeners.get('unhandledrejection')?.({ reason: 'Promise failed' } as PromiseRejectionEvent);

    expect(client.captureException).toHaveBeenNthCalledWith(1, expect.any(Error), {
      source: 'window.error',
      route: '/en'
    });
    expect(client.captureException).toHaveBeenNthCalledWith(2, 'Promise failed', {
      source: 'unhandledrejection',
      route: '/en'
    });

    stop();
    expect(target.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('replaces arbitrary rejected objects instead of serializing their contents', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();
    analytics.initialize(environment, client);

    analytics.captureException(
      { token: 'secret', responseBody: 'private' },
      { source: 'unhandledrejection', route: '/en' }
    );

    const [capturedError] = client.captureException.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('Non-Error browser exception');
    expect(JSON.stringify(capturedError)).not.toContain('secret');
    expect(JSON.stringify(capturedError)).not.toContain('private');
  });

  it('does not initialize or capture when configuration is unavailable', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();

    expect(analytics.initialize({}, client)).toBe(false);
    expect(
      analytics.capture('place saved', {
        place_id: '30000000-0000-4000-8000-000000000003',
        saved: true
      })
    ).toBe(false);
    expect(client.init).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('never lets a telemetry client failure break the application', () => {
    const analytics = createPostHogAnalytics();
    const client = createClient();
    client.capture.mockImplementation(() => {
      throw new Error('telemetry unavailable');
    });
    client.captureException.mockImplementation(() => {
      throw new Error('telemetry unavailable');
    });
    analytics.initialize(environment, client);

    expect(
      analytics.capture('place saved', {
        place_id: '30000000-0000-4000-8000-000000000003',
        saved: true
      })
    ).toBe(false);
    expect(
      analytics.captureException(new Error('Application error'), {
        source: 'window.error',
        route: '/en'
      })
    ).toBe(false);
  });
});
