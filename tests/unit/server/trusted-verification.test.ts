import { describe, expect, it, vi } from 'vitest';

import {
  getModerationTrustedVerificationContext,
  getMyTrustedVerificationFeedback,
  getTrustedVerificationTask,
  listMyTrustedVerificationSubmissions,
  listTrustedVerificationTasks,
  markMyTrustedVerificationFeedbackRead,
  submitTrustedVerificationTask,
  type TrustedVerificationRpcClient
} from '$server/trusted-verification/trusted-verification';

describe('Trusted Verification RPC adapter', () => {
  it('maps a safe task projection without adding Member or moderation data', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          task_id: 'access_freshness:condition-1:verification-1',
          task_kind: 'access_freshness',
          place_id: 'place-1',
          place_name: 'Warm Cafe',
          municipality: 'reykjavik',
          category: 'cafe',
          current_value: {
            access_area: 'indoors',
            restraint_condition: 'leash_required'
          },
          freshness_until: '2026-08-01T00:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      listTrustedVerificationTasks({ rpc } satisfies TrustedVerificationRpcClient, 'en')
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          taskId: 'access_freshness:condition-1:verification-1',
          taskKind: 'access_freshness',
          placeId: 'place-1',
          placeName: 'Warm Cafe',
          municipality: 'reykjavik',
          category: 'cafe',
          currentValue: {
            access_area: 'indoors',
            restraint_condition: 'leash_required'
          },
          freshnessUntil: '2026-08-01T00:00:00Z'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_trusted_verification_tasks', {
      requested_locale: 'en',
      requested_limit: 24
    });
  });

  it('maps one focused task and treats a missing row as unavailable', async () => {
    const taskRpc = vi.fn().mockResolvedValue({
      data: [
        {
          task_id: 'dog_amenities:place-1:4',
          task_kind: 'dog_amenities',
          place_id: 'place-1',
          place_name: 'Warm Cafe',
          municipality: 'reykjavik',
          category: 'cafe',
          current_value: { dog_amenities: [] },
          freshness_until: null
        }
      ],
      error: null
    });

    await expect(
      getTrustedVerificationTask(
        { rpc: taskRpc } satisfies TrustedVerificationRpcClient,
        'dog_amenities:place-1:4',
        'is'
      )
    ).resolves.toEqual({
      status: 'success',
      value: {
        taskId: 'dog_amenities:place-1:4',
        taskKind: 'dog_amenities',
        placeId: 'place-1',
        placeName: 'Warm Cafe',
        municipality: 'reykjavik',
        category: 'cafe',
        currentValue: { dog_amenities: [] },
        freshnessUntil: null
      }
    });

    const missingRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(
      getTrustedVerificationTask(
        { rpc: missingRpc } satisfies TrustedVerificationRpcClient,
        'dog_amenities:place-1:4',
        'en'
      )
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('submits evidence with a stable request identity and maps the weekly activation', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          submission_id: 'submission-1',
          flag_id: 'flag-1',
          outcome: 'submitted',
          activated_current_week: true,
          submitted_at: '2026-07-24T00:00:00Z'
        }
      ],
      error: null
    });
    const evidence = {
      kind: 'direct_observation',
      source_citation: 'Observed in person',
      source_label: 'Member observation',
      observed_at: '2026-07-24T00:00:00Z'
    };

    await expect(
      submitTrustedVerificationTask(
        { rpc } satisfies TrustedVerificationRpcClient,
        {
          taskId: 'dog_amenities:place-1:4',
          response: { dog_amenities: ['water_bowl'] },
          evidence,
          explanation: 'I checked this on site.'
        },
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: {
        submissionId: 'submission-1',
        flagId: 'flag-1',
        outcome: 'submitted',
        activatedCurrentWeek: true,
        submittedAt: '2026-07-24T00:00:00Z'
      }
    });
    expect(rpc).toHaveBeenCalledWith('submit_trusted_verification_task', {
      requested_task_id: 'dog_amenities:place-1:4',
      requested_response: { dog_amenities: ['water_bowl'] },
      requested_evidence: evidence,
      requested_explanation: 'I checked this on site.',
      command_request_id: 'request-1'
    });
  });

  it('maps durable outcomes and neutral Member-safe reasons', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          submission_id: 'submission-1',
          task_id: 'access_freshness:condition-1:verification-1',
          task_kind: 'access_freshness',
          flag_id: 'flag-1',
          place_id: 'place-1',
          place_name: 'Warm Cafe',
          outcome: 'rejected',
          member_reason: 'The evidence did not confirm the information.',
          submitted_at: '2026-07-24T00:00:00Z',
          confirmed_at: null
        }
      ],
      error: null
    });

    await expect(
      listMyTrustedVerificationSubmissions({ rpc } satisfies TrustedVerificationRpcClient, 'en')
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          submissionId: 'submission-1',
          taskId: 'access_freshness:condition-1:verification-1',
          taskKind: 'access_freshness',
          flagId: 'flag-1',
          placeId: 'place-1',
          placeName: 'Warm Cafe',
          outcome: 'rejected',
          memberReason: 'The evidence did not confirm the information.',
          submittedAt: '2026-07-24T00:00:00Z',
          confirmedAt: null
        }
      ]
    });
  });

  it('maps and acknowledges one bounded unread confirmation summary', async () => {
    const feedbackRpc = vi.fn().mockResolvedValue({
      data: [
        {
          has_unread: true,
          unread_count: 1,
          latest_confirmed_at: '2026-07-24T00:00:00Z',
          latest_task_kind: 'dog_amenities',
          latest_place_id: 'place-1'
        }
      ],
      error: null
    });

    await expect(
      getMyTrustedVerificationFeedback({
        rpc: feedbackRpc
      } satisfies TrustedVerificationRpcClient)
    ).resolves.toEqual({
      status: 'success',
      value: {
        hasUnread: true,
        unreadCount: 1,
        latestConfirmedAt: '2026-07-24T00:00:00Z',
        latestTaskKind: 'dog_amenities',
        latestPlaceId: 'place-1'
      }
    });

    const markRpc = vi.fn().mockResolvedValue({
      data: [{ read_through_confirmed_at: '2026-07-24T00:00:00Z' }],
      error: null
    });
    await expect(
      markMyTrustedVerificationFeedbackRead(
        { rpc: markRpc } satisfies TrustedVerificationRpcClient,
        '2026-07-24T00:00:00Z'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { readThroughConfirmedAt: '2026-07-24T00:00:00Z' }
    });
  });

  it('maps only the narrow Trusted task context needed by moderation', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          submission_id: 'submission-1',
          task_id: 'dog_amenities:place-1:4',
          task_kind: 'dog_amenities',
          outcome: 'superseded',
          superseded_by_submission_id: 'submission-2'
        }
      ],
      error: null
    });

    await expect(
      getModerationTrustedVerificationContext(
        { rpc } satisfies TrustedVerificationRpcClient,
        'flag-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: {
        submissionId: 'submission-1',
        taskId: 'dog_amenities:place-1:4',
        taskKind: 'dog_amenities',
        outcome: 'superseded',
        supersededBySubmissionId: 'submission-2'
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_moderation_trusted_verification_context', {
      requested_flag_id: 'flag-1'
    });
  });

  it.each([
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    ['55000', 'policy_unavailable'],
    ['54000', 'rate_limited'],
    ['55006', 'conflict'],
    ['23505', 'conflict'],
    ['40001', 'conflict'],
    ['99999', 'infrastructure_error']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(
      listTrustedVerificationTasks({ rpc } satisfies TrustedVerificationRpcClient, 'en')
    ).resolves.toEqual({ status });
  });

  it('fails closed on malformed rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ task_kind: 'private_moderation_task' }],
      error: null
    });

    await expect(
      listTrustedVerificationTasks({ rpc } satisfies TrustedVerificationRpcClient, 'en')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});
