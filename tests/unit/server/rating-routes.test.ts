import { describe, expect, it, vi } from 'vitest';

import { GET, PUT } from '../../../src/routes/api/ratings/[placeId]/+server';

const placeId = '30000000-0000-4000-8000-000000000003';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/ratings/place', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function memberClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      if (name === 'apply_pending_member_rating')
        return { data: [{ applied: false, overall_score: null }], error: null };
      if (name === 'get_my_dog_friendliness_rating') return { data: [], error: null };
      if (name === 'save_inline_dog_friendliness_rating') {
        return {
          data: [
            {
              id: 'rating-1',
              place_id: placeId,
              overall_score: 4,
              welcome_score: null,
              clarity_score: null,
              comfort_score: null,
              thoughtfulness_score: null,
              rated_at: '2026-07-15T00:00:00Z',
              excluded: false,
              private_note: null,
              private_note_classification: null,
              private_note_updated_at: null,
              linked_report_id: null
            }
          ],
          error: null
        };
      }
      return { data: null, error: { code: 'unexpected' } };
    })
  };
}

describe('private inline Rating API', () => {
  it('applies a pending Rating before returning the current private state', async () => {
    const client = memberClient();
    const response = await GET({
      cookies: {},
      locals: { supabase: client },
      params: { placeId }
    } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_current_member_account',
      'apply_pending_member_rating',
      'get_my_dog_friendliness_rating'
    ]);
  });

  it('rejects malformed overall input without invoking the Rating RPC', async () => {
    const client = memberClient();
    const response = await PUT({
      cookies: {},
      locals: { supabase: client, requestId: crypto.randomUUID() },
      params: { placeId },
      request: jsonRequest({
        overall: 6,
        welcome: null,
        clarity: null,
        comfort: null,
        thoughtfulness: null,
        noteUpdate: false,
        privateNote: null
      })
    } as never);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('autosaves an explicit overall while optional categories remain null', async () => {
    const client = memberClient();
    const response = await PUT({
      cookies: {},
      locals: { supabase: client, requestId: crypto.randomUUID() },
      params: { placeId },
      request: jsonRequest({
        overall: 4,
        welcome: null,
        clarity: null,
        comfort: null,
        thoughtfulness: null,
        noteUpdate: false,
        privateNote: null
      })
    } as never);
    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenLastCalledWith(
      'save_inline_dog_friendliness_rating',
      expect.objectContaining({
        requested_overall_score: 4,
        requested_welcome_score: null
      })
    );
    const payload = (await response.json()) as { rating: Record<string, unknown> };
    expect(payload.rating).not.toHaveProperty('excluded');
    expect(payload.rating).not.toHaveProperty('privateNoteClassification');
    expect(payload.rating).not.toHaveProperty('linkedReportId');
  });

  it('returns a genuine command conflict as 409', async () => {
    const client = memberClient();
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_current_member_account')
        return { data: [{ member_id: 'member' }], error: null };
      if (name === 'save_inline_dog_friendliness_rating')
        return { data: null, error: { code: '55006' } };
      return { data: null, error: { code: 'unexpected' } };
    });

    const response = await PUT({
      cookies: {},
      locals: { supabase: client, requestId: crypto.randomUUID() },
      params: { placeId },
      request: jsonRequest({
        overall: 4,
        welcome: null,
        clarity: null,
        comfort: null,
        thoughtfulness: null,
        noteUpdate: false,
        privateNote: null
      })
    } as never);

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
