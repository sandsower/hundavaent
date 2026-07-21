import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type TranslationMessages = Record<string, string>;

export interface InterfaceTranslationCatalogues {
  is: TranslationMessages;
  en: TranslationMessages;
}

const catalogueDelimiter = '$hundavaent_interface_catalogues_v1$';
const translationKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const maximumMessageLength = 10_000;

export function renderInterfaceTranslationInventorySql(
  catalogues: InterfaceTranslationCatalogues
): string {
  const keyCount = validateCatalogues(catalogues);
  const payload = JSON.stringify(catalogues);
  if (payload.includes(catalogueDelimiter)) {
    throw new Error('Interface translation messages contain the reserved SQL delimiter');
  }

  return `\\set ON_ERROR_STOP on
\\getenv translation_database_secret TRANSLATION_DATABASE_SECRET
begin;

select public.configure_interface_translation_capability(:'translation_database_secret');

select *
from public.sync_interface_translation_inventory(
  ${catalogueDelimiter}${payload}${catalogueDelimiter}::jsonb,
  :'release_sha'
);

do $hundavaent_verify_interface_publication$
declare
  expected_key_count constant integer := ${keyCount};
  icelandic_revision bigint;
  english_revision bigint;
  icelandic_key_count integer;
  english_key_count integer;
begin
  select revision_number, jsonb_object_length(messages)
  into icelandic_revision, icelandic_key_count
  from public.get_published_interface_translations('is');

  select revision_number, jsonb_object_length(messages)
  into english_revision, english_key_count
  from public.get_published_interface_translations('en');

  if icelandic_revision is null
    or english_revision is null
    or icelandic_revision <> english_revision
    or icelandic_key_count <> expected_key_count
    or english_key_count <> expected_key_count then
    raise exception using
      errcode = 'P0001',
      message = 'Published interface translation inventory verification failed';
  end if;
end;
$hundavaent_verify_interface_publication$;

commit;
`;
}

function validateCatalogues(catalogues: InterfaceTranslationCatalogues): number {
  if (
    !isRecord(catalogues) ||
    Object.keys(catalogues).sort().join(',') !== 'en,is' ||
    !isRecord(catalogues.is) ||
    !isRecord(catalogues.en)
  ) {
    throw new Error('Interface translation inventory must contain exactly is and en catalogues');
  }

  const icelandicKeys = Object.keys(catalogues.is).sort();
  const englishKeys = Object.keys(catalogues.en).sort();
  if (
    icelandicKeys.length === 0 ||
    icelandicKeys.length !== englishKeys.length ||
    icelandicKeys.some((key, index) => key !== englishKeys[index])
  ) {
    throw new Error('Interface translation locales must contain the same keys');
  }

  for (const key of icelandicKeys) {
    if (!translationKeyPattern.test(key)) {
      throw new Error(`Interface translation inventory contains an invalid key: ${key}`);
    }
    const icelandic = catalogues.is[key];
    const english = catalogues.en[key];
    if (
      typeof icelandic !== 'string' ||
      !icelandic.trim() ||
      icelandic.length > maximumMessageLength ||
      typeof english !== 'string' ||
      !english.trim() ||
      english.length > maximumMessageLength
    ) {
      throw new Error(
        `Interface translation value must be non-empty and at most 10,000 characters: ${key}`
      );
    }
    if (!samePlaceholders(icelandic, english)) {
      throw new Error(`Interface translation locales must use the same placeholders: ${key}`);
    }
  }

  return icelandicKeys.length;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readCatalogue(path: string): Promise<TranslationMessages> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Interface translation catalogue must be an object: ${path}`);
  }
  return value as TranslationMessages;
}

async function main(): Promise<void> {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('Usage: sync-interface-translation-inventory.ts <output-sql-path>');
  }

  const catalogues = {
    is: await readCatalogue('src/lib/i18n/messages/is.json'),
    en: await readCatalogue('src/lib/i18n/messages/en.json')
  };
  await writeFile(outputPath, renderInterfaceTranslationInventorySql(catalogues), {
    encoding: 'utf8',
    mode: 0o600
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
