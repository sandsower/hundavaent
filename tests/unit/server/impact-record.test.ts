import { describe, expect, it, vi } from 'vitest';

import { getMyImpactRecord, type ImpactRpcClient } from '$server/impact/impact-record';

const outcome = {
  contribution_id: '94800000-0000-4000-8000-000000000401',
  kind: 'accepted_suggestion',
  state: 'confirmed',
  confirmed_at: '2026-07-24T10:00:00Z',
  revoked_at: null,
  subject_place_id: '94800000-0000-4000-8000-000000000201',
  place_name: 'Kaffihúsið',
  availability: 'available',
  successor_place_id: null,
  successor_name: null,
  successor_available: false,
  suggestion_id: '94800000-0000-4000-8000-000000000301',
  place_flag_id: null
};

const record = {
  member_since: '2026-01-02T12:00:00Z',
  active_weeks: 8,
  active_months: 3,
  credited_places: 14,
  credited_category_groups: 5,
  credited_municipalities: 4,
  valid_ratings: 7,
  submissions_total: 6,
  pending_submissions: 1,
  rejected_submissions: 1,
  resolved_without_contribution: 2,
  confirmed_contributions: 3,
  revoked_contributions: 1,
  recent_outcomes: [outcome]
};

describe('private impact record RPC adapter', () => {
  it('maps the exact caller-owned impact projection and localized outcomes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [record], error: null });

    await expect(getMyImpactRecord({ rpc } satisfies ImpactRpcClient, 'is')).resolves.toEqual({
      status: 'success',
      value: {
        memberSince: '2026-01-02T12:00:00Z',
        activeWeeks: 8,
        activeMonths: 3,
        creditedPlaces: 14,
        creditedCategoryGroups: 5,
        creditedMunicipalities: 4,
        validRatings: 7,
        submissionsTotal: 6,
        pendingSubmissions: 1,
        rejectedSubmissions: 1,
        resolvedWithoutContribution: 2,
        confirmedContributions: 3,
        revokedContributions: 1,
        recentOutcomes: [
          {
            contributionId: '94800000-0000-4000-8000-000000000401',
            kind: 'accepted_suggestion',
            state: 'confirmed',
            confirmedAt: '2026-07-24T10:00:00Z',
            revokedAt: null,
            subjectPlaceId: '94800000-0000-4000-8000-000000000201',
            placeName: 'Kaffihúsið',
            availability: 'available',
            successorPlaceId: null,
            successorName: null,
            successorAvailable: false,
            suggestionId: '94800000-0000-4000-8000-000000000301',
            placeFlagId: null
          }
        ]
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_impact_record', { requested_locale: 'is' });
  });

  it.each([
    ['a non-array response', { data: record, error: null }],
    ['more than one record', { data: [record, record], error: null }],
    ['an unexpected field', { data: [{ ...record, score: 99 }], error: null }],
    ['a negative count', { data: [{ ...record, valid_ratings: -1 }], error: null }],
    ['a fractional count', { data: [{ ...record, active_weeks: 2.5 }], error: null }],
    [
      'too many outcomes',
      { data: [{ ...record, recent_outcomes: Array(7).fill(outcome) }], error: null }
    ],
    [
      'a malformed outcome lifecycle',
      {
        data: [
          {
            ...record,
            recent_outcomes: [
              { ...outcome, state: 'confirmed', revoked_at: '2026-07-24T11:00:00Z' }
            ]
          }
        ],
        error: null
      }
    ],
    [
      'an invalid successor relationship',
      {
        data: [
          {
            ...record,
            recent_outcomes: [
              { ...outcome, successor_place_id: null, successor_name: 'Nýr staður' }
            ]
          }
        ],
        error: null
      }
    ],
    [
      'an accepted Suggestion without its source',
      {
        data: [{ ...record, recent_outcomes: [{ ...outcome, suggestion_id: null }] }],
        error: null
      }
    ],
    [
      'a correction with a Suggestion source',
      {
        data: [{ ...record, recent_outcomes: [{ ...outcome, kind: 'applied_correction' }] }],
        error: null
      }
    ],
    [
      'an available outcome without a subject',
      {
        data: [
          {
            ...record,
            recent_outcomes: [{ ...outcome, subject_place_id: null, place_name: null }]
          }
        ],
        error: null
      }
    ],
    [
      'an empty localized Place name',
      {
        data: [{ ...record, recent_outcomes: [{ ...outcome, place_name: '  ' }] }],
        error: null
      }
    ],
    [
      'a revocation before confirmation',
      {
        data: [
          {
            ...record,
            recent_outcomes: [
              {
                ...outcome,
                state: 'revoked',
                revoked_at: '2026-07-23T10:00:00Z'
              }
            ]
          }
        ],
        error: null
      }
    ]
  ] as const)('fails closed on %s', async (_label, response) => {
    const rpc = vi.fn().mockResolvedValue(response);

    await expect(getMyImpactRecord({ rpc } satisfies ImpactRpcClient, 'en')).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });

  it.each([
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    ['99999', 'infrastructure_error']
  ] as const)('maps database error %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(getMyImpactRecord({ rpc } satisfies ImpactRpcClient, 'en')).resolves.toEqual({
      status
    });
  });

  it('fails safely when the RPC transport throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(getMyImpactRecord({ rpc } satisfies ImpactRpcClient, 'en')).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});
