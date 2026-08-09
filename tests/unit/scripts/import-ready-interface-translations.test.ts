import { describe, expect, it } from 'vitest';

import {
  extractProductionSupabaseConfig,
  planReadySourceImport,
  type ReadySourceCandidate
} from '../../../scripts/import-ready-interface-translations';

const base = {
  is: { alpha: 'Upprunalegt', welcome: 'Velkomin {name}' },
  en: { alpha: 'Original', welcome: 'Welcome {name}' }
};

const source = {
  is: { ...base.is, 'source.only': 'Nýr texti' },
  en: { ...base.en, 'source.only': 'New copy' }
};

function candidate(overrides: Partial<ReadySourceCandidate> = {}): ReadySourceCandidate {
  return {
    candidateRevision: 34,
    basedOnRevision: 33,
    readyAt: '2026-08-07T10:00:00Z',
    status: 'ready',
    baseCatalogues: base,
    candidateCatalogues: {
      is: { alpha: 'Yfirfarið', welcome: 'Velkomin {name}' },
      en: { alpha: 'Reviewed', welcome: 'Welcome {name}' }
    },
    ...overrides
  };
}

describe('ready interface translation import', () => {
  it('applies candidate changes while preserving source-only keys', () => {
    expect(planReadySourceImport(source, candidate())).toEqual({
      candidateRevision: 34,
      basedOnRevision: 33,
      catalogues: {
        is: { alpha: 'Yfirfarið', welcome: 'Velkomin {name}', 'source.only': 'Nýr texti' },
        en: { alpha: 'Reviewed', welcome: 'Welcome {name}', 'source.only': 'New copy' }
      },
      changedKeys: { is: ['alpha'], en: ['alpha'] }
    });
  });

  it('performs a three-way merge for independent JSON and workspace changes', () => {
    const locallyChanged = {
      is: { ...source.is, welcome: 'Velkomin aftur {name}' },
      en: { ...source.en, welcome: 'Welcome back {name}' }
    };

    const plan = planReadySourceImport(locallyChanged, candidate());

    expect(plan.catalogues.is.welcome).toBe('Velkomin aftur {name}');
    expect(plan.catalogues.en.welcome).toBe('Welcome back {name}');
    expect(plan.catalogues.en.alpha).toBe('Reviewed');
  });

  it('rejects an overlapping JSON and candidate edit', () => {
    const locallyChanged = {
      is: { ...source.is, alpha: 'Önnur breyting' },
      en: { ...source.en, alpha: 'Another change' }
    };

    expect(() => planReadySourceImport(locallyChanged, candidate())).toThrow(
      'conflicts with current JSON: alpha'
    );
  });

  it('rejects a candidate whose base and candidate inventories differ', () => {
    expect(() =>
      planReadySourceImport(
        source,
        candidate({
          candidateCatalogues: {
            is: { ...base.is, unexpected: 'Óþekkt' },
            en: { ...base.en, unexpected: 'Unexpected' }
          }
        })
      )
    ).toThrow('same keys as its base');
  });

  it('rejects placeholder changes before planning writes', () => {
    expect(() =>
      planReadySourceImport(
        source,
        candidate({
          candidateCatalogues: {
            is: { ...base.is, welcome: 'Sæl {person}' },
            en: { ...base.en, welcome: 'Hello {person}' }
          }
        })
      )
    ).toThrow('placeholder');
  });

  it('rejects an already applied or superseded candidate', () => {
    expect(() => planReadySourceImport(source, candidate({ status: 'applied' }))).toThrow(
      'already applied'
    );
    expect(() => planReadySourceImport(source, candidate({ status: 'superseded' }))).toThrow(
      'superseded'
    );
  });

  it('extracts the production Supabase configuration', () => {
    const html = `<script>env: {"PUBLIC_SUPABASE_PUBLISHABLE_KEY":"sb_publishable_example","PUBLIC_SUPABASE_URL":"https://example.supabase.co"}</script>`;

    expect(extractProductionSupabaseConfig(html)).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example'
    });
  });
});
