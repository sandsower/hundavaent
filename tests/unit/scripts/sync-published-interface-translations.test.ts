import { describe, expect, it } from 'vitest';

import {
  extractProductionSupabaseConfig,
  planPublishedTranslationSync,
  type PublishedTranslationRow
} from '../../../scripts/sync-published-interface-translations';

const source = {
  is: {
    alpha: 'Upprunalegt',
    welcome: 'Velkomin {name}',
    'source.only': 'Nýr texti'
  },
  en: {
    alpha: 'Original',
    welcome: 'Welcome {name}',
    'source.only': 'New copy'
  }
};

function publication(
  locale: 'is' | 'en',
  messages: Record<string, string>,
  overrides: Partial<PublishedTranslationRow> = {}
): PublishedTranslationRow {
  return {
    revision_number: 28,
    published_at: '2026-07-26T22:18:24.630267+00:00',
    messages,
    ...overrides
  };
}

describe('published interface translation synchronization', () => {
  it('applies published values, preserves source-only keys, and records a deterministic baseline', () => {
    const plan = planPublishedTranslationSync(source, {
      is: publication('is', { alpha: 'Birt gildi', welcome: 'Sæl {name}' }),
      en: publication('en', { alpha: 'Published value', welcome: 'Hello {name}' })
    });

    expect(plan.catalogues).toEqual({
      is: { alpha: 'Birt gildi', welcome: 'Sæl {name}', 'source.only': 'Nýr texti' },
      en: { alpha: 'Published value', welcome: 'Hello {name}', 'source.only': 'New copy' }
    });
    expect(plan.changedKeys).toEqual({ is: ['alpha', 'welcome'], en: ['alpha', 'welcome'] });
    expect(plan.sourceOnlyKeys).toEqual(['source.only']);
    expect(plan.baseline).toEqual({
      schema: 1,
      revisionNumber: 28,
      publishedAt: '2026-07-26T22:18:24.630267+00:00',
      keyCount: 2,
      catalogueSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });

    const repeated = planPublishedTranslationSync(source, {
      is: publication('is', { welcome: 'Sæl {name}', alpha: 'Birt gildi' }),
      en: publication('en', { welcome: 'Hello {name}', alpha: 'Published value' })
    });
    expect(repeated.baseline.catalogueSha256).toBe(plan.baseline.catalogueSha256);
  });

  it('rejects locale publications from different revisions', () => {
    expect(() =>
      planPublishedTranslationSync(source, {
        is: publication('is', { alpha: 'Gildi', welcome: 'Sæl {name}' }),
        en: publication('en', { alpha: 'Value', welcome: 'Hello {name}' }, { revision_number: 29 })
      })
    ).toThrow('same revision');
  });

  it('rejects locale publications with different key sets', () => {
    expect(() =>
      planPublishedTranslationSync(source, {
        is: publication('is', { alpha: 'Gildi', welcome: 'Sæl {name}' }),
        en: publication('en', { alpha: 'Value' })
      })
    ).toThrow('same keys');
  });

  it('rejects database keys that do not exist in JSON', () => {
    expect(() =>
      planPublishedTranslationSync(source, {
        is: publication('is', { alpha: 'Gildi', unknown: 'Óþekkt' }),
        en: publication('en', { alpha: 'Value', unknown: 'Unknown' })
      })
    ).toThrow('unknown key');
  });

  it('rejects a database value that changes the JSON placeholder contract', () => {
    expect(() =>
      planPublishedTranslationSync(source, {
        is: publication('is', { welcome: 'Sæl {person}' }),
        en: publication('en', { welcome: 'Hello {person}' })
      })
    ).toThrow('placeholder');
  });

  it.each(['', '   ', 'a'.repeat(10_001)])(
    'rejects an invalid published value before planning writes: %j',
    (value) => {
      expect(() =>
        planPublishedTranslationSync(source, {
          is: publication('is', { alpha: value }),
          en: publication('en', { alpha: value })
        })
      ).toThrow(/non-empty|10,000/);
    }
  );

  it('extracts the public Supabase configuration embedded by the production application', () => {
    const html = `<script>env: {"PUBLIC_SUPABASE_PUBLISHABLE_KEY":"sb_publishable_example","PUBLIC_SUPABASE_URL":"https://example.supabase.co"}</script>`;

    expect(extractProductionSupabaseConfig(html)).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example'
    });
  });

  it('rejects non-HTTPS production Supabase configuration', () => {
    const html = `<script>env: {"PUBLIC_SUPABASE_PUBLISHABLE_KEY":"sb_publishable_example","PUBLIC_SUPABASE_URL":"http://127.0.0.1:54321"}</script>`;

    expect(() => extractProductionSupabaseConfig(html)).toThrow('HTTPS');
  });
});
