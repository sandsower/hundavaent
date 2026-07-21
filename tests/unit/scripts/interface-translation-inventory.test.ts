import { describe, expect, it } from 'vitest';

import { renderInterfaceTranslationInventorySql } from '../../../scripts/sync-interface-translation-inventory';

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
    expect(sql).toContain('public.sync_interface_translation_inventory(');
    expect(sql).toContain(":'release_sha'");
    expect(sql).toContain('public.get_published_interface_translations');
    expect(sql).toContain('expected_key_count constant integer := 2;');

    const payload = sql.match(
      /\$hundavaent_interface_catalogues_v1\$(.*)\$hundavaent_interface_catalogues_v1\$::jsonb/s
    )?.[1];
    expect(payload).toBeDefined();
    expect(JSON.parse(payload ?? '')).toEqual(catalogues);
    expect(sql).not.toContain('translation-database-secret-value');
  });

  it('rejects unequal locale inventories before producing deployment SQL', () => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { 'site.name': 'Hundavænt' },
        en: { 'site.name': 'Hundavænt', unexpected: 'Unexpected' }
      })
    ).toThrow('same keys');
  });

  it('rejects a catalogue value that could terminate its dollar-quoted payload', () => {
    expect(() =>
      renderInterfaceTranslationInventorySql({
        is: { unsafe: '$hundavaent_interface_catalogues_v1$' },
        en: { unsafe: '$hundavaent_interface_catalogues_v1$' }
      })
    ).toThrow('reserved SQL delimiter');
  });
});
