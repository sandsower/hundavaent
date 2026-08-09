import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { APP_RELEASE: 'release-under-test' } }));

import { GET } from '../../../src/routes/api/health/+server';
import { catalogues } from '$i18n';
import type { RequestSupabaseClient } from '$server/db/clients';

function clientWithTranslationResponses(
  responses: Partial<Record<'is' | 'en', { data: unknown; error: unknown }>> = {}
) {
  return {
    rpc: vi.fn(async (functionName: string, args: Record<string, unknown>) => {
      if (functionName === 'list_published_places') return { data: [], error: null };
      const locale = args.requested_locale as 'is' | 'en';
      return (
        responses[locale] ?? {
          data: [
            {
              revision_number: 4,
              published_at: '2026-07-21T21:00:00.000Z',
              messages: catalogues[locale]
            }
          ],
          error: null
        }
      );
    })
  } as unknown as RequestSupabaseClient;
}

async function healthBody(client: RequestSupabaseClient) {
  const response = await GET({
    locals: {
      requestId: 'health-request',
      supabase: client
    }
  } as never);

  return { response, body: await response.json() };
}

describe('translation health', () => {
  it('reports an exact two-locale database mirror as synchronized', async () => {
    const client = clientWithTranslationResponses();

    const { response, body } = await healthBody(client);

    expect(response.status).toBe(200);
    expect(body.release).toBe('release-under-test');
    expect(body.checks.translations).toBe('synchronized');
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'get_published_interface_translations', {
      requested_locale: 'is'
    });
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'get_published_interface_translations', {
      requested_locale: 'en'
    });
  });

  it('reports database mirror drift without changing bundled runtime copy', async () => {
    const client = clientWithTranslationResponses({
      en: {
        data: [
          {
            revision_number: 4,
            published_at: '2026-07-21T21:00:00.000Z',
            messages: { ...catalogues.en, 'site.name': 'Other' }
          }
        ],
        error: null
      }
    });

    const { response, body } = await healthBody(client);

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.translations).toBe('drifted');
  });
});
