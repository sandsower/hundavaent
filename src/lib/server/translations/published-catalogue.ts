import { catalogues, type Catalogue, type Locale } from '$i18n';

export interface PublishedTranslationClient {
  rpc(
    functionName: 'get_published_interface_translations',
    arguments_: { requested_locale: Locale }
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface PublishedCatalogueResult {
  copy: Catalogue;
  revisionNumber: string | null;
  source: 'bundled' | 'published';
}

const maximumMessageLength = 10_000;

export async function loadPublishedCatalogue(
  client: PublishedTranslationClient | null,
  locale: Locale
): Promise<PublishedCatalogueResult> {
  const fallback = catalogues[locale];

  if (!client) return bundledResult(fallback);

  try {
    const { data, error } = await client.rpc('get_published_interface_translations', {
      requested_locale: locale
    });
    if (error || !Array.isArray(data) || data.length !== 1) return bundledResult(fallback);

    const row = data[0];
    if (!isRecord(row) || !isRevisionNumber(row.revision_number)) {
      return bundledResult(fallback);
    }
    if (
      typeof row.published_at !== 'string' ||
      !row.published_at.trim() ||
      Number.isNaN(Date.parse(row.published_at))
    ) {
      return bundledResult(fallback);
    }
    if (!isCompleteCatalogue(row.messages, fallback)) return bundledResult(fallback);

    return {
      copy: { ...fallback, ...row.messages },
      revisionNumber: String(row.revision_number),
      source: 'published'
    };
  } catch {
    return bundledResult(fallback);
  }
}

function bundledResult(copy: Catalogue): PublishedCatalogueResult {
  return { copy, revisionNumber: null, source: 'bundled' };
}

function isCompleteCatalogue(value: unknown, fallback: Catalogue): value is Catalogue {
  if (!isRecord(value)) return false;

  const expectedKeys = Object.keys(fallback);
  const receivedKeys = Object.keys(value);
  if (receivedKeys.length !== expectedKeys.length) return false;

  for (const key of expectedKeys) {
    const message = value[key];
    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > maximumMessageLength ||
      !samePlaceholders(message, fallback[key as keyof Catalogue])
    ) {
      return false;
    }
  }

  return true;
}

function samePlaceholders(candidate: string, fallback: string): boolean {
  const candidatePlaceholders = placeholders(candidate);
  const fallbackPlaceholders = placeholders(fallback);

  return (
    candidatePlaceholders.length === fallbackPlaceholders.length &&
    candidatePlaceholders.every((placeholder, index) => placeholder === fallbackPlaceholders[index])
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(([placeholder]) => placeholder).sort();
}

function isRevisionNumber(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
