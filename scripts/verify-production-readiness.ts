import { pathToFileURL } from 'node:url';

export interface PendingProductionAssertion {
  name: string;
  detail: string;
}

export interface ProductionReadinessOptions {
  productionUrl: string;
  expectedRelease: string;
  timeoutMs?: number;
  intervalMs?: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  onPending?: (assertion: PendingProductionAssertion) => void;
}

interface ProductionReadinessAttemptOptions {
  productionUrl: URL;
  expectedRelease: string;
  fetchImplementation: typeof fetch;
}

class ProductionAssertionPending extends Error {
  constructor(readonly assertion: PendingProductionAssertion) {
    super(`${assertion.name}: ${assertion.detail}`);
  }
}

export async function waitForProductionReadiness({
  productionUrl,
  expectedRelease,
  timeoutMs = 90_000,
  intervalMs = 1_000,
  fetchImplementation = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
  onPending = () => undefined
}: ProductionReadinessOptions): Promise<void> {
  const origin = parseProductionUrl(productionUrl);
  const deadline = now() + timeoutMs;
  let lastPending: PendingProductionAssertion = {
    name: 'production.request',
    detail: 'no readiness attempt completed'
  };

  while (now() <= deadline) {
    try {
      await verifyProductionReadinessAttempt({
        productionUrl: origin,
        expectedRelease,
        fetchImplementation
      });
      return;
    } catch (error) {
      lastPending =
        error instanceof ProductionAssertionPending
          ? error.assertion
          : {
              name: 'production.request',
              detail: error instanceof Error ? error.message : String(error)
            };
      onPending(lastPending);
    }

    if (now() >= deadline) break;
    await sleep(intervalMs);
  }

  throw new Error(`Production readiness timed out: ${lastPending.name} (${lastPending.detail})`);
}

export async function verifyProductionReadinessAttempt({
  productionUrl,
  expectedRelease,
  fetchImplementation
}: ProductionReadinessAttemptOptions): Promise<void> {
  const health = await fetchJson(
    new URL('/api/health', productionUrl),
    'health.request',
    fetchImplementation
  );
  assertEqual('health.service', health.service, 'hundavaent');
  assertEqual('health.status', health.status, 'ok');
  assertEqual('health.release', health.release, expectedRelease);

  const checks = isRecord(health.checks) ? health.checks : {};
  assertEqual('health.database', checks.database, 'ready');
  assertEqual('health.map', checks.map, 'configured');
  assertEqual('health.translations', checks.translations, 'published');

  const gate = await fetchResponse(
    new URL('/is', productionUrl),
    'gate.request',
    fetchImplementation,
    { method: 'HEAD', redirect: 'manual' }
  );
  const gateLocation = gate.headers.get('location');
  assertCondition(
    'gate.redirect',
    isRedirectTo(gateLocation, productionUrl, '/gate'),
    `expected a redirect to /gate, received ${formatValue(gateLocation)}`
  );
  assertNoindex('gate.noindex', gate.headers.get('x-robots-tag'));

  const workspace = await fetchResponse(
    new URL('/translations', productionUrl),
    'translation-workspace.request',
    fetchImplementation,
    { method: 'HEAD', redirect: 'manual' }
  );
  const workspaceLocation = workspace.headers.get('location');
  assertCondition(
    'translation-workspace.redirect',
    isWorkspaceSignInRedirect(workspaceLocation, productionUrl),
    `expected the translation sign-in redirect, received ${formatValue(workspaceLocation)}`
  );

  const signIn = await fetchResponse(
    new URL('/translations/sign-in', productionUrl),
    'translation-workspace.sign-in-request',
    fetchImplementation,
    { redirect: 'manual' }
  );
  assertCondition(
    'translation-workspace.cache-control',
    hasCacheDirectives(signIn.headers.get('cache-control'), ['private', 'no-store']),
    `expected private, no-store, received ${formatValue(signIn.headers.get('cache-control'))}`
  );
  assertNoindex('translation-workspace.noindex', signIn.headers.get('x-robots-tag'));

  const signInBody = await signIn.text();
  assertCondition(
    'translation-workspace.form',
    signInBody.includes('data-translation-workspace-sign-in'),
    'sign-in marker was absent'
  );
  assertCondition(
    'translation-workspace.password',
    signInBody.includes('name="password"'),
    'password field was absent'
  );
}

async function fetchJson(
  url: URL,
  assertionName: string,
  fetchImplementation: typeof fetch
): Promise<Record<string, unknown>> {
  const response = await fetchResponse(url, assertionName, fetchImplementation, {
    headers: { accept: 'application/json' },
    redirect: 'manual'
  });

  try {
    const body: unknown = await response.json();
    assertCondition(assertionName, isRecord(body), 'response was not a JSON object');
    return body;
  } catch (error) {
    if (error instanceof ProductionAssertionPending) throw error;
    pending(assertionName, 'response was not valid JSON');
  }
}

async function fetchResponse(
  url: URL,
  assertionName: string,
  fetchImplementation: typeof fetch,
  init: RequestInit
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImplementation(url, init);
  } catch (error) {
    pending(assertionName, error instanceof Error ? error.message : String(error));
  }

  assertCondition(
    assertionName,
    response.ok || isRedirect(response.status),
    `received HTTP ${response.status}`
  );
  return response;
}

function assertEqual(name: string, actual: unknown, expected: string): void {
  assertCondition(
    name,
    actual === expected,
    `expected ${formatValue(expected)}, received ${formatValue(actual)}`
  );
}

function assertNoindex(name: string, value: string | null): void {
  assertCondition(
    name,
    value
      ?.split(',')
      .map((directive) => directive.trim().toLowerCase())
      .includes('noindex') === true,
    `expected noindex, received ${formatValue(value)}`
  );
}

function assertCondition(name: string, condition: boolean, detail: string): asserts condition {
  if (!condition) pending(name, detail);
}

function pending(name: string, detail: string): never {
  throw new ProductionAssertionPending({ name, detail });
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isRedirectTo(location: string | null, origin: URL, expectedPath: string): boolean {
  if (!location) return false;
  try {
    return new URL(location, origin).pathname === expectedPath;
  } catch {
    return false;
  }
}

function isWorkspaceSignInRedirect(location: string | null, origin: URL): boolean {
  if (!location) return false;
  try {
    const redirect = new URL(location, origin);
    return (
      redirect.pathname === '/translations/sign-in' &&
      redirect.searchParams.get('redirectTo') === '/translations'
    );
  } catch {
    return false;
  }
}

function hasCacheDirectives(value: string | null, expected: string[]): boolean {
  if (!value) return false;
  const directives = new Set(value.split(',').map((directive) => directive.trim().toLowerCase()));
  return expected.every((directive) => directives.has(directive));
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProductionUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Production URL must use http or https.');
  }
  return url;
}

export function parseProductionReadinessArguments(arguments_: string[]): {
  productionUrl: string;
  expectedRelease: string;
  timeoutMs?: number;
  intervalMs?: number;
} {
  const [productionUrl, expectedRelease, ...options] = arguments_;
  if (!productionUrl) throw new Error('Missing production URL.');
  parseProductionUrl(productionUrl);
  if (!expectedRelease || !/^[0-9a-f]{40}$/.test(expectedRelease)) {
    throw new Error('Expected release must be a 40-character lowercase hexadecimal SHA.');
  }

  const parsed: {
    productionUrl: string;
    expectedRelease: string;
    timeoutMs?: number;
    intervalMs?: number;
  } = { productionUrl, expectedRelease };

  for (let index = 0; index < options.length; index += 2) {
    const option = options[index];
    const value = options[index + 1];
    if (!value) throw new Error(`Missing value for production readiness option: ${option}`);
    const milliseconds = Number(value);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new Error(`Expected non-negative integer milliseconds for ${option}: ${value}`);
    }
    if (option === '--timeout-ms') {
      parsed.timeoutMs = milliseconds;
      continue;
    }
    if (option === '--interval-ms') {
      parsed.intervalMs = milliseconds;
      continue;
    }
    throw new Error(`Unknown production readiness option: ${option}`);
  }

  return parsed;
}

async function main(): Promise<void> {
  const options = parseProductionReadinessArguments(process.argv.slice(2));
  await waitForProductionReadiness({
    ...options,
    onPending: ({ name, detail }) => {
      console.warn(`[production-readiness] pending ${name}: ${detail}`);
    }
  });
  console.log(
    `[production-readiness] ready ${new URL(options.productionUrl).origin} at ${options.expectedRelease}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
