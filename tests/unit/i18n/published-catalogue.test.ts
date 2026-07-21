import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import {
  loadPublishedCatalogue,
  type PublishedTranslationClient
} from '$server/translations/published-catalogue';

function clientReturning(data: unknown, error: unknown = null): PublishedTranslationClient {
  return {
    rpc: vi.fn(async () => ({ data, error }))
  };
}

function publishedEnglish(overrides: Partial<(typeof catalogues)['en']> = {}) {
  return {
    revision_number: 17,
    published_at: '2026-07-21T21:00:00.000Z',
    messages: { ...catalogues.en, ...overrides }
  };
}

describe('published interface catalogue loading', () => {
  it('accepts one complete, placeholder-safe publication for the requested locale', async () => {
    const client = clientReturning([
      publishedEnglish({ 'meta.description': 'Published directly from the workspace.' })
    ]);

    const result = await loadPublishedCatalogue(client, 'en');

    expect(result).toEqual({
      copy: {
        ...catalogues.en,
        'meta.description': 'Published directly from the workspace.'
      },
      revisionNumber: '17',
      source: 'published'
    });
    expect(client.rpc).toHaveBeenCalledWith('get_published_interface_translations', {
      requested_locale: 'en'
    });
  });

  it.each([
    ['no Supabase client', null],
    ['an RPC error', clientReturning(null, { message: 'unavailable' })],
    ['no publication', clientReturning([])],
    ['multiple publication rows', clientReturning([publishedEnglish(), publishedEnglish()])],
    [
      'a partial catalogue',
      clientReturning([
        {
          revision_number: 17,
          published_at: '2026-07-21T21:00:00.000Z',
          messages: { 'site.name': 'Hundavænt' }
        }
      ])
    ],
    [
      'an unknown key',
      clientReturning([
        {
          revision_number: 17,
          published_at: '2026-07-21T21:00:00.000Z',
          messages: { ...catalogues.en, 'attacker.injected': 'Unexpected' }
        }
      ])
    ],
    [
      'a non-string value',
      clientReturning([
        {
          revision_number: 17,
          published_at: '2026-07-21T21:00:00.000Z',
          messages: { ...catalogues.en, 'meta.description': 42 }
        }
      ])
    ],
    ['an empty value', clientReturning([publishedEnglish({ 'meta.description': '   ' })])],
    [
      'a changed placeholder contract',
      clientReturning([publishedEnglish({ 'directory.selectPlace': 'Select this place' })])
    ]
  ])('uses the bundled catalogue for %s', async (_label, client) => {
    const result = await loadPublishedCatalogue(client as PublishedTranslationClient | null, 'en');

    expect(result).toEqual({
      copy: catalogues.en,
      revisionNumber: null,
      source: 'bundled'
    });
  });

  it('uses the bundled catalogue when the RPC throws', async () => {
    const client: PublishedTranslationClient = {
      rpc: vi.fn(async () => {
        throw new Error('network failure');
      })
    };

    await expect(loadPublishedCatalogue(client, 'is')).resolves.toEqual({
      copy: catalogues.is,
      revisionNumber: null,
      source: 'bundled'
    });
  });
});
