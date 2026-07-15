import type { BeforeSendFn, PostHog, PostHogConfig } from 'posthog-js';

export interface PostHogPublicEnvironment {
  PUBLIC_POSTHOG_TOKEN?: string;
  PUBLIC_POSTHOG_HOST?: string;
}

export interface PostHogPublicConfig {
  token: string;
  host: string;
}

export interface ProductAnalyticsEvents {
  'place viewed': {
    place_id: string;
    category: string;
    source: 'map' | 'list' | 'fallback' | 'direct';
    language: 'is' | 'en';
  };
  'discovery filtered': {
    filter_count: number;
    result_count: number;
    has_query: boolean;
    uses_distance: boolean;
  };
  'location permission resolved': {
    context: 'discovery' | 'check_in';
    outcome: 'granted' | 'denied' | 'unavailable' | 'timeout';
  };
  'place saved': {
    place_id: string;
    saved: boolean;
  };
  'check in completed': {
    place_id: string;
    outcome: 'created' | 'duplicate';
    proximity: 'confirmed' | 'not_confirmed' | 'unknown';
  };
  'auth modal opened': {
    origin: 'header' | 'favourite' | 'rating';
  };
  'auth method selected': {
    method: 'email' | 'facebook';
    origin: 'header' | 'favourite' | 'rating';
  };
  'auth link requested': {
    origin: 'header' | 'favourite' | 'rating';
  };
  'auth completed': {
    method: 'email' | 'facebook';
    outcome: 'success' | 'failed';
  };
  'auth pending action completed': {
    action: 'favourite' | 'rating';
    outcome: 'completed' | 'queued';
  };
}

export interface BrowserExceptionContext {
  source: 'sveltekit' | 'window.error' | 'unhandledrejection';
  route: string;
  status?: number;
}

type PostHogClient = Pick<PostHog, 'init' | 'capture' | 'captureException'>;

interface PendingException {
  error: unknown;
  context: BrowserExceptionContext;
}

interface PendingProductEvent {
  event: keyof ProductAnalyticsEvents;
  properties: ProductAnalyticsEvents[keyof ProductAnalyticsEvents];
}

const MAX_PENDING_EXCEPTIONS = 20;
const MAX_PENDING_PRODUCT_EVENTS = 50;
const URL_PROPERTY_NAMES = new Set(['$current_url', '$referrer', '$pathname']);
const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s"'<>]+/g;

export function resolvePostHogConfig(
  environment: PostHogPublicEnvironment
): PostHogPublicConfig | null {
  const token = environment.PUBLIC_POSTHOG_TOKEN?.trim();
  const host = environment.PUBLIC_POSTHOG_HOST?.trim();

  if (!token || !host) return null;

  try {
    const url = new URL(host);
    const isSecureOrigin =
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '';

    return isSecureOrigin ? { token, host: url.origin } : null;
  } catch {
    return null;
  }
}

export const sanitizePostHogEvent: BeforeSendFn = (event) => {
  if (!event) return null;

  return {
    ...event,
    properties: Object.fromEntries(
      Object.entries(event.properties).map(([name, value]) => [
        name,
        URL_PROPERTY_NAMES.has(name) && typeof value === 'string' ? stripUrlDetails(value) : value
      ])
    )
  };
};

export function createPostHogAnalytics() {
  let client: PostHogClient | undefined;
  let initialized = false;
  let preparing = false;
  const seenErrors = new WeakSet<object>();
  const pendingExceptions: PendingException[] = [];
  const pendingProductEvents: PendingProductEvent[] = [];

  function prepare(): boolean {
    if (initialized) return false;
    preparing = true;
    return true;
  }

  function initialize(environment: PostHogPublicEnvironment, nextClient: PostHogClient): boolean {
    if (initialized) return false;

    const config = resolvePostHogConfig(environment);
    if (!config) return false;

    const options: Partial<PostHogConfig> = {
      api_host: config.host,
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
    };
    try {
      nextClient.init(config.token, options);
    } catch {
      return false;
    }
    client = nextClient;
    initialized = true;
    preparing = false;

    for (const pendingEvent of pendingProductEvents.splice(0)) {
      sendProductEvent(pendingEvent.event, pendingEvent.properties);
    }

    for (const exception of pendingExceptions.splice(0)) {
      sendException(exception.error, exception.context);
    }
    return true;
  }

  function capture<EventName extends keyof ProductAnalyticsEvents>(
    event: EventName,
    properties: ProductAnalyticsEvents[EventName]
  ): boolean {
    if (!client) {
      if (!preparing) return false;
      if (pendingProductEvents.length >= MAX_PENDING_PRODUCT_EVENTS) return false;
      pendingProductEvents.push({ event, properties: { ...properties } });
      return true;
    }

    return sendProductEvent(event, properties);
  }

  function sendProductEvent(
    event: keyof ProductAnalyticsEvents,
    properties: ProductAnalyticsEvents[keyof ProductAnalyticsEvents]
  ): boolean {
    if (!client) return false;
    try {
      client.capture(event, { ...properties });
      return true;
    } catch {
      return false;
    }
  }

  function captureException(error: unknown, context: BrowserExceptionContext): boolean {
    if (isObject(error)) {
      if (seenErrors.has(error)) return false;
      seenErrors.add(error);
    }

    if (!client) {
      if (pendingExceptions.length < MAX_PENDING_EXCEPTIONS) {
        pendingExceptions.push({ error, context: sanitizeExceptionContext(context) });
      }
      return false;
    }

    return sendException(error, context);
  }

  function startBrowserErrorTracking(target: Window): () => void {
    const captureWindowError = (event: ErrorEvent) => {
      captureException(event.error ?? new Error(event.message || 'Unknown browser error'), {
        source: 'window.error',
        route: target.location.href
      });
    };
    const captureUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureException(event.reason, {
        source: 'unhandledrejection',
        route: target.location.href
      });
    };

    target.addEventListener('error', captureWindowError);
    target.addEventListener('unhandledrejection', captureUnhandledRejection);

    return () => {
      target.removeEventListener('error', captureWindowError);
      target.removeEventListener('unhandledrejection', captureUnhandledRejection);
    };
  }

  function sendException(error: unknown, context: BrowserExceptionContext): boolean {
    if (!client) return false;
    try {
      client.captureException(sanitizeException(error), { ...sanitizeExceptionContext(context) });
      return true;
    } catch {
      return false;
    }
  }

  return { prepare, initialize, capture, captureException, startBrowserErrorTracking };
}

export const postHogAnalytics = createPostHogAnalytics();

export function initializePostHog(
  environment: PostHogPublicEnvironment,
  client: PostHogClient
): boolean {
  return postHogAnalytics.initialize(environment, client);
}

function sanitizeException(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return typeof error === 'string'
      ? sanitizeText(error)
      : new Error('Non-Error browser exception');
  }

  const sanitized = new Error(sanitizeText(error.message));
  sanitized.name = error.name;
  if (error.stack) sanitized.stack = sanitizeText(error.stack);
  return sanitized;
}

function sanitizeExceptionContext(context: BrowserExceptionContext): BrowserExceptionContext {
  return {
    ...context,
    route: routePath(context.route)
  };
}

function sanitizeText(value: string): string {
  return value.replace(URL_IN_TEXT_PATTERN, (url) => stripUrlDetails(url));
}

function stripUrlDetails(value: string): string {
  try {
    const url = new URL(value, 'https://hundavaent.invalid');
    url.search = '';
    url.hash = '';
    return url.origin === 'https://hundavaent.invalid' ? url.pathname : url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

function routePath(value: string): string {
  try {
    return new URL(value, 'https://hundavaent.invalid').pathname;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
