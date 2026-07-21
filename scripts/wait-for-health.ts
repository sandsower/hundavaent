import { pathToFileURL } from 'node:url';

export interface WaitForHealthOptions {
  url: string;
  timeoutMs?: number;
  intervalMs?: number;
  expectedRelease?: string;
  expectedChecks?: Readonly<Record<string, string>>;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  acceptResponse?: (response: Response) => boolean | Promise<boolean>;
}

export async function waitForHealth({
  url,
  timeoutMs = 60_000,
  intervalMs = 250,
  expectedRelease,
  expectedChecks = {},
  fetchImplementation = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  acceptResponse = () => true
}: WaitForHealthOptions): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'no response';

  while (Date.now() <= deadline) {
    try {
      const response = await fetchImplementation(url, {
        headers: { accept: 'application/json, text/html;q=0.9' }
      });
      const expectedHealth = response.ok
        ? await responseMatchesExpectedHealth(response, expectedRelease, expectedChecks)
        : false;
      if (response.ok && expectedHealth && (await acceptResponse(response))) return response;
      lastFailure = response.ok
        ? 'healthy response did not match the expected server'
        : `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Health check timed out for ${url}: ${lastFailure}`);
}

async function responseMatchesExpectedHealth(
  response: Response,
  expectedRelease: string | undefined,
  expectedChecks: Readonly<Record<string, string>>
): Promise<boolean> {
  const checkEntries = Object.entries(expectedChecks);
  if (!expectedRelease && checkEntries.length === 0) return true;

  try {
    const body: unknown = await response.clone().json();
    if (!isRecord(body)) return false;
    if (expectedRelease && body.release !== expectedRelease) return false;
    if (checkEntries.length === 0) return true;
    const checks = body.checks;
    if (!isRecord(checks)) return false;
    return checkEntries.every(([name, value]) => checks[name] === value);
  } catch {
    return false;
  }
}

export function parseWaitForHealthArguments(
  arguments_: string[],
  environment: NodeJS.ProcessEnv = process.env
): Pick<WaitForHealthOptions, 'url' | 'expectedRelease' | 'expectedChecks'> {
  let index = 0;
  const url =
    arguments_[0] && !arguments_[0].startsWith('--')
      ? arguments_[index++]
      : environment.EVALUATION_HEALTH_URL || 'http://127.0.0.1:4173/api/health';
  let expectedRelease: string | undefined;
  const expectedChecks: Record<string, string> = {};

  while (index < arguments_.length) {
    const option = arguments_[index++];
    const value = arguments_[index++];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for health option: ${option}`);
    }
    if (option === '--expected-release') {
      expectedRelease = value;
      continue;
    }
    if (option === '--expected-check') {
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new Error(`Expected health check in name=value form: ${value}`);
      }
      expectedChecks[value.slice(0, separator)] = value.slice(separator + 1);
      continue;
    }
    throw new Error(`Unknown health option: ${option}`);
  }

  return {
    url,
    ...(expectedRelease ? { expectedRelease } : {}),
    ...(Object.keys(expectedChecks).length > 0 ? { expectedChecks } : {})
  };
}

async function main(): Promise<void> {
  const options = parseWaitForHealthArguments(process.argv.slice(2));
  await waitForHealth(options);
  console.log(`Healthy: ${options.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
