import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type TranslationMessages = Record<string, string>;

export interface InterfaceTranslationCatalogues {
  is: TranslationMessages;
  en: TranslationMessages;
}

const catalogueDelimiter = '$hundavaent_interface_catalogues_v1$';

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
    const icelandic = catalogues.is[key];
    const english = catalogues.en[key];
    if (
      typeof icelandic !== 'string' ||
      !icelandic.trim() ||
      typeof english !== 'string' ||
      !english.trim()
    ) {
      throw new Error(`Interface translation value must be non-empty: ${key}`);
    }
  }

  return icelandicKeys.length;
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
