import type { Locale } from '$i18n';

const localOrigin = 'https://hundavaent.local';

export function normalizeMemberReturnTo(value: unknown, locale: Locale): string {
  const discoveryRoot = `/${locale}`;

  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return discoveryRoot;
  }

  const parsed = new URL(value, localOrigin);
  const localePath =
    parsed.pathname === discoveryRoot || parsed.pathname.startsWith(`${discoveryRoot}/`);
  const isAuthLoop = parsed.pathname.startsWith(`${discoveryRoot}/auth/`);
  const isAccountLoop =
    parsed.pathname === `${discoveryRoot}/account` ||
    parsed.pathname.startsWith(`${discoveryRoot}/account/`);
  const isModerationPath =
    parsed.pathname === `${discoveryRoot}/moderation` ||
    parsed.pathname.startsWith(`${discoveryRoot}/moderation/`);

  if (
    parsed.origin !== localOrigin ||
    !localePath ||
    isAuthLoop ||
    isAccountLoop ||
    isModerationPath
  ) {
    return discoveryRoot;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function normalizeModerationReturnTo(value: unknown, locale: Locale): string {
  const moderationRoot = `/${locale}/moderation`;

  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return moderationRoot;
  }

  const parsed = new URL(value, localOrigin);
  const isModerationPath =
    parsed.pathname === moderationRoot || parsed.pathname.startsWith(`${moderationRoot}/`);

  if (parsed.origin !== localOrigin || !isModerationPath) {
    return moderationRoot;
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
