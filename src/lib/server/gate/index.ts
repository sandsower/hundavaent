export interface GateConfig {
  password: string;
}

export const GATE_COOKIE_NAME = 'hundavaent-gate';

const COOKIE_MESSAGE = 'hundavaent-gate-v1';

export function getGateConfig(environment: Record<string, string | undefined>): GateConfig | null {
  const password = environment.SITE_GATE_PASSWORD?.trim();

  if (!password) {
    return null;
  }

  return { password };
}

export async function verifyPassword(candidate: string, config: GateConfig): Promise<boolean> {
  if (!candidate) {
    return false;
  }

  // Comparing keyed digests instead of raw passwords keeps the comparison timing-independent.
  const [candidateDigest, expectedDigest] = await Promise.all([
    hmacHex(candidate, COOKIE_MESSAGE),
    hmacHex(config.password, COOKIE_MESSAGE)
  ]);
  return candidateDigest === expectedDigest;
}

export async function createGateCookieValue(config: GateConfig): Promise<string> {
  return hmacHex(config.password, COOKIE_MESSAGE);
}

export async function isGateCookieValid(
  value: string | undefined,
  config: GateConfig
): Promise<boolean> {
  if (!value) {
    return false;
  }

  return (await createGateCookieValue(config)) === value;
}

export function normalizeGateRedirectTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  const parsed = new URL(value, 'https://hundavaent.local');

  if (parsed.origin !== 'https://hundavaent.local' || parsed.pathname === '/gate') {
    return '/';
  }

  return `${parsed.pathname}${parsed.search}`;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
