import { describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../../../src/routes/api/check-ins/[placeId]/+server';

const placeId = '30000000-0000-4000-8000-000000000003';
const commandId = 'a1000000-0000-4000-8000-000000000001';

function expectPrivate(response: Response, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toContain('cookie');
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/check-ins', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': commandId },
    body: JSON.stringify(body)
  });
}

const successRow = {
  check_in_id: 'a0000000-0000-4000-8000-000000000001',
  place_id: placeId,
  proximity_confirmed: 'unknown',
  checked_in_at: '2026-07-12T10:00:00Z',
  already_checked_in: false,
  qualifying_action_recorded: true,
  activated_current_week: true,
  current_week_starts_on: '2026-07-06',
  current_week_ends_on: '2026-07-12',
  current_week_active: true
};

function signedInClient(rpcResult: unknown = { data: [successRow], error: null }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
    rpc: vi.fn(async () => rpcResult)
  };
}

describe('Check-in API request boundary', () => {
  it('keeps a cached pre-deploy client working with a server-generated command id', async () => {
    const client = signedInClient();
    const response = await POST({
      locals: { supabase: client },
      params: { placeId },
      request: new Request('http://localhost/api/check-ins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proximityDecision: 'unknown' })
      })
    } as never);
    expectPrivate(response, 200);
    expect(client.rpc).toHaveBeenCalledWith('record_check_in', {
      requested_place_id: placeId,
      requested_proximity_status: 'unknown',
      command_request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    });
  });

  it('rejects a supplied malformed idempotency key', async () => {
    const client = signedInClient();
    const response = await POST({
      locals: { supabase: client },
      params: { placeId },
      request: new Request('http://localhost/api/check-ins', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'not-a-uuid' },
        body: JSON.stringify({ proximityDecision: 'unknown' })
      })
    } as never);
    expectPrivate(response, 400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('accepts exactly the tri-state decision body and nothing else', async () => {
    const client = signedInClient();
    expectPrivate(
      await POST({
        locals: { supabase: client },
        params: { placeId },
        request: jsonRequest({ proximityDecision: 'unknown' })
      } as never),
      200
    );
    expect(client.rpc).toHaveBeenCalledWith('record_check_in', {
      requested_place_id: placeId,
      requested_proximity_status: 'unknown',
      command_request_id: commandId
    });
  });

  it('rejects a body carrying coordinate-shaped fields alongside the decision', async () => {
    const client = signedInClient();
    expectPrivate(
      await POST({
        locals: { supabase: client },
        params: { placeId },
        request: jsonRequest({
          proximityDecision: 'confirmed',
          latitude: 64.1423,
          longitude: -21.9555
        })
      } as never),
      400
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rejects unknown-key, malformed, empty, and wrong-valued bodies', async () => {
    const client = signedInClient();
    const badBodies = [
      { proximityDecision: 'confirmed', accuracy: 12 },
      { decision: 'confirmed' },
      {},
      { proximityDecision: 'somewhere-near' },
      'confirmed',
      null
    ];
    for (const body of badBodies) {
      expectPrivate(
        await POST({
          locals: { supabase: client },
          params: { placeId },
          request: jsonRequest(body)
        } as never),
        400
      );
    }
    expectPrivate(
      await POST({
        locals: { supabase: client },
        params: { placeId },
        request: new Request('http://localhost/api/check-ins', { method: 'POST', body: '{' })
      } as never),
      400
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('applies private headers and stable statuses to the auth and failure paths', async () => {
    expectPrivate(
      await POST({
        locals: { supabase: null },
        params: { placeId: 'not-a-place' },
        request: jsonRequest({ proximityDecision: 'unknown' })
      } as never),
      400
    );
    expectPrivate(
      await POST({
        locals: { supabase: null },
        params: { placeId },
        request: jsonRequest({ proximityDecision: 'unknown' })
      } as never),
      503
    );

    const signedOut = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      rpc: vi.fn()
    };
    expectPrivate(
      await POST({
        locals: { supabase: signedOut },
        params: { placeId },
        request: jsonRequest({ proximityDecision: 'unknown' })
      } as never),
      401
    );

    const placeUnavailable = signedInClient({
      data: null,
      error: { code: '22023', message: 'Published Place required' }
    });
    const unavailableResponse = await POST({
      locals: { supabase: placeUnavailable },
      params: { placeId },
      request: jsonRequest({ proximityDecision: 'unknown' })
    } as never);
    expectPrivate(unavailableResponse, 409);
    expect(((await unavailableResponse.json()) as { error: string }).error).toBe(
      'place_unavailable'
    );
  });

  it('returns the caller-private current status through GET', async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null })) },
      rpc: vi.fn(async () => ({
        data: [
          {
            has_recent_check_in: true,
            checked_in_at: '2026-07-12T09:00:00Z',
            proximity_confirmed: 'unknown'
          }
        ],
        error: null
      }))
    };
    const response = await GET({ locals: { supabase: client }, params: { placeId } } as never);
    expectPrivate(response, 200);
    expect(await response.json()).toEqual({
      hasRecentCheckIn: true,
      checkedInAt: '2026-07-12T09:00:00Z',
      proximityConfirmed: 'unknown'
    });
  });
});
