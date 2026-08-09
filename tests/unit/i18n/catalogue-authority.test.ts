import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import {
  checkPublishedCatalogueMirror,
  loadBundledCatalogue,
  type PublishedTranslationClient
} from '$server/translations/catalogue-authority';

function clientReturning(
  rows: Record<'is' | 'en', unknown>,
  errors: Partial<Record<'is' | 'en', unknown>> = {}
): PublishedTranslationClient {
  return {
    rpc: vi.fn(
      async (
        _functionName: 'get_published_interface_translations',
        { requested_locale }: { requested_locale: 'is' | 'en' }
      ) => ({
        data: rows[requested_locale],
        error: errors[requested_locale] ?? null
      })
    )
  };
}

function published(locale: 'is' | 'en', messages = catalogues[locale]) {
  return [
    {
      revision_number: 17,
      published_at: '2026-07-21T21:00:00.000Z',
      messages
    }
  ];
}

describe('JSON-authoritative interface catalogues', () => {
  it.each(['is', 'en'] as const)('always loads the bundled %s catalogue', (locale) => {
    expect(loadBundledCatalogue(locale)).toEqual({
      copy: catalogues[locale],
      revisionNumber: null,
      source: 'bundled'
    });
  });

  it('reports a database mirror only when both locales exactly match JSON', async () => {
    const client = clientReturning({ is: published('is'), en: published('en') });

    await expect(checkPublishedCatalogueMirror(client)).resolves.toEqual({
      status: 'synchronized',
      revisionNumber: '17'
    });
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an RPC failure', clientReturning({ is: null, en: null }, { en: { message: 'offline' } })],
    [
      'a changed value',
      clientReturning({
        is: published('is'),
        en: published('en', { ...catalogues.en, 'site.name': 'Other' })
      })
    ],
    [
      'unequal revisions',
      clientReturning({ is: published('is'), en: [{ ...published('en')[0], revision_number: 18 }] })
    ],
    [
      'an incomplete locale',
      clientReturning({
        is: published('is'),
        en: published('en', { 'site.name': 'Hundavænt' } as never)
      })
    ]
  ])('reports database drift for %s', async (_label, client) => {
    await expect(checkPublishedCatalogueMirror(client)).resolves.toEqual({
      status: 'drifted',
      revisionNumber: null
    });
  });
});
