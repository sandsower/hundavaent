import { describe, expect, it, vi } from 'vitest';

import {
  executeModerationSuggestionAction,
  loadModerationSuggestionQueue,
  loadModerationSuggestionReview,
  parseModerationSuggestionQueueCursor
} from '$server/moderation/suggestion-workspace';
import type { ContributorRpcClient } from '$server/contributors/contributor-status';
import type { SuggestionRpcClient } from '$server/suggestions/suggestions';

const queueRow = {
  suggestion_id: '30000000-0000-4000-8000-000000000001',
  member_id: 'member-none',
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

const detailRow = {
  ...queueRow,
  proposal: { purpose: 'dog_access_destination' },
  reviewed_proposal: null,
  private_note: null,
  contribution_id: 'contribution-1',
  operator_identity_place_id: null,
  location_identity_place_id: null
};

const matchRow = {
  place_id: '40000000-0000-4000-8000-000000000001',
  lifecycle: 'published',
  operator_name: 'Existing operator',
  name_is: 'Núverandi staður',
  name_en: 'Existing Place',
  address_line: 'Testgata 1',
  locality: 'Reykjavík',
  same_operator: true,
  exact_location: true
};

const contributorStatusRow = {
  status: 'trusted_contributor',
  policy_version: 'v1',
  net_accepted_total: 12,
  net_accepted_in_window: 8,
  distinct_subjects_in_window: 7,
  distinct_months_in_window: 4,
  revoked_in_window: 0,
  has_active_flag: false,
  first_net_accepted_at: '2026-01-01T00:00:00Z'
};

const evidenceRow = {
  contribution_id: 'contribution-1',
  subject_place_id: '40000000-0000-4000-8000-000000000001',
  confirmed_at: '2026-07-11T12:00:00Z',
  revoked_at: null,
  revoked_reason: null,
  flag_id: null,
  flag_kind: null,
  flag_reason: null,
  flag_recorded_at: null,
  flag_active: null
};

function clients(
  suggestionResponse: (name: string) => { data: unknown; error: { code?: string } | null },
  contributorResponse: (name: string) => { data: unknown; error: { code?: string } | null }
) {
  const suggestionRpc = vi.fn(async (name: string) => suggestionResponse(name));
  const contributorRpc = vi.fn(async (name: string) => contributorResponse(name));

  return {
    suggestionClient: { rpc: suggestionRpc } as SuggestionRpcClient,
    contributorClient: { rpc: contributorRpc } as ContributorRpcClient,
    suggestionRpc,
    contributorRpc
  };
}

function detailClients(
  contributorOverrides: Partial<
    Record<
      'get_moderation_contributor_status' | 'list_moderation_contributor_evidence',
      {
        data: unknown;
        error: { code?: string } | null;
      }
    >
  > = {}
) {
  return clients(
    (name) => {
      if (name === 'get_moderation_place_suggestion') return { data: [detailRow], error: null };
      if (name === 'list_suggestion_place_matches') return { data: [matchRow], error: null };
      throw new Error(`Unexpected Suggestion RPC: ${name}`);
    },
    (name) => {
      if (name === 'get_moderation_contributor_status') {
        return contributorOverrides[name] ?? { data: [contributorStatusRow], error: null };
      }
      if (name === 'list_moderation_contributor_evidence') {
        return contributorOverrides[name] ?? { data: [evidenceRow], error: null };
      }
      throw new Error(`Unexpected Contributor RPC: ${name}`);
    }
  );
}

describe('Suggestions workspace queue assembly', () => {
  it('parses the legacy cursor tuple without changing its existing previous-page semantics', () => {
    expect(
      parseModerationSuggestionQueueCursor(
        new URLSearchParams({
          cursorRank: '1',
          cursorTime: '2026-07-11T09:00:00Z',
          cursorId: queueRow.suggestion_id
        })
      )
    ).toEqual({
      cursor: {
        queueRank: 1,
        submittedAt: '2026-07-11T09:00:00Z',
        suggestionId: queueRow.suggestion_id
      },
      hasPrevious: true
    });

    expect(
      parseModerationSuggestionQueueCursor(
        new URLSearchParams({
          cursorRank: 'not-a-rank',
          cursorTime: '2026-07-11T09:00:00Z',
          cursorId: queueRow.suggestion_id
        })
      )
    ).toEqual({ cursor: null, hasPrevious: true });

    expect(parseModerationSuggestionQueueCursor(new URLSearchParams({ cursorRank: '1' }))).toEqual({
      cursor: null,
      hasPrevious: false
    });
  });

  it('preserves queue rank and day ordering while using trust only inside a day bucket', async () => {
    const rows = [
      {
        ...queueRow,
        suggestion_id: '30000000-0000-4000-8000-000000000004',
        member_id: 'member-next-rank',
        queue_rank: 1,
        submitted_at: '2026-07-09T08:00:00Z'
      },
      {
        ...queueRow,
        suggestion_id: '30000000-0000-4000-8000-000000000003',
        member_id: 'member-trusted',
        submitted_at: '2026-07-11T10:00:00Z'
      },
      {
        ...queueRow,
        suggestion_id: '30000000-0000-4000-8000-000000000002',
        member_id: 'member-old-day',
        submitted_at: '2026-07-10T23:00:00Z'
      },
      queueRow
    ];
    const { suggestionClient, contributorClient, contributorRpc } = clients(
      (name) => {
        if (name === 'list_moderation_place_suggestions') return { data: rows, error: null };
        throw new Error(`Unexpected Suggestion RPC: ${name}`);
      },
      (name) => {
        if (name === 'list_member_contributor_priority') {
          return {
            data: [
              { member_id: 'member-trusted', status: 'trusted_contributor' },
              { member_id: 'member-next-rank', status: 'trusted_contributor' }
            ],
            error: null
          };
        }
        throw new Error(`Unexpected Contributor RPC: ${name}`);
      }
    );

    const result = await loadModerationSuggestionQueue(suggestionClient, contributorClient, {
      cursor: null,
      hasPrevious: false
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(
      result.value.suggestions.map(({ suggestionId, trustTier }) => [suggestionId, trustTier])
    ).toEqual([
      ['30000000-0000-4000-8000-000000000002', 'none'],
      ['30000000-0000-4000-8000-000000000003', 'trusted_contributor'],
      ['30000000-0000-4000-8000-000000000001', 'none'],
      ['30000000-0000-4000-8000-000000000004', 'trusted_contributor']
    ]);
    expect(result.value.nextCursor).toBeNull();
    expect(result.value.hasPrevious).toBe(false);
    expect(contributorRpc).toHaveBeenCalledWith('list_member_contributor_priority', {
      requested_member_ids: ['member-next-rank', 'member-trusted', 'member-old-day', 'member-none']
    });
  });

  it('forwards the active cursor and preserves the adapter next-page cursor', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      ...queueRow,
      suggestion_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      submitted_at: `2026-07-11T09:${String(index).padStart(2, '0')}:00Z`
    }));
    const { suggestionClient, contributorClient, suggestionRpc } = clients(
      () => ({ data: rows, error: null }),
      () => ({ data: [], error: null })
    );
    const cursor = {
      queueRank: 1,
      submittedAt: '2026-07-10T09:00:00Z',
      suggestionId: '30000000-0000-4000-8000-000000000099'
    };

    const result = await loadModerationSuggestionQueue(suggestionClient, contributorClient, {
      cursor,
      hasPrevious: true
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.value.suggestions).toHaveLength(20);
    expect(result.value.nextCursor).toEqual({
      queueRank: 0,
      submittedAt: rows[19].submitted_at,
      suggestionId: rows[19].suggestion_id
    });
    expect(result.value.hasPrevious).toBe(true);
    expect(suggestionRpc).toHaveBeenCalledWith('list_moderation_place_suggestions', {
      cursor_queue_rank: cursor.queueRank,
      cursor_submitted_at: cursor.submittedAt,
      cursor_suggestion_id: cursor.suggestionId,
      requested_limit: 21
    });
  });

  it('keeps the queue usable with neutral trust when priority context fails', async () => {
    const { suggestionClient, contributorClient } = clients(
      () => ({ data: [queueRow], error: null }),
      () => ({ data: null, error: { code: '50000' } })
    );

    await expect(
      loadModerationSuggestionQueue(suggestionClient, contributorClient, {
        cursor: null,
        hasPrevious: false
      })
    ).resolves.toMatchObject({
      status: 'success',
      value: { suggestions: [{ suggestionId: queueRow.suggestion_id, trustTier: 'none' }] }
    });
  });

  it('propagates a mandatory queue failure without requesting contributor context', async () => {
    const { suggestionClient, contributorClient, contributorRpc } = clients(
      () => ({ data: null, error: { code: '42501' } }),
      () => ({ data: [], error: null })
    );

    await expect(
      loadModerationSuggestionQueue(suggestionClient, contributorClient, {
        cursor: null,
        hasPrevious: false
      })
    ).resolves.toEqual({ status: 'forbidden' });
    expect(contributorRpc).not.toHaveBeenCalled();
  });
});

describe('Suggestions workspace review assembly', () => {
  it('loads detail, matches, contributor context, evidence, and current success notices', async () => {
    const { suggestionClient, contributorClient } = detailClients();

    const result = await loadModerationSuggestionReview(
      suggestionClient,
      contributorClient,
      detailRow.suggestion_id,
      new URLSearchParams({
        resolved: 'submitted',
        contribution: 'confirmed',
        flag: 'recorded'
      })
    );

    expect(result).toMatchObject({
      status: 'success',
      value: {
        suggestion: { suggestionId: detailRow.suggestion_id, memberId: detailRow.member_id },
        matches: [
          {
            placeId: matchRow.place_id,
            lifecycle: 'published',
            sameOperator: true,
            exactLocation: true
          }
        ],
        resolved: true,
        contributionConfirmed: true,
        contributor: {
          status: 'trusted_contributor',
          netAcceptedTotal: 12,
          hasActiveFlag: false
        },
        contributorEvidence: [{ contributionId: evidenceRow.contribution_id }],
        contributionRevoked: false,
        conductFlagRecorded: true,
        conductFlagCleared: false
      }
    });
  });

  it('reports a missing detail only after the mandatory match request succeeds', async () => {
    const { suggestionClient, contributorClient, suggestionRpc, contributorRpc } = clients(
      (name) => {
        if (name === 'get_moderation_place_suggestion') return { data: [], error: null };
        if (name === 'list_suggestion_place_matches') return { data: [], error: null };
        throw new Error(`Unexpected Suggestion RPC: ${name}`);
      },
      () => ({ data: [], error: null })
    );

    await expect(
      loadModerationSuggestionReview(
        suggestionClient,
        contributorClient,
        detailRow.suggestion_id,
        new URLSearchParams()
      )
    ).resolves.toEqual({ status: 'not_found' });
    expect(suggestionRpc).toHaveBeenCalledTimes(2);
    expect(contributorRpc).not.toHaveBeenCalled();
  });

  it('propagates a mandatory match failure without requesting contributor context', async () => {
    const { suggestionClient, contributorClient, contributorRpc } = clients(
      (name) => {
        if (name === 'get_moderation_place_suggestion') return { data: [detailRow], error: null };
        if (name === 'list_suggestion_place_matches') {
          return { data: null, error: { code: '50000' } };
        }
        throw new Error(`Unexpected Suggestion RPC: ${name}`);
      },
      () => ({ data: [], error: null })
    );

    await expect(
      loadModerationSuggestionReview(
        suggestionClient,
        contributorClient,
        detailRow.suggestion_id,
        new URLSearchParams()
      )
    ).resolves.toEqual({ status: 'infrastructure_error' });
    expect(contributorRpc).not.toHaveBeenCalled();
  });

  it('keeps evidence when contributor status is unavailable', async () => {
    const { suggestionClient, contributorClient } = detailClients({
      get_moderation_contributor_status: { data: null, error: { code: '50000' } }
    });

    await expect(
      loadModerationSuggestionReview(
        suggestionClient,
        contributorClient,
        detailRow.suggestion_id,
        new URLSearchParams()
      )
    ).resolves.toMatchObject({
      status: 'success',
      value: {
        contributor: null,
        contributorEvidence: [{ contributionId: evidenceRow.contribution_id }]
      }
    });
  });

  it('keeps contributor status when evidence is unavailable', async () => {
    const { suggestionClient, contributorClient } = detailClients({
      list_moderation_contributor_evidence: { data: null, error: { code: '50000' } }
    });

    await expect(
      loadModerationSuggestionReview(
        suggestionClient,
        contributorClient,
        detailRow.suggestion_id,
        new URLSearchParams()
      )
    ).resolves.toMatchObject({
      status: 'success',
      value: {
        contributor: { status: 'trusted_contributor' },
        contributorEvidence: []
      }
    });
  });
});

function actionForm(
  entries: Record<string, string> = {},
  outcome: 'needs_information' | 'accepted' | 'duplicate' | 'rejected' = 'rejected'
): FormData {
  const form = new FormData();
  form.set('outcome', outcome);
  form.set('memberReasonIs', 'Ástæða');
  form.set('memberReasonEn', 'Reason');
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

function acceptedForm(entries: Record<string, string> = {}): FormData {
  return actionForm(
    {
      purpose: 'dog_access_destination',
      operatorName: 'Operator',
      category: 'cafe',
      addressLine: 'Testgata 1',
      locality: 'Reykjavík',
      postalCode: '101',
      municipality: 'Reykjavík',
      latitude: '64.1466',
      longitude: '-21.9426',
      nameIs: 'Próf',
      descriptionIs: 'Lýsing',
      nameEn: 'Test',
      descriptionEn: 'Description',
      accessArea: 'indoors',
      restraintCondition: 'leash_required',
      permissionRequirement: 'standing_permission',
      evidenceKind: 'official_website',
      evidenceSourceLabel: 'Official website',
      evidenceObservedAt: '2026-07-11T09:00',
      evidenceUrl: 'https://example.com/dogs',
      evidenceExplanation: 'Published policy',
      operatorIdentityPlaceId: 'new',
      locationIdentityPlaceId: 'new',
      ...entries
    },
    'accepted'
  );
}

function actionClients(
  responses: Partial<Record<string, { data: unknown; error: { code?: string } | null }>> = {}
) {
  const rpc = vi.fn(async (name: string) => {
    const response = responses[name];
    if (response) return response;
    if (name === 'get_moderation_place_suggestion') return { data: [detailRow], error: null };
    if (name === 'list_suggestion_place_matches_for_payload') return { data: [], error: null };
    if (name === 'resolve_place_suggestion') {
      return { data: [{ candidate_place_id: null }], error: null };
    }
    if (name === 'confirm_suggestion_contribution') {
      return {
        data: [{ contribution_id: 'contribution-1', confirmed_at: '2026-07-11T12:00:00Z' }],
        error: null
      };
    }
    if (name === 'revoke_contribution') {
      return {
        data: [{ contribution_id: 'contribution-1', revoked_at: '2026-07-11T12:00:00Z' }],
        error: null
      };
    }
    if (name === 'record_member_conduct_flag') {
      return { data: [{ flag_id: 'flag-1', recorded_at: '2026-07-11T12:00:00Z' }], error: null };
    }
    if (name === 'clear_member_conduct_flag') {
      return { data: [{ flag_id: 'flag-1', cleared_at: '2026-07-11T12:00:00Z' }], error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  return {
    suggestionClient: { rpc } as SuggestionRpcClient,
    contributorClient: { rpc } as ContributorRpcClient,
    rpc
  };
}

async function executeAction(
  action: Parameters<typeof executeModerationSuggestionAction>[0],
  formData: FormData | null,
  responses: Parameters<typeof actionClients>[0] = {}
) {
  const clients = actionClients(responses);
  const result = await executeModerationSuggestionAction(action, {
    ...clients,
    suggestionId: detailRow.suggestion_id,
    requestId: 'request-1',
    formData
  });
  return { result, ...clients };
}

describe('Suggestions workspace action orchestration', () => {
  it('refreshes matches while preserving edited proposal and moderator notes', async () => {
    const form = acceptedForm({
      memberReasonIs: 'Breytt íslenska',
      memberReasonEn: 'Edited English',
      privateNote: 'Private context'
    });
    const { result, rpc } = await executeAction('refreshMatches', form, {
      list_suggestion_place_matches_for_payload: { data: [matchRow], error: null }
    });

    expect(result).toMatchObject({
      status: 'refreshed',
      data: {
        matchesRefreshed: true,
        refreshedMatches: [{ placeId: matchRow.place_id }],
        refreshedProposal: { operator_name: 'Operator' },
        refreshedOutcome: 'accepted',
        refreshedMemberReasonIs: 'Breytt íslenska',
        refreshedMemberReasonEn: 'Edited English',
        refreshedPrivateNote: 'Private context'
      }
    });
    expect(rpc).toHaveBeenCalledWith(
      'list_suggestion_place_matches_for_payload',
      expect.objectContaining({
        requested_proposal: expect.objectContaining({ operator_name: 'Operator' })
      })
    );
  });

  it.each([
    [{}, 'excluded_purpose'],
    [{ purpose: 'dog_access_destination' }, 'incomplete']
  ])('returns the existing refresh validation error for %j', async (entries, error) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(entries)) form.set(key, value);
    const { result } = await executeAction('refreshMatches', form);

    expect(result).toEqual({ status: 'failure', httpStatus: 400, error });
  });

  it('keeps the refresh-specific forbidden mapping', async () => {
    const { result } = await executeAction('refreshMatches', acceptedForm(), {
      list_suggestion_place_matches_for_payload: { data: null, error: { code: '42501' } }
    });

    expect(result).toEqual({ status: 'failure', httpStatus: 403, error: 'forbidden' });
  });

  it.each(['needs_information', 'accepted', 'duplicate', 'rejected'] as const)(
    'confirms the %s outcome with the normalized resolved effect',
    async (outcome) => {
      const form =
        outcome === 'accepted'
          ? acceptedForm()
          : actionForm(
              outcome === 'duplicate' ? { duplicatePlaceId: matchRow.place_id } : {},
              outcome
            );
      const { result, rpc } = await executeAction('resolve', form);

      expect(result).toEqual({
        status: 'confirmed',
        effect: { kind: 'resolved', value: outcome }
      });
      expect(rpc).toHaveBeenCalledWith(
        'resolve_place_suggestion',
        expect.objectContaining({
          requested_outcome: outcome,
          requested_duplicate_place_id: outcome === 'duplicate' ? matchRow.place_id : null
        })
      );
    }
  );

  it.each([
    [actionForm({}, 'rejected'), 'memberReasonEn', 'incomplete'],
    [actionForm({ outcome: 'submitted' }), null, 'invalid']
  ] as const)(
    'rejects invalid resolution input before any command RPC',
    async (form, remove, error) => {
      if (remove) form.delete(remove);
      const { result, rpc } = await executeAction('resolve', form);

      expect(result).toEqual({ status: 'failure', httpStatus: 400, error });
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it('validates accepted identity choices against refreshed matches', async () => {
    const { result, rpc } = await executeAction(
      'resolve',
      acceptedForm({ operatorIdentityPlaceId: 'unknown-place' })
    );

    expect(result).toEqual({ status: 'failure', httpStatus: 400, error: 'invalid' });
    expect(rpc).not.toHaveBeenCalledWith('resolve_place_suggestion', expect.anything());
  });

  it.each([
    ['55006', 409, 'conflict'],
    ['42501', 403, 'forbidden'],
    ['22023', 400, 'invalid'],
    ['50000', 503, 'unavailable']
  ] as const)('normalizes resolve RPC error %s', async (code, httpStatus, error) => {
    const { result } = await executeAction('resolve', actionForm(), {
      resolve_place_suggestion: { data: null, error: { code } }
    });

    expect(result).toEqual({ status: 'failure', httpStatus, error });
  });

  it.each([
    ['confirmUseful', null, { kind: 'contribution', value: 'confirmed' }],
    [
      'revokeContribution',
      actionForm({ contributionId: 'contribution-1', revokeReason: 'Invalid evidence' }),
      { kind: 'contribution', value: 'revoked' }
    ],
    [
      'recordConductFlag',
      actionForm({ memberId: 'member-1', flagKind: 'fraud', flagReason: 'Fabricated source' }),
      { kind: 'flag', value: 'recorded' }
    ],
    [
      'clearConductFlag',
      actionForm({ flagId: 'flag-1', clearReason: 'Reviewed and cleared' }),
      { kind: 'flag', value: 'cleared' }
    ]
  ] as const)('confirms the %s contributor control', async (action, form, effect) => {
    const { result } = await executeAction(action, form);

    expect(result).toEqual({ status: 'confirmed', effect });
  });

  it.each([
    ['revokeContribution', actionForm({ contributionId: 'contribution-1' })],
    ['recordConductFlag', actionForm({ memberId: 'member-1', flagKind: 'unknown' })],
    ['clearConductFlag', actionForm({ flagId: 'flag-1' })]
  ] as const)('keeps incomplete validation for %s', async (action, form) => {
    const { result, rpc } = await executeAction(action, form);

    expect(result).toEqual({ status: 'failure', httpStatus: 400, error: 'incomplete' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('normalizes contributor-control failures without weakening authorization', async () => {
    const forbidden = await executeAction('confirmUseful', null, {
      confirm_suggestion_contribution: { data: null, error: { code: '42501' } }
    });
    const unavailable = await executeAction(
      'recordConductFlag',
      actionForm({ memberId: 'member-1', flagKind: 'abuse', flagReason: 'Abusive material' }),
      { record_member_conduct_flag: { data: null, error: { code: '50000' } } }
    );

    expect(forbidden.result).toEqual({
      status: 'failure',
      httpStatus: 403,
      error: 'forbidden'
    });
    expect(unavailable.result).toEqual({
      status: 'failure',
      httpStatus: 503,
      error: 'unavailable'
    });
  });
});
