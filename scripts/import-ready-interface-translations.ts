import { createHmac, randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export type TranslationMessages = Record<string, string>;
export interface InterfaceTranslationCatalogues {
  is: TranslationMessages;
  en: TranslationMessages;
}

export interface ReadySourceCandidate {
  candidateRevision: number;
  basedOnRevision: number;
  readyAt: string;
  status: 'ready' | 'applied' | 'superseded';
  baseCatalogues: InterfaceTranslationCatalogues;
  candidateCatalogues: InterfaceTranslationCatalogues;
}

export interface ReadySourceImportPlan {
  candidateRevision: number;
  basedOnRevision: number;
  catalogues: InterfaceTranslationCatalogues;
  changedKeys: Record<'is' | 'en', string[]>;
}

interface ProductionSupabaseConfig {
  url: string;
  publishableKey: string;
}

const maximumMessageLength = 10_000;
const translationKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const defaultProductionUrl = 'https://hundavaent.is/';
const sourcePaths = {
  is: 'src/lib/i18n/messages/is.json',
  en: 'src/lib/i18n/messages/en.json'
} as const;

export function planReadySourceImport(
  source: InterfaceTranslationCatalogues,
  candidate: ReadySourceCandidate
): ReadySourceImportPlan {
  validateCatalogues(source, 'JSON source');
  validateReadyCandidate(candidate);

  const catalogues: InterfaceTranslationCatalogues = {
    is: { ...source.is },
    en: { ...source.en }
  };
  const changedKeys: Record<'is' | 'en', string[]> = { is: [], en: [] };
  const conflicts = new Set<string>();

  for (const locale of ['is', 'en'] as const) {
    for (const key of Object.keys(candidate.baseCatalogues[locale]).sort()) {
      const baseValue = candidate.baseCatalogues[locale][key];
      const candidateValue = candidate.candidateCatalogues[locale][key];
      if (candidateValue === baseValue) continue;

      const sourceValue = source[locale][key];
      if (
        sourceValue !== undefined &&
        sourceValue !== baseValue &&
        sourceValue !== candidateValue
      ) {
        conflicts.add(key);
        continue;
      }
      if (sourceValue === undefined) {
        conflicts.add(key);
        continue;
      }

      catalogues[locale][key] = candidateValue;
      if (sourceValue !== candidateValue) changedKeys[locale].push(key);
    }
  }

  if (conflicts.size > 0) {
    throw new Error(
      `Ready translation candidate conflicts with current JSON: ${[...conflicts].sort().join(', ')}`
    );
  }

  validateCatalogues(catalogues, 'Merged JSON source');
  return {
    candidateRevision: candidate.candidateRevision,
    basedOnRevision: candidate.basedOnRevision,
    catalogues,
    changedKeys
  };
}

function validateReadyCandidate(candidate: ReadySourceCandidate): void {
  if (
    !isRecord(candidate) ||
    !Number.isSafeInteger(candidate.candidateRevision) ||
    candidate.candidateRevision <= 0 ||
    !Number.isSafeInteger(candidate.basedOnRevision) ||
    candidate.basedOnRevision <= 0 ||
    typeof candidate.readyAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.readyAt)) ||
    (candidate.status !== 'ready' &&
      candidate.status !== 'applied' &&
      candidate.status !== 'superseded')
  ) {
    throw new Error('A valid ready translation candidate is required');
  }
  if (candidate.status === 'applied') {
    throw new Error('The ready translation candidate is already applied');
  }
  if (candidate.status === 'superseded') {
    throw new Error('The ready translation candidate was superseded by newer deployed JSON');
  }
  validateCatalogues(candidate.baseCatalogues, 'Candidate base');
  validateCatalogues(candidate.candidateCatalogues, 'Ready candidate');
  for (const locale of ['is', 'en'] as const) {
    if (
      !sameKeys(
        Object.keys(candidate.baseCatalogues[locale]),
        Object.keys(candidate.candidateCatalogues[locale])
      )
    ) {
      throw new Error('Ready translation candidate must contain the same keys as its base');
    }
    for (const key of Object.keys(candidate.baseCatalogues[locale])) {
      if (
        !samePlaceholders(
          candidate.baseCatalogues[locale][key],
          candidate.candidateCatalogues[locale][key]
        )
      ) {
        throw new Error(`Ready translation candidate changed the placeholder contract: ${key}`);
      }
    }
  }
}

function validateCatalogues(
  value: unknown,
  label: string
): asserts value is InterfaceTranslationCatalogues {
  if (!isRecord(value) || !isRecord(value.is) || !isRecord(value.en)) {
    throw new Error(`${label} must contain Icelandic and English catalogues`);
  }
  const keysIs = Object.keys(value.is);
  const keysEn = Object.keys(value.en);
  if (keysIs.length === 0 || !sameKeys(keysIs, keysEn)) {
    throw new Error(`${label} locales must contain the same keys`);
  }
  for (const key of keysIs) {
    if (!translationKeyPattern.test(key))
      throw new Error(`${label} contains an invalid key: ${key}`);
    const icelandic = value.is[key];
    const english = value.en[key];
    validateMessage(icelandic, label, key);
    validateMessage(english, label, key);
    if (!samePlaceholders(icelandic, english)) {
      throw new Error(`${label} locales have different placeholders: ${key}`);
    }
  }
}

function validateMessage(value: unknown, label: string, key: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} contains an empty translation: ${key}`);
  }
  if (value.length > maximumMessageLength) {
    throw new Error(`${label} contains a translation over 10,000 characters: ${key}`);
  }
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
    leftPlaceholders.every((value, index) => value === rightPlaceholders[index])
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(([placeholder]) => placeholder).sort();
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
  if (parsedUrl.protocol !== 'https:') throw new Error('Production Supabase URL must use HTTPS');
  if (!publishableKey.trim()) throw new Error('Production Supabase publishable key is missing');
  return { url: parsedUrl.toString().replace(/\/$/, ''), publishableKey };
}

async function fetchReadyCandidate(
  config: ProductionSupabaseConfig,
  databaseSecret: string,
  fetchImplementation: typeof fetch = fetch
): Promise<ReadySourceCandidate> {
  const requestId = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const canonical = `interface-translations-v3:read_source_candidate:${requestId}:${issuedAt}`;
  const commandProof = createHmac('sha256', databaseSecret).update(canonical).digest('hex');
  const response = await fetchImplementation(
    `${config.url}/rest/v1/rpc/get_ready_interface_translation_source`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: config.publishableKey,
        authorization: `Bearer ${config.publishableKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        command_request_id: requestId,
        command_issued_at: issuedAt,
        command_proof: commandProof
      })
    }
  );
  if (!response.ok)
    throw new Error(`Could not fetch the ready translation candidate: HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error('No ready translation candidate is available');
  return value as unknown as ReadySourceCandidate;
}

async function readCatalogue(path: string): Promise<TranslationMessages> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(value))
    throw new Error(`Interface translation catalogue must be an object: ${path}`);
  return value as TranslationMessages;
}

export async function writeReadySourceImport(plan: ReadySourceImportPlan): Promise<void> {
  const outputs = (['is', 'en'] as const).map((locale) => ({
    path: sourcePaths[locale],
    content: `${JSON.stringify(plan.catalogues[locale], null, 2)}\n`
  }));
  const originals = await Promise.all(outputs.map(({ path }) => readFile(path, 'utf8')));
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
      await writeFile(outputs[index].path, originals[index], 'utf8');
    }
    throw error;
  } finally {
    await Promise.all(temporaryPaths.map((path) => rm(path, { force: true })));
  }
}

function extractEmbeddedEnvironmentValue(html: string, name: string): string {
  const match = html.match(new RegExp(`"${name}":("(?:\\\\.|[^"\\\\])*")`));
  if (!match) throw new Error(`Production application does not expose ${name}`);
  const value: unknown = JSON.parse(match[1]);
  if (typeof value !== 'string') throw new Error(`Production application has invalid ${name}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const databaseSecret = process.env.TRANSLATION_DATABASE_SECRET?.trim();
  if (!databaseSecret) throw new Error('TRANSLATION_DATABASE_SECRET is required');
  const productionUrl = new URL(
    process.env.HUNDAVAENT_PRODUCTION_URL?.trim() || defaultProductionUrl
  );
  if (productionUrl.protocol !== 'https:')
    throw new Error('HUNDAVAENT_PRODUCTION_URL must use HTTPS');

  const applicationResponse = await fetch(productionUrl);
  if (!applicationResponse.ok)
    throw new Error(
      `Could not load the production application: HTTP ${applicationResponse.status}`
    );
  const config = extractProductionSupabaseConfig(await applicationResponse.text());
  const [sourceIs, sourceEn, readyCandidate] = await Promise.all([
    readCatalogue(sourcePaths.is),
    readCatalogue(sourcePaths.en),
    fetchReadyCandidate(config, databaseSecret)
  ]);
  const plan = planReadySourceImport({ is: sourceIs, en: sourceEn }, readyCandidate);
  await writeReadySourceImport(plan);

  console.log(`Imported ready translation candidate ${plan.candidateRevision}.`);
  console.log(`Changed Icelandic values: ${plan.changedKeys.is.length}.`);
  console.log(`Changed English values: ${plan.changedKeys.en.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
