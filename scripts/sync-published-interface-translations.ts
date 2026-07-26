import { createHash } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export type TranslationMessages = Record<string, string>;

export interface InterfaceTranslationCatalogues {
  is: TranslationMessages;
  en: TranslationMessages;
}

export interface PublishedTranslationRow {
  revision_number: number;
  published_at: string;
  messages: TranslationMessages;
}

export interface ProductionTranslationBaseline {
  schema: 1;
  revisionNumber: number;
  publishedAt: string;
  keyCount: number;
  catalogueSha256: string;
}

export interface PublishedTranslationSyncPlan {
  catalogues: InterfaceTranslationCatalogues;
  baseline: ProductionTranslationBaseline;
  changedKeys: Record<'is' | 'en', string[]>;
  sourceOnlyKeys: string[];
}

interface ProductionSupabaseConfig {
  url: string;
  publishableKey: string;
}

const maximumMessageLength = 10_000;
const defaultProductionUrl = 'https://hundavaent.is/';
const sourcePaths = {
  is: 'src/lib/i18n/messages/is.json',
  en: 'src/lib/i18n/messages/en.json'
} as const;
const baselinePath = 'src/lib/i18n/messages/production-baseline.json';

export function planPublishedTranslationSync(
  source: InterfaceTranslationCatalogues,
  published: Record<'is' | 'en', PublishedTranslationRow>
): PublishedTranslationSyncPlan {
  validateSourceCatalogues(source);
  validatePublicationPair(published);

  const sourceKeys = Object.keys(source.is);
  const publishedKeys = Object.keys(published.is.messages);
  const sourceKeySet = new Set(sourceKeys);
  const unknownKey = publishedKeys.find((key) => !sourceKeySet.has(key));
  if (unknownKey) {
    throw new Error(`Published interface translations contain an unknown key: ${unknownKey}`);
  }

  for (const key of publishedKeys) {
    const valueIs = published.is.messages[key];
    const valueEn = published.en.messages[key];
    validateMessage(key, 'is', valueIs);
    validateMessage(key, 'en', valueEn);
    if (
      !samePlaceholders(valueIs, source.is[key]) ||
      !samePlaceholders(valueEn, source.en[key]) ||
      !samePlaceholders(valueIs, valueEn)
    ) {
      throw new Error(`Published interface translation placeholder contract changed: ${key}`);
    }
  }

  const catalogues = {
    is: mergePublishedValues(source.is, published.is.messages),
    en: mergePublishedValues(source.en, published.en.messages)
  };
  const changedKeys = {
    is: sourceKeys.filter(
      (key) => key in published.is.messages && source.is[key] !== published.is.messages[key]
    ),
    en: sourceKeys.filter(
      (key) => key in published.en.messages && source.en[key] !== published.en.messages[key]
    )
  };

  return {
    catalogues,
    changedKeys,
    sourceOnlyKeys: sourceKeys.filter((key) => !(key in published.is.messages)),
    baseline: {
      schema: 1,
      revisionNumber: published.is.revision_number,
      publishedAt: published.is.published_at,
      keyCount: publishedKeys.length,
      catalogueSha256: hashCatalogues({
        is: published.is.messages,
        en: published.en.messages
      })
    }
  };
}

export function extractProductionSupabaseConfig(html: string): ProductionSupabaseConfig {
  const url = extractEmbeddedEnvironmentValue(html, 'PUBLIC_SUPABASE_URL');
  const publishableKey = extractEmbeddedEnvironmentValue(html, 'PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Production Supabase URL is invalid');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Production Supabase URL must use HTTPS');
  }
  if (!publishableKey.trim()) {
    throw new Error('Production Supabase publishable key is missing');
  }
  return { url: parsedUrl.toString().replace(/\/$/, ''), publishableKey };
}

function validateSourceCatalogues(source: InterfaceTranslationCatalogues): void {
  if (!isRecord(source) || !isRecord(source.is) || !isRecord(source.en)) {
    throw new Error('JSON interface translation catalogues are invalid');
  }
  const keysIs = Object.keys(source.is);
  const keysEn = Object.keys(source.en);
  if (keysIs.length === 0 || !sameKeys(keysIs, keysEn)) {
    throw new Error('JSON interface translation locales must contain the same keys');
  }
  for (const key of keysIs) {
    validateMessage(key, 'is', source.is[key]);
    validateMessage(key, 'en', source.en[key]);
    if (!samePlaceholders(source.is[key], source.en[key])) {
      throw new Error(`JSON interface translation placeholders differ: ${key}`);
    }
  }
}

function validatePublicationPair(published: Record<'is' | 'en', PublishedTranslationRow>): void {
  for (const locale of ['is', 'en'] as const) {
    const row = published[locale];
    if (
      !isRecord(row) ||
      !Number.isSafeInteger(row.revision_number) ||
      row.revision_number <= 0 ||
      typeof row.published_at !== 'string' ||
      Number.isNaN(Date.parse(row.published_at)) ||
      !isRecord(row.messages)
    ) {
      throw new Error(`Published ${locale} interface translation response is invalid`);
    }
  }
  if (
    published.is.revision_number !== published.en.revision_number ||
    published.is.published_at !== published.en.published_at
  ) {
    throw new Error('Published interface translation locales must use the same revision');
  }
  if (!sameKeys(Object.keys(published.is.messages), Object.keys(published.en.messages))) {
    throw new Error('Published interface translation locales must contain the same keys');
  }
}

function validateMessage(
  key: string,
  locale: 'is' | 'en',
  value: unknown
): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Published ${locale} interface translation must be non-empty: ${key}`);
  }
  if (value.length > maximumMessageLength) {
    throw new Error(`Published ${locale} interface translation exceeds 10,000 characters: ${key}`);
  }
}

function mergePublishedValues(
  source: TranslationMessages,
  published: TranslationMessages
): TranslationMessages {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, published[key] ?? value])
  );
}

function sameKeys(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((key, index) => key === sortedRight[index])
  );
}

function samePlaceholders(left: string, right: string): boolean {
  const leftPlaceholders = placeholders(left);
  const rightPlaceholders = placeholders(right);
  return (
    leftPlaceholders.length === rightPlaceholders.length &&
    leftPlaceholders.every((placeholder, index) => placeholder === rightPlaceholders[index])
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(([placeholder]) => placeholder).sort();
}

function hashCatalogues(catalogues: InterfaceTranslationCatalogues): string {
  const canonical = {
    en: sortRecord(catalogues.en),
    is: sortRecord(catalogues.is)
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function compareKeys([left]: [string, string], [right]: [string, string]): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortRecord(record: TranslationMessages): TranslationMessages {
  return Object.fromEntries(Object.entries(record).sort(compareKeys));
}

function extractEmbeddedEnvironmentValue(html: string, name: string): string {
  const match = html.match(new RegExp(`"${name}":("(?:\\\\.|[^"\\\\])*")`));
  if (!match) throw new Error(`Production application does not expose ${name}`);
  const value: unknown = JSON.parse(match[1]);
  if (typeof value !== 'string') throw new Error(`Production application has invalid ${name}`);
  return value;
}

async function readCatalogue(path: string): Promise<TranslationMessages> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(value))
    throw new Error(`Interface translation catalogue must be an object: ${path}`);
  return value as TranslationMessages;
}

async function fetchPublishedRow(
  config: ProductionSupabaseConfig,
  locale: 'is' | 'en',
  fetchImplementation: typeof fetch = fetch
): Promise<PublishedTranslationRow> {
  const response = await fetchImplementation(
    `${config.url}/rest/v1/rpc/get_published_interface_translations`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: config.publishableKey,
        authorization: `Bearer ${config.publishableKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ requested_locale: locale })
    }
  );
  if (!response.ok) {
    throw new Error(
      `Could not fetch published ${locale} interface translations: HTTP ${response.status}`
    );
  }
  const value: unknown = await response.json();
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error(`Published ${locale} interface translation response must contain one row`);
  }
  return value[0] as unknown as PublishedTranslationRow;
}

async function writeSyncPlan(plan: PublishedTranslationSyncPlan): Promise<void> {
  const outputs = [
    { path: sourcePaths.is, content: `${JSON.stringify(plan.catalogues.is, null, 2)}\n` },
    { path: sourcePaths.en, content: `${JSON.stringify(plan.catalogues.en, null, 2)}\n` },
    { path: baselinePath, content: `${JSON.stringify(plan.baseline, null, 2)}\n` }
  ];
  const originals = await Promise.all(
    outputs.map(async ({ path }) => {
      try {
        return await readFile(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    })
  );
  const token = `${process.pid}-${Date.now()}`;
  const temporaryPaths = outputs.map(({ path }) => `${path}.tmp-${token}`);
  let replaced = 0;

  try {
    await Promise.all(
      outputs.map(({ content }, index) => writeFile(temporaryPaths[index], content, 'utf8'))
    );
    for (let index = 0; index < outputs.length; index += 1) {
      await rename(temporaryPaths[index], outputs[index].path);
      replaced = index + 1;
    }
  } catch (error) {
    for (let index = 0; index < replaced; index += 1) {
      const original = originals[index];
      if (original === null) await rm(outputs[index].path, { force: true });
      else await writeFile(outputs[index].path, original, 'utf8');
    }
    throw error;
  } finally {
    await Promise.all(temporaryPaths.map((path) => rm(path, { force: true })));
  }
}

async function main(): Promise<void> {
  const productionUrl = new URL(
    process.env.HUNDAVAENT_PRODUCTION_URL?.trim() || defaultProductionUrl
  );
  if (productionUrl.protocol !== 'https:') {
    throw new Error('HUNDAVAENT_PRODUCTION_URL must use HTTPS');
  }
  const applicationResponse = await fetch(productionUrl);
  if (!applicationResponse.ok) {
    throw new Error(
      `Could not load the production application: HTTP ${applicationResponse.status}`
    );
  }
  const config = extractProductionSupabaseConfig(await applicationResponse.text());
  const [sourceIs, sourceEn, publishedIs, publishedEn] = await Promise.all([
    readCatalogue(sourcePaths.is),
    readCatalogue(sourcePaths.en),
    fetchPublishedRow(config, 'is'),
    fetchPublishedRow(config, 'en')
  ]);
  const plan = planPublishedTranslationSync(
    { is: sourceIs, en: sourceEn },
    { is: publishedIs, en: publishedEn }
  );
  await writeSyncPlan(plan);

  console.log(
    `Synchronized production interface translation revision ${plan.baseline.revisionNumber}.`
  );
  console.log(`Published keys: ${plan.baseline.keyCount}.`);
  console.log(`Source-only keys preserved: ${plan.sourceOnlyKeys.length}.`);
  console.log(`Changed Icelandic values: ${plan.changedKeys.is.length}.`);
  console.log(`Changed English values: ${plan.changedKeys.en.length}.`);
  for (const locale of ['is', 'en'] as const) {
    for (const key of plan.changedKeys[locale]) console.log(`${locale}\t${key}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
