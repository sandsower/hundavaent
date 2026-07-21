import { describe, expect, it, vi } from 'vitest';

import { GET } from '../../../src/routes/api/health/+server';
import { catalogues } from '$i18n';
import type { RequestSupabaseClient } from '$server/db/clients';

function clientWithTranslationResponse(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn(async (functionName: string) => {
      if (functionName === 'list_published_places') return { data: [], error: null };
      return { data, error };
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
  it('reports a complete current publication as published', async () => {
    const client = clientWithTranslationResponse([
      {
        revision_number: 4,
        published_at: '2026-07-21T21:00:00.000Z',
        messages: catalogues.is
      }
    ]);

    const { response, body } = await healthBody(client);

    expect(response.status).toBe(200);
    expect(body.checks.translations).toBe('published');
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'get_published_interface_translations', {
      requested_locale: 'is'
    });
  });

  it('keeps the service healthy while reporting bundled fallback copy', async () => {
    const client = clientWithTranslationResponse(null, { message: 'translations unavailable' });

    const { response, body } = await healthBody(client);

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.translations).toBe('fallback');
  });
});
