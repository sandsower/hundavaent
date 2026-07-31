// Locale identity only - no imports, and none may ever be added. index.ts imports both full
// message catalogues at value level, so any module that reaches index.ts at runtime ships every
// English and Icelandic interface string to the browser (~180 KB decoded). Client-reachable code
// that needs to know what a locale IS - without needing what the locales SAY - imports this file
// (directly or via '$i18n/locale') so the catalogues stay out of routes that render copy the
// server already resolved.
export const supportedLocales = ['is', 'en'] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'is';

export function isLocale(value: string | null | undefined): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}

export function parseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}
