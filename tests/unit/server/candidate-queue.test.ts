import { describe, expect, it, vi } from 'vitest';

import {
  listModerationCandidatePlaces,
  type CandidateQueueRpcClient
} from '$server/moderation/candidate-queue';

describe('Moderation Candidate queue RPC adapter', () => {
  it('lists Candidate Places with a bounded page size', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      place_id: `place-${index}`,
      operator_name: `Operator ${index}`,
      category: 'cafe',
      address_line: `Gata ${index}`,
      locality: 'Reykjavík',
      municipality: 'reykjavik',
      created_at: `2026-07-1${index % 9}T09:00:00Z`
    }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

    const result = await listModerationCandidatePlaces(
      { rpc } satisfies CandidateQueueRpcClient,
      null,
      20
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.value.items).toHaveLength(20);
    expect(result.value.nextCursor).toEqual({
      createdAt: rows[19].created_at,
      placeId: rows[19].place_id
    });
    expect(rpc).toHaveBeenCalledWith('list_moderation_candidate_places', {
      cursor_created_at: null,
      cursor_place_id: null,
      requested_limit: 21
    });
  });

  it('maps a Candidate row to the caller shape and forwards a cursor', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          place_id: 'place-1',
          operator_name: 'Vafragata operator',
          category: 'cafe',
          address_line: 'Vafragata 23',
          locality: 'Reykjavík',
          municipality: 'reykjavik',
          created_at: '2026-07-11T09:00:00Z'
        }
      ],
      error: null
    });

    const result = await listModerationCandidatePlaces({ rpc } satisfies CandidateQueueRpcClient, {
      createdAt: '2026-07-10T09:00:00Z',
      placeId: 'place-0'
    });

    expect(result).toEqual({
      status: 'success',
      value: {
        items: [
          {
            placeId: 'place-1',
            operatorName: 'Vafragata operator',
            category: 'cafe',
            addressLine: 'Vafragata 23',
            locality: 'Reykjavík',
            municipality: 'reykjavik',
            createdAt: '2026-07-11T09:00:00Z'
          }
        ],
        nextCursor: null
      }
    });
    expect(rpc).toHaveBeenCalledWith('list_moderation_candidate_places', {
      cursor_created_at: '2026-07-10T09:00:00Z',
      cursor_place_id: 'place-0',
      requested_limit: 21
    });
  });

  it.each([
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    [undefined, 'infrastructure_error']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(
      listModerationCandidatePlaces({ rpc } satisfies CandidateQueueRpcClient)
    ).resolves.toEqual({ status });
  });

  it('returns infrastructure_error for a malformed row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ place_id: 1 }], error: null });

    await expect(
      listModerationCandidatePlaces({ rpc } satisfies CandidateQueueRpcClient)
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('returns infrastructure_error when the adapter throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      listModerationCandidatePlaces({ rpc } satisfies CandidateQueueRpcClient)
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});
