import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import {
  openAccessDispute,
  reconfirmAccessCondition,
  resolveAccessDispute,
  scheduleReconfirmationDue,
  transitionPlaceIdentity
} from '$server/moderation/place-lifecycle';

function clientWith(data: unknown, error: { code: string; message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

const evidence = {
  kind: 'official_website' as const,
  source_url: 'https://example.invalid/policy',
  source_label: 'Policy',
  observed_at: '2026-07-11T00:00:00Z'
};

describe('Place lifecycle command adapters', () => {
  it('maps controlled-clock freshness tasks', async () => {
    const { client, rpc } = clientWith([
      {
        task_id: 'task-1',
        verification_id: 'verification-1',
        due_at: '2026-07-01T00:00:00Z'
      }
    ]);

    await expect(
      scheduleReconfirmationDue(client, '2026-07-11T00:00:00Z', 'request-1')
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          taskId: 'task-1',
          verificationId: 'verification-1',
          dueAt: '2026-07-01T00:00:00Z'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('schedule_reconfirmation_due', {
      requested_as_of: '2026-07-11T00:00:00Z',
      command_request_id: 'request-1'
    });
  });

  it('maps reconfirmation, dispute, resolution, and identity results', async () => {
    const reconfirm = clientWith([
      {
        verification_id: 'verification-2',
        verified_at: '2026-07-11T00:00:00Z',
        freshness_until: '2027-01-11T00:00:00Z'
      }
    ]).client;
    await expect(
      reconfirmAccessCondition(
        reconfirm,
        {
          accessConditionId: 'condition-1',
          expectedVerificationId: 'verification-1',
          verifiedAt: '2026-07-11T00:00:00Z',
          freshnessUntil: '2027-01-11T00:00:00Z',
          evidence
        },
        'request-2'
      )
    ).resolves.toMatchObject({ status: 'success', value: { verificationId: 'verification-2' } });

    const dispute = clientWith([
      {
        dispute_id: 'dispute-1',
        disputed_verification_id: 'verification-3',
        opened_at: '2026-07-11T00:00:00Z'
      }
    ]).client;
    await expect(
      openAccessDispute(
        dispute,
        {
          accessConditionId: 'condition-1',
          expectedVerificationId: 'verification-2',
          openedAt: '2026-07-11T00:00:00Z',
          reason: 'Conflicting access report',
          evidence
        },
        'request-3'
      )
    ).resolves.toMatchObject({ status: 'success', value: { disputeId: 'dispute-1' } });

    const resolution = clientWith([
      {
        dispute_id: 'dispute-1',
        access_condition_id: 'condition-2',
        verification_id: 'verification-4',
        resolved_at: '2026-07-12T00:00:00Z'
      }
    ]).client;
    await expect(
      resolveAccessDispute(
        resolution,
        {
          disputeId: 'dispute-1',
          outcome: 'dismissed',
          resolvedAt: '2026-07-12T00:00:00Z',
          freshnessUntil: '2027-01-12T00:00:00Z',
          resolutionNotes: 'Access was reconfirmed',
          evidence
        },
        'request-4'
      )
    ).resolves.toMatchObject({ status: 'success', value: { verificationId: 'verification-4' } });

    const identity = clientWith([
      {
        transition_id: 'transition-1',
        predecessor_place_id: 'place-1',
        successor_place_id: null,
        transition_kind: 'rebrand',
        predecessor_version: 3
      }
    ]).client;
    await expect(
      transitionPlaceIdentity(
        identity,
        {
          placeId: 'place-1',
          expectedVersion: 2,
          kind: 'rebrand',
          decidedAt: '2026-07-12T00:00:00Z',
          decisionNotes: 'Name-only continuity',
          names: { is: 'Nýtt nafn', en: 'New name' }
        },
        'request-5'
      )
    ).resolves.toMatchObject({ status: 'success', value: { transitionId: 'transition-1' } });
  });

  it.each([
    ['42501', 'forbidden'],
    ['40001', 'stale'],
    ['23505', 'stale'],
    ['22023', 'invalid'],
    ['XX000', 'infrastructure_error']
  ] as const)('redacts database code %s as %s', async (code, status) => {
    const { client } = clientWith(null, { code, message: 'private database detail' });
    const result = await scheduleReconfirmationDue(client, '2026-07-11T00:00:00Z', 'request');

    expect(result).toEqual({ status });
    expect(JSON.stringify(result)).not.toContain('private database detail');
  });

  it('rejects malformed success rows at the server boundary', async () => {
    const { client } = clientWith([{ task_id: '', verification_id: 'verification', due_at: 'no' }]);

    await expect(
      scheduleReconfirmationDue(client, '2026-07-11T00:00:00Z', 'request')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it.each(['rebrand', 'inactive', 'move', 'new_operator', 'material_purpose_change'] as const)(
    'accepts the closed identity transition kind %s',
    async (transitionKind) => {
      const { client } = clientWith([
        {
          transition_id: 'transition-1',
          predecessor_place_id: 'place-1',
          successor_place_id:
            transitionKind === 'rebrand' || transitionKind === 'inactive' ? null : 'place-2',
          transition_kind: transitionKind,
          predecessor_version: 3
        }
      ]);

      await expect(
        transitionPlaceIdentity(
          client,
          {
            placeId: 'place-1',
            expectedVersion: 2,
            kind: transitionKind,
            decidedAt: '2026-07-12T00:00:00Z',
            decisionNotes: 'Identity decision'
          },
          'request-accepted-kind'
        )
      ).resolves.toMatchObject({
        status: 'success',
        value: { transitionKind }
      });
    }
  );

  it('rejects an identity transition row outside the closed kind union', async () => {
    const { client } = clientWith([
      {
        transition_id: 'transition-1',
        predecessor_place_id: 'place-1',
        successor_place_id: 'place-2',
        transition_kind: 'relocated',
        predecessor_version: 3
      }
    ]);

    await expect(
      transitionPlaceIdentity(
        client,
        {
          placeId: 'place-1',
          expectedVersion: 2,
          kind: 'move',
          decidedAt: '2026-07-12T00:00:00Z',
          decisionNotes: 'Identity decision',
          successorPlaceId: 'place-2'
        },
        'request-malformed-kind'
      )
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});
