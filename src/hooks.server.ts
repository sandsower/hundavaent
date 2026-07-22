import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { Handle, HandleServerError } from '@sveltejs/kit';

import { catalogues, isLocale, parseLocale, type Locale } from '$i18n';
import {
  createRequestSupabaseClient,
  getSupabasePublicConfig,
  type RequestSupabaseClient,
  type SupabasePublicConfig
} from '$server/db/clients';
import { GATE_COOKIE_NAME, getGateConfig, isGateCookieValid, type GateConfig } from '$server/gate';
import { createPublicServerError, createRequestId } from '$server/telemetry/request-context';
import { telemetryLogger, type TelemetryLogger } from '$server/telemetry/logger';
import {
  loadPublishedCatalogue,
  type PublishedCatalogueResult,
  type PublishedTranslationClient
} from '$server/translations/published-catalogue';

interface HandleDependencies {
  getPublicConfig(): SupabasePublicConfig | null;
  createClient(
    cookies: Parameters<typeof createRequestSupabaseClient>[0],
    config: SupabasePublicConfig
  ): RequestSupabaseClient;
  createRequestId(headers: Headers): string;
  getGateConfig(): GateConfig | null;
  loadCatalogue?(
    client: PublishedTranslationClient | null,
    locale: Locale
  ): Promise<PublishedCatalogueResult>;
  logger?: TelemetryLogger;
  now?: () => number;
}

const defaultDependencies: HandleDependencies = {
  getPublicConfig: () => getSupabasePublicConfig(env),
  createClient: createRequestSupabaseClient,
  createRequestId,
  getGateConfig: () => getGateConfig(privateEnv),
  loadCatalogue: loadPublishedCatalogue,
  logger: telemetryLogger,
  now: () => performance.now()
};

const gateExemptPathnames = new Set(['/gate', '/api/health']);
const slowRequestThresholdMs = 1_000;

export function createHandle(dependencies: HandleDependencies = defaultDependencies): Handle {
  return async ({ event, resolve }) => {
    const logger = dependencies.logger ?? telemetryLogger;
    const now = dependencies.now ?? (() => performance.now());
    const startedAt = now();
    const routeLocale = event.url.pathname.split('/')[1];
    const locale = parseLocale(routeLocale);
    event.locals.requestId = dependencies.createRequestId(event.request.headers);
    event.locals.supabase = null;
    event.locals.copy = catalogues[locale];
    event.locals.translationRevision = null;
    event.locals.translationSource = 'bundled';

    const gateConfig = dependencies.getGateConfig();

    if (gateConfig && !isGateExemptPathname(event.url.pathname)) {
      const gateCookie = event.cookies.get(GATE_COOKIE_NAME);

      if (!(await isGateCookieValid(gateCookie, gateConfig))) {
        const redirectTo = encodeURIComponent(event.url.pathname + event.url.search);
        const redirectResponse = new Response(null, {
          status: 303,
          headers: { location: `/gate?redirectTo=${redirectTo}` }
        });
        return finalizeResponse(event, redirectResponse, gateConfig);
      }
    }

    const config = dependencies.getPublicConfig();

    if (config) {
      const supabase = dependencies.createClient(event.cookies, config);
      event.locals.supabase = supabase;

      try {
        await supabase.auth.getClaims();
      } catch {
        // Public browsing stays available. Protected routes perform their own authenticated check.
      }
    }

    if (isLocale(routeLocale)) {
      const loadCatalogue = dependencies.loadCatalogue ?? loadPublishedCatalogue;
      const publication = await loadCatalogue(
        event.locals.supabase as unknown as PublishedTranslationClient | null,
        locale
      );
      event.locals.copy = publication.copy;
      event.locals.translationRevision = publication.revisionNumber;
      event.locals.translationSource = publication.source;
    }

    const response = await resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale)
    });
    const durationMs = Math.round(Math.max(0, now() - startedAt));
    logRequestOutcome(logger, event, response, durationMs);
    return finalizeResponse(event, response, gateConfig);
  };
}

function logRequestOutcome(
  logger: TelemetryLogger,
  event: Parameters<Handle>[0]['event'],
  response: Response,
  durationMs: number
): void {
  const record = {
    requestId: event.locals.requestId,
    method: event.request.method,
    routeId: event.route.id ?? 'unknown',
    status: response.status,
    durationMs
  };

  if (response.status >= 500) {
    logger.serverFailure(record);
  } else if (durationMs >= slowRequestThresholdMs) {
    logger.slowRequest(record);
  }
}

function finalizeResponse(
  event: Parameters<Handle>[0]['event'],
  response: Response,
  gateConfig: GateConfig | null
): Response {
  response.headers.set('x-request-id', event.locals.requestId);
  applySecurityHeaders(event, response);

  if (gateConfig || isTranslationWorkspacePath(event.url.pathname)) {
    // Provisional deployments and the private translation workspace must never be indexed.
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  }

  return response;
}

export const handle = createHandle();

export function createHandleError(logger: TelemetryLogger = telemetryLogger): HandleServerError {
  return ({ error, event, status }) => {
    const requestId = event.locals.requestId ?? createRequestId(event.request.headers);
    logger.serverError({
      requestId,
      method: event.request.method,
      routeId: event.route.id ?? 'unknown',
      status,
      errorType: error instanceof Error ? error.name : 'UnknownError'
    });

    return createPublicServerError(requestId);
  };
}

export const handleError = createHandleError();

function applySecurityHeaders(event: Parameters<Handle>[0]['event'], response: Response): void {
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');

  if (event.url.protocol === 'https:' && !isLocalHostname(event.url.hostname)) {
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }

  if (!response.headers.has('cache-control')) {
    response.headers.set('cache-control', cacheControlFor(event, response));
  }
}

function cacheControlFor(event: Parameters<Handle>[0]['event'], response: Response): string {
  const sensitiveRoute =
    event.url.pathname === '/gate' ||
    isTranslationWorkspacePath(event.url.pathname) ||
    event.url.pathname.startsWith('/api/') ||
    isLocale(event.url.pathname.split('/')[1]) ||
    event.url.pathname.includes('/moderation') ||
    event.url.pathname.includes('/account') ||
    event.url.pathname.includes('/auth/');
  const hasCallerState = event.request.headers.has('cookie') || response.headers.has('set-cookie');
  const hasAuthQueryState = [...event.url.searchParams.keys()].some(
    (name) => name.toLowerCase().startsWith('auth') || name.toLowerCase().startsWith('pending')
  );
  const cacheableMethod = event.request.method === 'GET' || event.request.method === 'HEAD';

  if (
    sensitiveRoute ||
    hasCallerState ||
    hasAuthQueryState ||
    !cacheableMethod ||
    response.status !== 200
  ) {
    return 'private, no-store';
  }

  appendVary(response.headers, 'Cookie');
  return 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get('vary');
  const values = new Set(
    current
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
  values.add(value);
  headers.set('vary', [...values].join(', '));
}

function isGateExemptPathname(pathname: string): boolean {
  return gateExemptPathnames.has(pathname) || isTranslationWorkspacePath(pathname);
}

function isTranslationWorkspacePath(pathname: string): boolean {
  return pathname === '/translations' || pathname.startsWith('/translations/');
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
