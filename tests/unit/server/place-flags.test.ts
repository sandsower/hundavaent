import { describe, expect, it, vi } from 'vitest';

import {
  confirmPlaceFlagContribution,
  getModerationPlaceFlag,
  listMemberPlaceFlags,
  listModerationPlaceFlags,
  listMyOpenPlaceFlags,
  listRelatedPlaceFlags,
  resolvePlaceFlag,
  submitCorrection,
  submitReport,
  type PlaceFlagRpcClient
} from '$server/place-flags/place-flags';
import type { CorrectionPayload, ReportPayload } from '$server/place-flags/place-flag-input';

const correctionPayload = {
  place_id: '76300000-0000-4000-8000-000000000001',
  target_kind: 'place_field',
  target_field: 'phone',
  access_condition_id: null,
  explanation: 'The phone number changed.',
  evidence: {
    kind: 'direct_observation',
    source_url: 'https://example.invalid/proof',
    source_citation: null,
    source_label: 'Called the venue',
    observed_at: '2026-07-11T09:00:00.000Z',
    source_metadata: {}
  },
  proposed_value: { value: '+354 555 0199' }
} satisfies CorrectionPayload;

const reportPayload = {
  place_id: '76300000-0000-4000-8000-000000000001',
  target_kind: 'access_condition',
  target_field: null,
  access_condition_id: '76400000-0000-4000-8000-000000000001',
  explanation: 'A dog was turned away.',
  evidence: {
    kind: 'member_report',
    source_url: null,
    source_citation: 'Personal visit',
    source_label: 'Witnessed in person',
    observed_at: '2026-07-11T09:00:00.000Z',
    source_metadata: {}
  },
  report_reason: 'unsafe',
  is_safety_concern: true,
  successor_place_id: null
} satisfies ReportPayload;

describe('Place-flag RPC adapter', () => {
  it('submits a Correction without exposing database row names', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-1',
          status: 'submitted',
          submitted_at: '2026-07-11T09:00:00Z',
          qualifying_action_recorded: true,
          activated_current_week: true,
          current_week_starts_on: '2026-07-06',
          current_week_ends_on: '2026-07-12',
          current_week_active: true
        }
      ],
      error: null
    });

    await expect(
      submitCorrection({ rpc } satisfies PlaceFlagRpcClient, correctionPayload, 'request-1')
    ).resolves.toEqual({
      status: 'success',
      value: {
        flagId: 'flag-1',
        outcome: 'submitted',
        submittedAt: '2026-07-11T09:00:00Z',
        recognition: {
          action: 'correction',
          recognized: true,
          activatedCurrentWeek: true,
          currentWeek: { startsOn: '2026-07-06', endsOn: '2026-07-12', active: true }
        }
      }
    });
    expect(rpc).toHaveBeenCalledWith('submit_place_correction', {
      command_payload: correctionPayload,
      command_request_id: 'request-1'
    });
  });

  it('submits a Report through the distinct entry RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-2',
          status: 'submitted',
          submitted_at: '2026-07-11T09:00:00Z',
          qualifying_action_recorded: true,
          activated_current_week: false,
          current_week_starts_on: '2026-07-06',
          current_week_ends_on: '2026-07-12',
          current_week_active: true
        }
      ],
      error: null
    });

    await expect(
      submitReport({ rpc } satisfies PlaceFlagRpcClient, reportPayload, 'request-2')
    ).resolves.toEqual({
      status: 'success',
      value: {
        flagId: 'flag-2',
        outcome: 'submitted',
        submittedAt: '2026-07-11T09:00:00Z',
        recognition: {
          action: 'report',
          recognized: true,
          activatedCurrentWeek: false,
          currentWeek: { startsOn: '2026-07-06', endsOn: '2026-07-12', active: true }
        }
      }
    });
    expect(rpc).toHaveBeenCalledWith('submit_place_report', {
      command_payload: reportPayload,
      command_request_id: 'request-2'
    });
  });

  it.each([
    ['55000', 'policy_unavailable'],
    ['55006', 'conflict'],
    ['23505', 'conflict'],
    ['54000', 'rate_limited'],
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    ['40001', 'conflict'],
    [undefined, 'infrastructure_error']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(
      submitCorrection({ rpc } satisfies PlaceFlagRpcClient, correctionPayload, 'request-1')
    ).resolves.toEqual({ status });
  });

  it('returns infrastructure_error for a malformed submission row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ flag_id: 1 }], error: null });

    await expect(
      submitReport({ rpc } satisfies PlaceFlagRpcClient, reportPayload, 'request-1')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('lists the caller-private outcome history with a bounded page size', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      flag_id: `flag-${index}`,
      kind: 'correction',
      status: 'submitted',
      place_name_is: 'Nafn',
      place_name_en: 'Name',
      target_kind: 'place_field',
      target_field: 'phone',
      report_reason: null,
      member_reason_is: null,
      member_reason_en: null,
      submitted_at: `2026-07-11T09:0${index % 10}:00Z`,
      updated_at: `2026-07-11T09:0${index % 10}:00Z`
    }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

    const result = await listMemberPlaceFlags({ rpc } satisfies PlaceFlagRpcClient, null, 20);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.value.items).toHaveLength(20);
    expect(result.value.nextCursor).toEqual({
      submittedAt: rows[19].submitted_at,
      flagId: rows[19].flag_id
    });
  });

  it('lists the Moderator queue with Safety Concern priority carried through', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-1',
          member_id: 'member-1',
          kind: 'report',
          status: 'submitted',
          place_id: 'place-1',
          place_name_is: 'Nafn',
          place_name_en: 'Name',
          target_kind: 'access_condition',
          target_field: null,
          access_condition_id: 'condition-1',
          report_reason: 'unsafe',
          is_safety_concern: true,
          submitted_at: '2026-07-11T09:00:00Z',
          updated_at: '2026-07-11T09:00:00Z',
          priority: 0,
          trust_tier: 'trusted_contributor',
          trust_priority: 0,
          item_version: 1,
          draft_version: 0,
          draft_updated_by: null,
          draft_updated_at: null,
          readiness_state: 'ready'
        }
      ],
      error: null
    });

    const result = await listModerationPlaceFlags({ rpc } satisfies PlaceFlagRpcClient);

    expect(result).toEqual({
      status: 'success',
      value: {
        items: [
          {
            flagId: 'flag-1',
            memberId: 'member-1',
            kind: 'report',
            outcome: 'submitted',
            placeId: 'place-1',
            placeNameIs: 'Nafn',
            placeNameEn: 'Name',
            targetKind: 'access_condition',
            targetField: null,
            accessConditionId: 'condition-1',
            reportReason: 'unsafe',
            isSafetyConcern: true,
            submittedAt: '2026-07-11T09:00:00Z',
            updatedAt: '2026-07-11T09:00:00Z',
            priority: 0,
            trustTier: 'trusted_contributor',
            trustPriority: 0,
            itemVersion: 1,
            draftVersion: 0,
            draftUpdatedBy: null,
            draftUpdatedAt: null,
            readinessState: 'ready'
          }
        ],
        nextCursor: null
      }
    });
  });

  it('fetches Moderator-only detail including the live and snapshot comparison', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-1',
          member_id: 'member-1',
          kind: 'correction',
          status: 'submitted',
          place_id: 'place-1',
          place_name_is: 'Nafn',
          place_name_en: 'Name',
          target_kind: 'place_field',
          target_field: 'phone',
          access_condition_id: null,
          current_value_snapshot: { value: '+354 555 0100' },
          current_live_value: { value: '+354 555 0100' },
          current_place_version: 1,
          current_verification_id: null,
          current_verification_status: null,
          current_verification_verified_at: null,
          current_verification_freshness_until: null,
          current_verification_evidence: null,
          proposed_value: { value: '+354 555 0199' },
          report_reason: null,
          is_safety_concern: false,
          successor_place_id: null,
          explanation: 'Phone changed.',
          evidence: {
            kind: 'direct_observation',
            source_label: 'Called',
            observed_at: '2026-07-11T09:00:00Z'
          },
          private_note: null,
          applied_access_condition_id: null,
          dispute_id: null,
          transition_id: null,
          contribution_id: null,
          submitted_at: '2026-07-11T09:00:00Z',
          updated_at: '2026-07-11T09:00:00Z',
          item_version: 1,
          draft_version: 0,
          draft_payload: null,
          draft_updated_by: null,
          draft_updated_at: null
        }
      ],
      error: null
    });

    const result = await getModerationPlaceFlag({ rpc } satisfies PlaceFlagRpcClient, 'flag-1');

    expect(result.status).toBe('success');
    if (result.status !== 'success' || !result.value) return;
    expect(result.value.currentValueSnapshot).toEqual({ value: '+354 555 0100' });
    expect(result.value.proposedValue).toEqual({ value: '+354 555 0199' });
    expect(result.value.currentVerificationId).toBeNull();
    expect(result.value.currentVerificationStatus).toBeNull();
    expect(result.value.currentVerificationEvidence).toBeNull();
  });

  it('fetches Moderator-only detail including the current verification freshness and provenance', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-2',
          member_id: 'member-1',
          kind: 'report',
          status: 'submitted',
          place_id: 'place-1',
          place_name_is: 'Nafn',
          place_name_en: 'Name',
          target_kind: 'access_condition',
          target_field: null,
          access_condition_id: 'condition-1',
          current_value_snapshot: { access_area: 'indoors' },
          current_live_value: { access_area: 'indoors' },
          current_place_version: 1,
          current_verification_id: 'verification-1',
          current_verification_status: 'verified',
          current_verification_verified_at: '2026-01-01T00:00:00+00:00',
          current_verification_freshness_until: '2030-01-01T00:00:00+00:00',
          current_verification_evidence: [
            {
              kind: 'official_website',
              sourceUrl: 'https://example.invalid/policy',
              sourceCitation: null,
              sourceLabel: 'Posted policy',
              observedAt: '2026-01-01T00:00:00+00:00'
            }
          ],
          proposed_value: null,
          report_reason: 'unsafe',
          is_safety_concern: true,
          successor_place_id: null,
          explanation: 'Sign contradicts policy.',
          evidence: {
            kind: 'direct_observation',
            source_label: 'Photo',
            observed_at: '2026-07-11T09:00:00Z'
          },
          private_note: null,
          applied_access_condition_id: null,
          dispute_id: null,
          transition_id: null,
          contribution_id: null,
          submitted_at: '2026-07-11T09:00:00Z',
          updated_at: '2026-07-11T09:00:00Z',
          item_version: 1,
          draft_version: 0,
          draft_payload: null,
          draft_updated_by: null,
          draft_updated_at: null
        }
      ],
      error: null
    });

    const result = await getModerationPlaceFlag({ rpc } satisfies PlaceFlagRpcClient, 'flag-2');

    expect(result.status).toBe('success');
    if (result.status !== 'success' || !result.value) return;
    expect(result.value.currentVerificationId).toBe('verification-1');
    expect(result.value.currentVerificationStatus).toBe('verified');
    expect(result.value.currentVerificationVerifiedAt).toBe('2026-01-01T00:00:00+00:00');
    expect(result.value.currentVerificationFreshnessUntil).toBe('2030-01-01T00:00:00+00:00');
    expect(result.value.currentVerificationEvidence).toEqual([
      {
        kind: 'official_website',
        sourceUrl: 'https://example.invalid/policy',
        sourceCitation: null,
        sourceLabel: 'Posted policy',
        observedAt: '2026-01-01T00:00:00+00:00'
      }
    ]);
  });

  it('returns null detail when the Correction/Report does not exist', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(
      getModerationPlaceFlag({ rpc } satisfies PlaceFlagRpcClient, 'missing')
    ).resolves.toEqual({ status: 'success', value: null });
  });

  it('lists related claims sharing the same target', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-2',
          kind: 'report',
          status: 'submitted',
          submitted_at: '2026-07-11T09:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      listRelatedPlaceFlags({ rpc } satisfies PlaceFlagRpcClient, 'flag-1')
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          flagId: 'flag-2',
          kind: 'report',
          outcome: 'submitted',
          submittedAt: '2026-07-11T09:00:00Z'
        }
      ]
    });
  });

  it('resolves a Correction or Report and surfaces the composed command outcomes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          flag_id: 'flag-1',
          status: 'dispute_opened',
          applied_access_condition_id: null,
          dispute_id: 'dispute-1',
          transition_id: null
        }
      ],
      error: null
    });

    await expect(
      resolvePlaceFlag(
        { rpc } satisfies PlaceFlagRpcClient,
        {
          flagId: 'flag-1',
          outcome: 'dispute_opened',
          expectedItemVersion: 2,
          expectedDraftVersion: 1,
          memberReasonIs: 'Ástæða',
          memberReasonEn: 'Reason',
          privateNote: null
        },
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { appliedAccessConditionId: null, disputeId: 'dispute-1', transitionId: null }
    });
    expect(rpc).toHaveBeenCalledWith(
      'resolve_place_flag',
      expect.objectContaining({
        expected_item_version: 2,
        expected_draft_version: 1,
        application_payload: null,
        dispute_command: null,
        transition_command: null
      })
    );
  });

  it('confirms Contribution credit idempotently', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ contribution_id: 'contribution-1', confirmed_at: '2026-07-11T09:00:00Z' }],
      error: null
    });

    await expect(
      confirmPlaceFlagContribution({ rpc } satisfies PlaceFlagRpcClient, 'flag-1', 'request-1')
    ).resolves.toEqual({
      status: 'success',
      value: { contributionId: 'contribution-1', confirmedAt: '2026-07-11T09:00:00Z' }
    });
  });

  it('returns infrastructure_error when the adapter throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      submitCorrection({ rpc } satisfies PlaceFlagRpcClient, correctionPayload, 'request-1')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});

describe('the caller open flags on one Place', () => {
  const openRow = {
    kind: 'correction',
    target_kind: 'place_field',
    target_field: 'phone',
    access_condition_id: null,
    report_reason: null,
    status: 'submitted'
  };

  it('maps the addressing and asks only about the Place it was given', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        openRow,
        {
          kind: 'report',
          target_kind: 'access_condition',
          target_field: null,
          access_condition_id: '76400000-0000-4000-8000-000000000001',
          report_reason: 'moved',
          status: 'needs_information'
        }
      ],
      error: null
    });

    await expect(
      listMyOpenPlaceFlags(
        { rpc } satisfies PlaceFlagRpcClient,
        '76300000-0000-4000-8000-000000000001'
      )
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          kind: 'correction',
          targetKind: 'place_field',
          targetField: 'phone',
          accessConditionId: null,
          reportReason: null,
          status: 'submitted'
        },
        {
          kind: 'report',
          targetKind: 'access_condition',
          targetField: null,
          accessConditionId: '76400000-0000-4000-8000-000000000001',
          reportReason: 'moved',
          status: 'needs_information'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_my_open_place_flags', {
      requested_place_id: '76300000-0000-4000-8000-000000000001'
    });
  });

  it('reads an empty projection as no pending work rather than as a failure', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(
      listMyOpenPlaceFlags({ rpc } satisfies PlaceFlagRpcClient, 'place-1')
    ).resolves.toEqual({ status: 'success', value: [] });
  });

  it('refuses a resolved status, which a read promising open flags never returns', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ ...openRow, status: 'applied' }], error: null });

    await expect(
      listMyOpenPlaceFlags({ rpc } satisfies PlaceFlagRpcClient, 'place-1')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('refuses a row whose target field is outside the database vocabulary', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ ...openRow, target_field: 'nickname' }], error: null });

    await expect(
      listMyOpenPlaceFlags({ rpc } satisfies PlaceFlagRpcClient, 'place-1')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('maps a refused read to forbidden rather than to an empty list', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });

    await expect(
      listMyOpenPlaceFlags({ rpc } satisfies PlaceFlagRpcClient, 'place-1')
    ).resolves.toEqual({ status: 'forbidden' });
  });
});
