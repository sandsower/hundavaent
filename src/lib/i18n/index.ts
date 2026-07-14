import { enCatalogue } from './en';
import { isCatalogue, type MessageKey } from './is';

export const supportedLocales = ['is', 'en'] as const;

export type Locale = (typeof supportedLocales)[number];
export type Catalogue = Record<MessageKey, string>;

export const defaultLocale: Locale = 'is';

export const catalogues: Record<Locale, Catalogue> = {
  is: isCatalogue,
  en: enCatalogue
};

export function isLocale(value: string | null | undefined): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}

export function parseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function translate(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key];
}

export type { MessageKey };
