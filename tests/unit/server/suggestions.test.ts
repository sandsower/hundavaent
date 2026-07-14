import { describe, expect, it, vi } from 'vitest';

import {
  confirmSuggestionContribution,
  getModerationSuggestion,
  listModerationSuggestions,
  listMemberSuggestions,
  listSuggestionPlaceMatchesForPayload,
  resolveSuggestion,
  submitSuggestion,
  type SuggestionRpcClient
} from '$server/suggestions/suggestions';
import type { SuggestionProposal } from '$server/suggestions/suggestion-input';

const proposal = {
  purpose: 'dog_access_destination',
  operator_name: 'Test operator',
  category: 'cafe',
  location: {
    address_line: 'Testgata 1',
    locality: 'Reykjavík',
    postal_code: '101',
    municipality: 'reykjavik',
    latitude: 64.14,
    longitude: -21.94
  },
  translations: {
    is: { name: 'Próf', description: 'Prófun.' },
    en: { name: 'Test', description: 'Testing.' }
  },
  website_url: null,
  phone: null,
  opening_hours: {},
  dog_amenities: [],
  access_condition: {
    access_area: 'outdoors',
    access_area_note: null,
    restraint_condition: 'leash_required',
    restraint_note: null,
    dog_eligibility: { scope: 'all_dogs' },
    availability_window: {},
    permission_requirement: 'standing_permission'
  },
  evidence: {
    kind: 'member_report',
    source_url: 'https://example.invalid',
    source_citation: null,
    source_label: 'Source',
    observed_at: '2026-07-11T09:00:00Z',
    explanation: 'Explicit access statement.',
    source_metadata: {}
  }
} satisfies SuggestionProposal;

describe('Suggestion RPC adapter', () => {
  it('maps identity matches for a Moderator-corrected proposal', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          place_id: 'place-1',
          lifecycle: 'inactive',
          operator_name: 'Corrected operator',
          name_is: 'Leiðréttur staður',
          name_en: 'Corrected Place',
          address_line: 'Leiðrétt gata 48',
          locality: 'Reykjavík',
          same_operator: true,
          exact_location: true
        }
      ],
      error: null
    });

    await expect(
      listSuggestionPlaceMatchesForPayload({ rpc } satisfies SuggestionRpcClient, proposal)
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          placeId: 'place-1',
          lifecycle: 'inactive',
          operatorName: 'Corrected operator',
          nameIs: 'Leiðréttur staður',
          nameEn: 'Corrected Place',
          addressLine: 'Leiðrétt gata 48',
          locality: 'Reykjavík',
          sameOperator: true,
          exactLocation: true
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_suggestion_place_matches_for_payload', {
      requested_proposal: proposal
    });
  });

  it('maps a successful submission without exposing database row names', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          suggestion_id: 'suggestion-1',
          status: 'submitted',
          submitted_at: '2026-07-11T09:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      submitSuggestion({ rpc } satisfies SuggestionRpcClient, proposal, 'request-1')
    ).resolves.toEqual({
      status: 'success',
      value: {
        suggestionId: 'suggestion-1',
        outcome: 'submitted',
        submittedAt: '2026-07-11T09:00:00Z'
      }
    });
  });

  it.each([
    ['55000', 'policy_unavailable'],
    ['55006', 'conflict'],
    ['23505', 'conflict'],
    ['54000', 'rate_limited'],
    ['42501', 'forbidden'],
    ['22023', 'invalid']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(
      submitSuggestion({ rpc } satisfies SuggestionRpcClient, proposal, 'request-1')
    ).resolves.toEqual({ status });
  });

  it('fails safely when the caller-private projection is malformed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ suggestion_id: null }], error: null });

    await expect(listMemberSuggestions({ rpc } satisfies SuggestionRpcClient)).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });

  it('maps the separate post-acceptance Contribution confirmation', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          contribution_id: 'contribution-1',
          confirmed_at: '2026-07-11T12:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      confirmSuggestionContribution(
        { rpc } satisfies SuggestionRpcClient,
        'suggestion-1',
        'request-2'
      )
    ).resolves.toEqual({
      status: 'success',
      value: {
        contributionId: 'contribution-1',
        confirmedAt: '2026-07-11T12:00:00Z'
      }
    });
  });

  it('uses stable bounded cursors for Member history and Moderator queue pages', async () => {
    const memberRow = {
      suggestion_id: 'suggestion-2',
      status: 'submitted',
      name_is: 'Próf',
      name_en: 'Test',
      category: 'cafe',
      locality: 'Reykjavík',
      member_reason_is: null,
      member_reason_en: null,
      candidate_place_id: null,
      duplicate_place_id: null,
      submitted_at: '2026-07-11T09:00:00Z',
      updated_at: '2026-07-11T09:00:00Z'
    };
    const queueRow = {
      suggestion_id: 'suggestion-3',
      member_id: 'member-1',
      status: 'submitted',
      operator_name: 'Operator',
      name_is: 'Próf',
      name_en: 'Test',
      category: 'cafe',
      address_line: 'Testgata 1',
      locality: 'Reykjavík',
      submitted_at: '2026-07-11T09:00:00Z',
      updated_at: '2026-07-11T09:00:00Z',
      queue_rank: 0
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          memberRow,
          { ...memberRow, suggestion_id: 'suggestion-1' },
          { ...memberRow, suggestion_id: 'suggestion-0' }
        ],
        error: null
      })
      .mockResolvedValueOnce({ data: [queueRow], error: null });

    const memberPage = await listMemberSuggestions({ rpc }, null, 2);
    expect(memberPage.status).toBe('success');
    if (memberPage.status === 'success') {
      expect(memberPage.value.items).toHaveLength(2);
      expect(memberPage.value.nextCursor).toEqual({
        submittedAt: memberRow.submitted_at,
        suggestionId: 'suggestion-1'
      });
    }
    await listModerationSuggestions(
      { rpc },
      { queueRank: 0, submittedAt: queueRow.submitted_at, suggestionId: 'suggestion-2' },
      200
    );
    expect(rpc).toHaveBeenLastCalledWith('list_moderation_place_suggestions', {
      cursor_queue_rank: 0,
      cursor_submitted_at: queueRow.submitted_at,
      cursor_suggestion_id: 'suggestion-2',
      requested_limit: 51
    });
  });

  it.each([
    [1, false],
    [2, false],
    [3, true]
  ] as const)(
    'distinguishes pageSize -1/exact/+1 boundaries for %s rows',
    async (rowCount, hasNext) => {
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        suggestion_id: `suggestion-${3 - index}`,
        status: 'submitted',
        name_is: 'Próf',
        name_en: 'Test',
        category: 'cafe',
        locality: 'Reykjavík',
        member_reason_is: null,
        member_reason_en: null,
        candidate_place_id: null,
        duplicate_place_id: null,
        submitted_at: '2026-07-11T09:00:00Z',
        updated_at: '2026-07-11T09:00:00Z'
      }));
      const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

      const result = await listMemberSuggestions({ rpc }, null, 2);

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;
      expect(result.value.items).toHaveLength(Math.min(rowCount, 2));
      expect(Boolean(result.value.nextCursor)).toBe(hasNext);
      expect(rpc).toHaveBeenCalledWith('list_my_place_suggestions', {
        cursor_submitted_at: null,
        cursor_suggestion_id: null,
        requested_limit: 3
      });
    }
  );

  it.each([
    [1, false],
    [2, false],
    [3, true]
  ] as const)(
    'distinguishes Moderator pageSize -1/exact/+1 boundaries for %s rows',
    async (rowCount, hasNext) => {
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        suggestion_id: `suggestion-${3 - index}`,
        member_id: 'member-1',
        status: 'submitted',
        operator_name: 'Operator',
        name_is: 'Próf',
        name_en: 'Test',
        category: 'cafe',
        address_line: 'Testgata 1',
        locality: 'Reykjavík',
        submitted_at: '2026-07-11T09:00:00Z',
        updated_at: '2026-07-11T09:00:00Z',
        queue_rank: 0
      }));
      const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

      const result = await listModerationSuggestions({ rpc }, null, 2);

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;
      expect(result.value.items).toHaveLength(Math.min(rowCount, 2));
      expect(Boolean(result.value.nextCursor)).toBe(hasNext);
      expect(rpc).toHaveBeenCalledWith('list_moderation_place_suggestions', {
        cursor_queue_rank: null,
        cursor_submitted_at: null,
        cursor_suggestion_id: null,
        requested_limit: 3
      });
    }
  );

  it('fetches a review through the dedicated detail RPC only', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(getModerationSuggestion({ rpc }, 'suggestion-1')).resolves.toEqual({
      status: 'success',
      value: null
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('get_moderation_place_suggestion', {
      requested_suggestion_id: 'suggestion-1'
    });
  });

  it('passes corrected proposal and explicit identity decisions atomically', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ candidate_place_id: 'candidate-1' }],
      error: null
    });

    await resolveSuggestion(
      { rpc },
      {
        suggestionId: 'suggestion-1',
        outcome: 'accepted',
        memberReasonIs: 'Samþykkt.',
        memberReasonEn: 'Accepted.',
        privateNote: null,
        candidatePayload: proposal,
        duplicatePlaceId: null,
        operatorIdentityPlaceId: 'inactive-place',
        locationIdentityPlaceId: 'inactive-place',
        confirmUseful: false
      },
      'request-3'
    );

    expect(rpc).toHaveBeenCalledWith(
      'resolve_place_suggestion',
      expect.objectContaining({
        moderator_candidate_payload: proposal,
        requested_operator_identity_place_id: 'inactive-place',
        requested_location_identity_place_id: 'inactive-place'
      })
    );
  });
});
