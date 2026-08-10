import type { Locale } from '$i18n/locale';

export interface TranslationResolverResult {
  kind: 'resolved' | 'ambiguous' | 'none';
  keys: string[];
}

export interface TranslationResolver {
  resolve(value: string, explicitKey?: string | null): TranslationResolverResult;
}

interface CandidatePattern {
  key: string;
  pattern: RegExp;
}

export function createTranslationResolver(
  catalogues: Record<Locale, Record<string, string>>,
  locale: Locale
): TranslationResolver {
  const messages = catalogues[locale];
  const exact = new Map<string, string[]>();
  const templates: CandidatePattern[] = [];

  for (const [key, message] of Object.entries(messages)) {
    const normalized = normalizeVisibleCopy(message);
    const keys = exact.get(normalized) ?? [];
    keys.push(key);
    exact.set(normalized, keys);
    if (/\{[^{}]+\}/.test(normalized)) {
      templates.push({ key, pattern: placeholderPattern(normalized) });
    }
  }

  return {
    resolve(value, explicitKey = null) {
      if (explicitKey && Object.hasOwn(messages, explicitKey)) {
        return { kind: 'resolved', keys: [explicitKey] };
      }

      const normalized = normalizeVisibleCopy(value);
      if (!normalized) return { kind: 'none', keys: [] };
      const exactKeys = exact.get(normalized);
      if (exactKeys?.length) return resultFor(exactKeys);

      const matched = templates
        .filter(({ pattern }) => pattern.test(normalized))
        .map(({ key }) => key)
        .sort();
      return resultFor(matched);
    }
  };
}

export function normalizeTranslationPageId(routeId: string): string {
  const localeRoot = '/[lang=lang]';
  if (routeId === localeRoot) return '/';
  return routeId.startsWith(`${localeRoot}/`) ? routeId.slice(localeRoot.length) : routeId;
}

export function isEligibleTranslationRoute(routeId: string | null): boolean {
  if (!routeId || !routeId.startsWith('/[lang=lang]')) return false;
  const pageId = normalizeTranslationPageId(routeId);
  return pageId !== '/auth' && !pageId.startsWith('/auth/');
}

export function normalizeVisibleCopy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function placeholderPattern(template: string): RegExp {
  const parts = template.split(/\{[^{}]+\}/g).map(escapeRegExp);
  return new RegExp(`^${parts.join('(.+?)')}$`, 'u');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resultFor(keys: string[]): TranslationResolverResult {
  const unique = [...new Set(keys)].sort();
  if (unique.length === 0) return { kind: 'none', keys: [] };
  return { kind: unique.length === 1 ? 'resolved' : 'ambiguous', keys: unique };
}
