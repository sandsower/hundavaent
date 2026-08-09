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
  deadline?: number;
  now?: () => number;
}

interface AttemptBudget {
  deadline: number;
  now: () => number;
}

interface BoundedResponse {
  response: Response;
  abort: () => void;
}

class ProductionAssertionPending extends Error {
  readonly assertion: PendingProductionAssertion;

  constructor(assertion: PendingProductionAssertion) {
    super(`${assertion.name}: ${assertion.detail}`);
    this.assertion = assertion;
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

  while (now() < deadline) {
    try {
      await verifyProductionReadinessAttempt({
        productionUrl: origin,
        expectedRelease,
        fetchImplementation,
        deadline,
        now
      });
      return;
    } catch (error) {
      lastPending =
        error instanceof ProductionAssertionPending
          ? error.assertion
          : {
              name: 'production.request',
              detail: 'unexpected verifier failure'
            };
      onPending(lastPending);
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  throw new Error(`Production readiness timed out: ${lastPending.name} (${lastPending.detail})`);
}

export async function verifyProductionReadinessAttempt({
  productionUrl,
  expectedRelease,
  fetchImplementation,
  deadline,
  now = Date.now
}: ProductionReadinessAttemptOptions): Promise<void> {
  const budget: AttemptBudget = {
    deadline: deadline ?? now() + 90_000,
    now
  };
  const health = await fetchJson(
    new URL('/api/health', productionUrl),
    'health.request',
    fetchImplementation,
    budget
  );
  assertEqual('health.service', health.service, 'hundavaent');
  assertEqual('health.status', health.status, 'ok');
  assertEqual('health.release', health.release, expectedRelease);

  const checks = isRecord(health.checks) ? health.checks : {};
  assertEqual('health.database', checks.database, 'ready');
  assertEqual('health.map', checks.map, 'configured');
  assertEqual('health.translations', checks.translations, 'synchronized');

  const gateRequest = await fetchResponse(
    new URL('/is', productionUrl),
    'gate.request',
    fetchImplementation,
    { method: 'HEAD', redirect: 'manual' },
    budget
  );
  const gate = gateRequest.response;
  const gateLocation = gate.headers.get('location');
  assertCondition(
    'gate.redirect',
    isRedirectTo(gateLocation, productionUrl, '/gate'),
    'expected a same-origin redirect to /gate'
  );
  assertNoindex('gate.noindex', gate.headers.get('x-robots-tag'));

  const workspaceRequest = await fetchResponse(
    new URL('/translations', productionUrl),
    'translation-workspace.request',
    fetchImplementation,
    { method: 'HEAD', redirect: 'manual' },
    budget
  );
  const workspace = workspaceRequest.response;
  const workspaceLocation = workspace.headers.get('location');
  assertCondition(
    'translation-workspace.redirect',
    isWorkspaceSignInRedirect(workspaceLocation, productionUrl),
    'expected a same-origin translation sign-in redirect'
  );

  const signInRequest = await fetchResponse(
    new URL('/translations/sign-in', productionUrl),
    'translation-workspace.sign-in-request',
    fetchImplementation,
    { redirect: 'manual' },
    budget
  );
  const signIn = signInRequest.response;
  assertCondition(
    'translation-workspace.cache-control',
    hasCacheDirectives(signIn.headers.get('cache-control'), ['private', 'no-store']),
    `expected private, no-store, received ${formatValue(signIn.headers.get('cache-control'))}`
  );
  assertNoindex('translation-workspace.noindex', signIn.headers.get('x-robots-tag'));

  const signInBody = await readResponseBody(
    signInRequest,
    'translation-workspace.sign-in-request',
    budget,
    (response) => response.text(),
    'response body could not be read'
  );
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
  fetchImplementation: typeof fetch,
  budget: AttemptBudget
): Promise<Record<string, unknown>> {
  const request = await fetchResponse(
    url,
    assertionName,
    fetchImplementation,
    {
      headers: { accept: 'application/json' },
      redirect: 'manual'
    },
    budget
  );

  try {
    const body: unknown = await withRemainingBudget(
      () => request.response.json(),
      assertionName,
      budget,
      request.abort
    );
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
  init: RequestInit,
  budget: AttemptBudget
): Promise<BoundedResponse> {
  const controller = new AbortController();
  let response: Response;
  try {
    response = await withRemainingBudget(
      () =>
        fetchImplementation(url, {
          ...init,
          signal: controller.signal
        }),
      assertionName,
      budget,
      () => controller.abort()
    );
  } catch (error) {
    if (error instanceof ProductionAssertionPending) throw error;
    pending(assertionName, 'request failed before a response was received');
  }

  assertCondition(
    assertionName,
    response.ok || isRedirect(response.status),
    `received HTTP ${response.status}`
  );
  return {
    response,
    abort: () => controller.abort()
  };
}

async function readResponseBody<T>(
  request: BoundedResponse,
  assertionName: string,
  budget: AttemptBudget,
  read: (response: Response) => Promise<T>,
  failureDetail: string
): Promise<T> {
  try {
    return await withRemainingBudget(
      () => read(request.response),
      assertionName,
      budget,
      request.abort
    );
  } catch (error) {
    if (error instanceof ProductionAssertionPending) throw error;
    pending(assertionName, failureDetail);
  }
}

async function withRemainingBudget<T>(
  operation: () => Promise<T>,
  assertionName: string,
  budget: AttemptBudget,
  onTimeout: () => void
): Promise<T> {
  const remainingMs = budget.deadline - budget.now();
  if (remainingMs <= 0) {
    onTimeout();
    pending(assertionName, 'global readiness deadline elapsed');
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new ProductionAssertionPending({
          name: assertionName,
          detail: 'global readiness deadline elapsed'
        })
      );
      onTimeout();
    }, remainingMs);
  });

  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
    const redirect = new URL(location, origin);
    return redirect.origin === origin.origin && redirect.pathname === expectedPath;
  } catch {
    return false;
  }
}

function isWorkspaceSignInRedirect(location: string | null, origin: URL): boolean {
  if (!location) return false;
  try {
    const redirect = new URL(location, origin);
    return (
      redirect.origin === origin.origin &&
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
