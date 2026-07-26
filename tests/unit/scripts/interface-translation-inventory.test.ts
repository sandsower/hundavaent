import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderInterfaceTranslationInventorySql as renderInventorySql } from '../../../scripts/sync-interface-translation-inventory';

const productionBaseline = {
  schema: 1 as const,
  revisionNumber: 28,
  publishedAt: '2026-07-26T22:18:24.630267+00:00',
  keyCount: 1379,
  catalogueSha256: '6a88d8b0b13c3dbb2f93451fba4b8d269799115f9871058c0e1cedb9f6e8f9ff'
};

function renderInterfaceTranslationInventorySql(
  catalogues: Parameters<typeof renderInventorySql>[0]
): string {
  return renderInventorySql(catalogues, productionBaseline);
}

describe('interface translation inventory release SQL', () => {
  it('renders one environment-safe capability configuration, sync, and verification transaction', () => {
    const catalogues = {
      is: { 'site.name': 'Hundavænt', welcome: 'Velkomin {name}' },
      en: { 'site.name': 'Hundavænt', welcome: 'Welcome {name}' }
    };

    const sql = renderInterfaceTranslationInventorySql(catalogues);

    expect(sql).toContain('\\getenv translation_database_secret TRANSLATION_DATABASE_SECRET');
    expect(sql).toContain(
      "public.configure_interface_translation_capability(:'translation_database_secret')"
    );
    expect(sql).toContain('public.sync_interface_translation_inventory_from_source(');
    expect(sql).toContain('\n  28,\n');
    expect(sql).toContain(":'release_sha'");
    expect(sql).toContain('public.get_published_interface_translations');
    expect(sql).toContain('expected_key_count constant integer := 2;');
    expect(sql).toContain('(select count(*)::integer from pg_catalog.jsonb_object_keys(messages))');
    expect(sql).toContain("icelandic_messages is distinct from expected_catalogues -> 'is'");
    expect(sql).toContain("english_messages is distinct from expected_catalogues -> 'en'");
    expect(sql).not.toContain('jsonb_object_length');

    const payload = sql.match(
      /\$hundavaent_interface_catalogues_v1\$(.*?)\$hundavaent_interface_catalogues_v1\$::jsonb/s
    )?.[1];
    expect(payload).toBeDefined();
    expect(JSON.parse(payload ?? '')).toEqual(catalogues);
    expect(sql).not.toContain('translation-database-secret-value');
  });

  it('accepts the checked-in production synchronization baseline', () => {
    const baseline = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../../src/lib/i18n/messages/production-baseline.json'),
        'utf8'
      )
    );

    expect(() =>
      renderInventorySql(
        {
          is: { 'site.name': 'Hundavænt' },
          en: { 'site.name': 'Hundavænt' }
        },
        baseline
      )
    ).not.toThrow();
  });

  it('rejects an invalid production synchronization baseline', () => {
    expect(() =>
      renderInventorySql(
        {
          is: { 'site.name': 'Hundavænt' },
          en: { 'site.name': 'Hundavænt' }
        },
        { ...productionBaseline, revisionNumber: 0 }
      )
    ).toThrow('baseline');
  });

  it('rejects unequal locale inventories before producing deployment SQL', () => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { 'site.name': 'Hundavænt' },
        en: { 'site.name': 'Hundavænt', unexpected: 'Unexpected' }
      })
    ).toThrow('same keys');
  });

  it('requires exactly the Icelandic and English locale catalogues', () => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { welcome: 'Velkomin' },
        en: { welcome: 'Welcome' },
        fr: { welcome: 'Bienvenue' }
      } as never)
    ).toThrow('exactly is and en');
  });

  it.each(['.invalid', 'invalid key', 'a'.repeat(161)])(
    'rejects a key outside the database contract: %s',
    (key) => {
      expect(() =>
        renderInterfaceTranslationInventorySql({
          is: { [key]: 'Gildi' },
          en: { [key]: 'Value' }
        })
      ).toThrow('invalid key');
    }
  );

  it('rejects values longer than the database contract', () => {
    const oversized = 'a'.repeat(10_001);
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { welcome: oversized },
        en: { welcome: oversized }
      })
    ).toThrow('10,000');
  });

  it.each(['', '   '])('rejects an empty translation value: %j', (value) => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { welcome: value },
        en: { welcome: value }
      })
    ).toThrow('non-empty');
  });

  it('accepts the maximum SQL key and value boundaries', () => {
    const key = `A${'_'.repeat(159)}`;
    const value = `{name}{name}${'a'.repeat(9_988)}`;

    expect(key).toHaveLength(160);
    expect(value).toHaveLength(10_000);
    expect(() =>
      renderInterfaceTranslationInventorySql({ is: { [key]: value }, en: { [key]: value } })
    ).not.toThrow();
  });

  it('rejects mismatched placeholder multisets between locales', () => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { welcome: 'Velkomin {name} {name}' },
        en: { welcome: 'Welcome {name}' }
      })
    ).toThrow('placeholders');
  });

  it('rejects a catalogue value that could terminate its dollar-quoted payload', () => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { unsafe: '$hundavaent_interface_catalogues_v1$' },
        en: { unsafe: '$hundavaent_interface_catalogues_v1$' }
      })
    ).toThrow('reserved SQL delimiter');
  });

  it('keeps publication compatible with the PostgREST safe-update request guard', () => {
    const migration = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/202607210039_interface_translation_workspace.sql'
      ),
      'utf8'
    );

    expect(migration).not.toMatch(/delete from private\.interface_translation_drafts\s*;/i);
    expect(migration).toMatch(
      /delete from private\.interface_translation_drafts as draft\s+where draft\.key is not null;/i
    );
  });
});
