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
  source: 'bundled';
}

export interface TranslationMirrorResult {
  status: 'synchronized' | 'drifted';
  revisionNumber: string | null;
}

interface PublishedTranslationRow {
  revision_number: number | string;
  published_at: string;
  messages: Record<string, string>;
}

const maximumMessageLength = 10_000;

export function loadBundledCatalogue(locale: Locale): PublishedCatalogueResult {
  return { copy: catalogues[locale], revisionNumber: null, source: 'bundled' };
}

export async function checkPublishedCatalogueMirror(
  client: PublishedTranslationClient
): Promise<TranslationMirrorResult> {
  try {
    const [icelandicResponse, englishResponse] = await Promise.all(
      (['is', 'en'] as const).map((locale) =>
        client.rpc('get_published_interface_translations', { requested_locale: locale })
      )
    );
    if (icelandicResponse.error || englishResponse.error) return driftedMirror();

    const icelandic = parsePublishedRow(icelandicResponse.data, catalogues.is);
    const english = parsePublishedRow(englishResponse.data, catalogues.en);
    if (
      !icelandic ||
      !english ||
      String(icelandic.revision_number) !== String(english.revision_number) ||
      icelandic.published_at !== english.published_at
    ) {
      return driftedMirror();
    }

    return { status: 'synchronized', revisionNumber: String(icelandic.revision_number) };
  } catch {
    return driftedMirror();
  }
}

function parsePublishedRow(data: unknown, expected: Catalogue): PublishedTranslationRow | null {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return null;
  const row = data[0];
  if (
    !isRevisionNumber(row.revision_number) ||
    typeof row.published_at !== 'string' ||
    Number.isNaN(Date.parse(row.published_at)) ||
    !isExactCatalogue(row.messages, expected)
  ) {
    return null;
  }
  return row as unknown as PublishedTranslationRow;
}

function isExactCatalogue(value: unknown, expected: Catalogue): value is Catalogue {
  if (!isRecord(value)) return false;
  const expectedKeys = Object.keys(expected);
  const receivedKeys = Object.keys(value);
  if (receivedKeys.length !== expectedKeys.length) return false;

  return expectedKeys.every((key) => {
    const message = value[key];
    return (
      typeof message === 'string' &&
      message.length <= maximumMessageLength &&
      message === expected[key as keyof Catalogue]
    );
  });
}

function driftedMirror(): TranslationMirrorResult {
  return { status: 'drifted', revisionNumber: null };
}

function isRevisionNumber(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
