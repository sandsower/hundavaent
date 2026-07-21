export interface TranslationAccessConfig {
  password: string;
  sessionSecret: string;
  databaseSecret: string;
}

export const TRANSLATION_COOKIE_NAME = 'hundavaent-translations';
export const TRANSLATION_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const sessionVersion = 'v1';
const sessionMessage = 'hundavaent-translation-workspace';

export function getTranslationAccessConfig(
  environment: Record<string, string | undefined>
): TranslationAccessConfig | null {
  const password = environment.TRANSLATION_WORKSPACE_PASSWORD?.trim();
  const sessionSecret = environment.TRANSLATION_SESSION_SECRET?.trim();
  const databaseSecret = environment.TRANSLATION_DATABASE_SECRET?.trim();

  if (!password || !sessionSecret || !databaseSecret) return null;

  return { password, sessionSecret, databaseSecret };
}

export async function verifyTranslationPassword(
  candidate: string,
  config: TranslationAccessConfig
): Promise<boolean> {
  if (!candidate) return false;

  const [candidateDigest, expectedDigest] = await Promise.all([
    hmacHex(config.sessionSecret, `${sessionMessage}:password:${candidate}`),
    hmacHex(config.sessionSecret, `${sessionMessage}:password:${config.password}`)
  ]);
  return candidateDigest === expectedDigest;
}

export async function createTranslationSession(
  config: TranslationAccessConfig,
  now: Date = new Date()
): Promise<string> {
  const expiresAt = Math.floor(now.getTime() / 1000) + TRANSLATION_SESSION_MAX_AGE_SECONDS;
  const signature = await sessionSignature(config, expiresAt);
  return `${sessionVersion}.${expiresAt}.${signature}`;
}

export async function isTranslationSessionValid(
  value: string | undefined,
  config: TranslationAccessConfig,
  now: Date = new Date()
): Promise<boolean> {
  if (!value) return false;
  const [version, expiresText, signature, ...extra] = value.split('.');
  if (
    version !== sessionVersion ||
    extra.length > 0 ||
    !/^\d{10}$/.test(expiresText ?? '') ||
    !/^[0-9a-f]{64}$/.test(signature ?? '')
  ) {
    return false;
  }

  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now.getTime() / 1000)) {
    return false;
  }

  return (await sessionSignature(config, expiresAt)) === signature;
}

export function normalizeTranslationRedirectTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/translations';
  }

  const parsed = new URL(value, 'https://hundavaent.local');
  if (
    parsed.origin !== 'https://hundavaent.local' ||
    !parsed.pathname.startsWith('/translations') ||
    parsed.pathname === '/translations/sign-in'
  ) {
    return '/translations';
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function translationCookieOptions(url: URL): {
  path: '/translations';
  httpOnly: true;
  sameSite: 'strict';
  secure: boolean;
  maxAge: number;
} {
  return {
    path: '/translations',
    httpOnly: true,
    sameSite: 'strict',
    secure: url.protocol === 'https:',
    maxAge: TRANSLATION_SESSION_MAX_AGE_SECONDS
  };
}

async function sessionSignature(
  config: TranslationAccessConfig,
  expiresAt: number
): Promise<string> {
  return hmacHex(
    config.sessionSecret,
    `${sessionMessage}:${sessionVersion}:${expiresAt}:${config.password}`
  );
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
