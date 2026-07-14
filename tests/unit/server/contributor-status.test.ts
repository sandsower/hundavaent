import { describe, expect, it, vi } from 'vitest';

import {
  clearMemberConductFlag,
  getModerationContributorStatus,
  getMyContributorStatus,
  listMemberContributorPriority,
  listModerationContributorEvidence,
  recalculateMemberContributorStatus,
  recordMemberConductFlag,
  revokeContribution,
  type ContributorRpcClient
} from '$server/contributors/contributor-status';

describe('Contributor status RPC adapter', () => {
  it('maps a Member status without exposing any numeric progress field', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          status: 'trusted_contributor',
          policy_version: 'trust-v1',
          status_since: '2026-05-01T00:00:00Z'
        }
      ],
      error: null
    });

    await expect(getMyContributorStatus({ rpc } satisfies ContributorRpcClient)).resolves.toEqual({
      status: 'success',
      value: {
        status: 'trusted_contributor',
        policyVersion: 'trust-v1',
        statusSince: '2026-05-01T00:00:00Z'
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_contributor_status');
  });

  it('fails safely when the private status projection is malformed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ status: 'not_a_tier' }], error: null });

    await expect(getMyContributorStatus({ rpc } satisfies ContributorRpcClient)).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });

  it.each([
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    ['55006', 'conflict'],
    ['23505', 'conflict'],
    ['99999', 'infrastructure_error']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(getMyContributorStatus({ rpc } satisfies ContributorRpcClient)).resolves.toEqual({
      status
    });
  });

  it('maps the full Moderator detail projection', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          status: 'contributor',
          policy_version: 'trust-v1',
          net_accepted_total: 3,
          net_accepted_in_window: 3,
          distinct_subjects_in_window: 2,
          distinct_months_in_window: 2,
          revoked_in_window: 0,
          has_active_flag: false,
          first_net_accepted_at: '2026-01-01T00:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      getModerationContributorStatus({ rpc } satisfies ContributorRpcClient, 'member-1')
    ).resolves.toEqual({
      status: 'success',
      value: {
        status: 'contributor',
        policyVersion: 'trust-v1',
        netAcceptedTotal: 3,
        netAcceptedInWindow: 3,
        distinctSubjectsInWindow: 2,
        distinctMonthsInWindow: 2,
        revokedInWindow: 0,
        hasActiveFlag: false,
        firstNetAcceptedAt: '2026-01-01T00:00:00Z'
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_moderation_contributor_status', {
      requested_member_id: 'member-1'
    });
  });

  it('maps evidence history rows containing either a Contribution or a conduct flag', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          contribution_id: 'contribution-1',
          subject_place_id: 'place-1',
          confirmed_at: '2026-01-01T00:00:00Z',
          revoked_at: null,
          revoked_reason: null,
          flag_id: null,
          flag_kind: null,
          flag_reason: null,
          flag_recorded_at: null,
          flag_active: null
        },
        {
          contribution_id: null,
          subject_place_id: null,
          confirmed_at: null,
          revoked_at: null,
          revoked_reason: null,
          flag_id: 'flag-1',
          flag_kind: 'fraud',
          flag_reason: 'One serious false report.',
          flag_recorded_at: '2026-02-01T00:00:00Z',
          flag_active: true
        }
      ],
      error: null
    });

    await expect(
      listModerationContributorEvidence({ rpc } satisfies ContributorRpcClient, 'member-1')
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          contributionId: 'contribution-1',
          subjectPlaceId: 'place-1',
          confirmedAt: '2026-01-01T00:00:00Z',
          revokedAt: null,
          revokedReason: null,
          flagId: null,
          flagKind: null,
          flagReason: null,
          flagRecordedAt: null,
          flagActive: null
        },
        {
          contributionId: null,
          subjectPlaceId: null,
          confirmedAt: null,
          revokedAt: null,
          revokedReason: null,
          flagId: 'flag-1',
          flagKind: 'fraud',
          flagReason: 'One serious false report.',
          flagRecordedAt: '2026-02-01T00:00:00Z',
          flagActive: true
        }
      ]
    });
  });

  it('batches the bounded queue-priority signal and skips the round trip for an empty batch', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { member_id: 'member-1', status: 'trusted_contributor' },
        { member_id: 'member-2', status: 'none' }
      ],
      error: null
    });

    await expect(
      listMemberContributorPriority({ rpc } satisfies ContributorRpcClient, [
        'member-1',
        'member-2'
      ])
    ).resolves.toEqual({
      status: 'success',
      value: [
        { memberId: 'member-1', status: 'trusted_contributor' },
        { memberId: 'member-2', status: 'none' }
      ]
    });

    const emptyRpc = vi.fn();
    await expect(
      listMemberContributorPriority({ rpc: emptyRpc } satisfies ContributorRpcClient, [])
    ).resolves.toEqual({ status: 'success', value: [] });
    expect(emptyRpc).not.toHaveBeenCalled();
  });

  it('maps a Contribution revocation command', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ contribution_id: 'contribution-1', revoked_at: '2026-03-01T00:00:00Z' }],
      error: null
    });

    await expect(
      revokeContribution(
        { rpc } satisfies ContributorRpcClient,
        'contribution-1',
        'Duplicate credit was discovered.',
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { contributionId: 'contribution-1', revokedAt: '2026-03-01T00:00:00Z' }
    });
    expect(rpc).toHaveBeenCalledWith('revoke_contribution', {
      requested_contribution_id: 'contribution-1',
      reason: 'Duplicate credit was discovered.',
      command_request_id: 'request-1'
    });
  });

  it('maps conduct flag recording and clearing commands', async () => {
    const recordRpc = vi.fn().mockResolvedValue({
      data: [{ flag_id: 'flag-1', recorded_at: '2026-03-01T00:00:00Z' }],
      error: null
    });

    await expect(
      recordMemberConductFlag(
        { rpc: recordRpc } satisfies ContributorRpcClient,
        'member-1',
        'fraud',
        'One serious false report.',
        null,
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { flagId: 'flag-1', recordedAt: '2026-03-01T00:00:00Z' }
    });

    const clearRpc = vi.fn().mockResolvedValue({
      data: [{ flag_id: 'flag-1', cleared_at: '2026-03-05T00:00:00Z' }],
      error: null
    });

    await expect(
      clearMemberConductFlag(
        { rpc: clearRpc } satisfies ContributorRpcClient,
        'flag-1',
        'Investigation found the report was legitimate.',
        'request-2'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { flagId: 'flag-1', clearedAt: '2026-03-05T00:00:00Z' }
    });
  });

  it('maps an explicit Moderator recalculation command', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ status: 'contributor', policy_version: 'trust-v1' }],
      error: null
    });

    await expect(
      recalculateMemberContributorStatus(
        { rpc } satisfies ContributorRpcClient,
        'member-1',
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { status: 'contributor', policyVersion: 'trust-v1' }
    });
  });
});
