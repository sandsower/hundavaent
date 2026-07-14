import { pathToFileURL } from 'node:url';

export interface WaitForHealthOptions {
  url: string;
  timeoutMs?: number;
  intervalMs?: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  acceptResponse?: (response: Response) => boolean;
}

export async function waitForHealth({
  url,
  timeoutMs = 60_000,
  intervalMs = 250,
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
      if (response.ok && acceptResponse(response)) return response;
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

async function main(): Promise<void> {
  const url =
    process.argv[2] ?? process.env.EVALUATION_HEALTH_URL ?? 'http://127.0.0.1:4173/api/health';
  await waitForHealth({ url });
  console.log(`Healthy: ${url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
