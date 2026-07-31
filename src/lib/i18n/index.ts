import { enCatalogue } from './en';
import { isCatalogue, type MessageKey } from './is';
import { type Locale } from './locale';

// This module carries the full bilingual catalogues, so a runtime import of ANYTHING from it
// ships both of them to the browser. Locale identity (supportedLocales, isLocale, parseLocale,
// defaultLocale) lives in locale.ts and is re-exported below for the server-side callers that
// already resolve copy anyway; client-reachable modules must import '$i18n/locale' (or './locale')
// instead of this file unless they genuinely render from the catalogues.
export { defaultLocale, isLocale, parseLocale, supportedLocales, type Locale } from './locale';

export type Catalogue = Record<MessageKey, string>;

export const catalogues: Record<Locale, Catalogue> = {
  is: isCatalogue,
  en: enCatalogue
};

export function translate(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key];
}

export type { MessageKey };
