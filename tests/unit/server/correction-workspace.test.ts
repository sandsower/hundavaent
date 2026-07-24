import { describe, expect, it, vi } from 'vitest';

import {
  executeModerationCorrectionAction,
  loadModerationCorrectionQueue,
  loadModerationCorrectionReview,
  parseModerationCorrectionQueueCursor
} from '$server/moderation/correction-workspace';
import type { PlaceFlagRpcClient } from '$server/place-flags/place-flags';

const summaryRow = {
  flag_id: '90000000-0000-4000-8000-000000000001',
  member_id: '76000000-0000-4000-8000-000000000001',
  kind: 'report',
  status: 'submitted',
  place_id: '76300000-0000-4000-8000-000000000001',
  place_name_is: 'Prófstaður',
  place_name_en: 'Test Place',
  target_kind: 'access_condition',
  target_field: null,
  access_condition_id: '76400000-0000-4000-8000-000000000001',
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
};

const detailRow = {
  ...summaryRow,
  current_value_snapshot: { access_area: 'indoors' },
  current_live_value: { access_area: 'indoors' },
  current_place_version: 4,
  current_verification_id: '76600000-0000-4000-8000-000000000001',
  current_verification_status: 'verified',
  current_verification_verified_at: '2026-01-01T00:00:00Z',
  current_verification_freshness_until: '2030-01-01T00:00:00Z',
  current_verification_evidence: [
    {
      kind: 'official_website',
      sourceUrl: 'https://example.invalid/policy',
      sourceCitation: null,
      sourceLabel: 'Published policy',
      observedAt: '2026-01-01T00:00:00Z'
    }
  ],
  proposed_value: null,
  successor_place_id: null,
  explanation: 'The posted policy is unsafe.',
  evidence: {
    kind: 'member_report',
    source_url: null,
    source_citation: 'Personal visit',
    source_label: 'Witnessed in person',
    observed_at: '2026-07-11T09:00:00Z',
    source_metadata: {}
  },
  private_note: null,
  applied_access_condition_id: null,
  dispute_id: null,
  transition_id: null,
  contribution_id: null,
  draft_payload: null
};

const relatedRow = {
  flag_id: '90000000-0000-4000-8000-000000000002',
  kind: 'correction',
  status: 'needs_information',
  submitted_at: '2026-07-11T10:00:00Z'
};

function client(
  overrides: Partial<Record<string, { data: unknown; error: { code?: string } | null }>> = {}
) {
  const rpc = vi.fn(async (name: string) => {
    if (overrides[name]) return overrides[name];
    if (name === 'list_moderation_place_flags') return { data: [summaryRow], error: null };
    if (name === 'get_moderation_place_flag') return { data: [detailRow], error: null };
    if (name === 'list_related_place_flags') return { data: [relatedRow], error: null };
    if (name === 'get_moderation_trusted_verification_context') {
      return {
        data: [
          {
            submission_id: 'submission-1',
            task_id: 'access_freshness:condition-1:verification-1',
            task_kind: 'access_freshness',
            outcome: 'submitted',
            superseded_by_submission_id: null
          }
        ],
        error: null
      };
    }
    if (name === 'resolve_place_flag') {
      return {
        data: [
          {
            flag_id: detailRow.flag_id,
            status: 'dispute_opened',
            applied_access_condition_id: null,
            dispute_id: 'dispute-1',
            transition_id: null
          }
        ],
        error: null
      };
    }
    if (name === 'save_place_flag_moderation_draft') {
      return {
        data: [
          {
            target_id: detailRow.flag_id,
            draft_version: 1,
            payload: {},
            updated_by: 'moderator-1',
            updated_at: '2026-07-11T12:00:00Z'
          }
        ],
        error: null
      };
    }
    if (name === 'confirm_place_flag_contribution') {
      return {
        data: [{ contribution_id: 'contribution-1', confirmed_at: '2026-07-11T12:00:00Z' }],
        error: null
      };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  return { flagClient: { rpc } as PlaceFlagRpcClient, rpc };
}

function form(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set('outcome', 'rejected');
  data.set('expectedItemVersion', '1');
  data.set('expectedDraftVersion', '0');
  data.set('memberReasonIs', 'Ástæða');
  data.set('memberReasonEn', 'Reason');
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('Corrections and Reports workspace queue assembly', () => {
  it('parses the complete safety and trust priority cursor', () => {
    expect(
      parseModerationCorrectionQueueCursor(
        new URLSearchParams({
          cursorPriority: '0',
          cursorTrust: '0',
          cursorTime: summaryRow.submitted_at,
          cursorId: summaryRow.flag_id
        })
      )
    ).toEqual({
      cursor: {
        priority: 0,
        trustPriority: 0,
        submittedAt: summaryRow.submitted_at,
        flagId: summaryRow.flag_id
      },
      hasPrevious: true
    });

    expect(
      parseModerationCorrectionQueueCursor(
        new URLSearchParams({
          cursorPriority: 'not-a-number',
          cursorTrust: '0',
          cursorTime: summaryRow.submitted_at,
          cursorId: summaryRow.flag_id
        })
      )
    ).toEqual({ cursor: null, hasPrevious: true });
  });

  it('loads the safety-ordered queue and forwards the cursor unchanged', async () => {
    const { flagClient, rpc } = client();
    const cursor = {
      priority: 0,
      trustPriority: 0,
      submittedAt: '2026-07-10T09:00:00Z',
      flagId: '90000000-0000-4000-8000-000000000099'
    };

    const result = await loadModerationCorrectionQueue(flagClient, {
      cursor,
      hasPrevious: true
    });

    expect(result).toMatchObject({
      status: 'success',
      value: {
        flags: [
          {
            flagId: summaryRow.flag_id,
            isSafetyConcern: true,
            priority: 0,
            trustTier: 'trusted_contributor'
          }
        ],
        nextCursor: null,
        hasPrevious: true
      }
    });
    expect(rpc).toHaveBeenCalledWith('list_moderation_place_flags', {
      requested_filter: 'actionable',
      cursor_priority: cursor.priority,
      cursor_trust_priority: cursor.trustPriority,
      cursor_submitted_at: cursor.submittedAt,
      cursor_flag_id: cursor.flagId,
      requested_limit: 21
    });
  });

  it('propagates a queue authorization failure', async () => {
    const { flagClient } = client({
      list_moderation_place_flags: { data: null, error: { code: '42501' } }
    });

    await expect(
      loadModerationCorrectionQueue(flagClient, { cursor: null, hasPrevious: false })
    ).resolves.toEqual({ status: 'forbidden' });
  });
});

describe('Corrections and Reports workspace review assembly', () => {
  it('loads the current, submitted, provenance, and related-claim context together', async () => {
    const { flagClient } = client();

    await expect(
      loadModerationCorrectionReview(
        flagClient,
        detailRow.flag_id,
        new URLSearchParams({ resolved: 'submitted', contribution: 'confirmed' })
      )
    ).resolves.toMatchObject({
      status: 'success',
      value: {
        flag: {
          flagId: detailRow.flag_id,
          currentValueSnapshot: { access_area: 'indoors' },
          currentLiveValue: { access_area: 'indoors' },
          currentVerificationId: detailRow.current_verification_id,
          currentVerificationEvidence: [{ sourceLabel: 'Published policy' }]
        },
        related: [{ flagId: relatedRow.flag_id }],
        trustedVerification: {
          taskKind: 'access_freshness',
          outcome: 'submitted'
        },
        resolved: true,
        contributionConfirmed: true
      }
    });
  });

  it('does not hide a mandatory related-claim failure behind a valid detail', async () => {
    const { flagClient } = client({
      list_related_place_flags: { data: null, error: { code: '50000' } }
    });

    await expect(
      loadModerationCorrectionReview(flagClient, detailRow.flag_id, new URLSearchParams())
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('reports a missing review item only after both mandatory reads succeed', async () => {
    const { flagClient, rpc } = client({ get_moderation_place_flag: { data: [], error: null } });

    await expect(
      loadModerationCorrectionReview(flagClient, detailRow.flag_id, new URLSearchParams())
    ).resolves.toEqual({ status: 'not_found' });
    expect(rpc).toHaveBeenCalledWith('list_related_place_flags', {
      requested_flag_id: detailRow.flag_id
    });
  });
});

describe('Corrections and Reports workspace action orchestration', () => {
  it('validates bilingual reasons after the mandatory detail read and before resolution', async () => {
    const { flagClient, rpc } = client();

    const result = await executeModerationCorrectionAction('decideCorrection', {
      flagClient,
      flagId: detailRow.flag_id,
      requestId: 'request-1',
      formData: form({ memberReasonEn: '' })
    });

    expect(result).toEqual({ status: 'failure', httpStatus: 400, error: 'incomplete' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves verification concurrency and evidence when opening an Access Dispute', async () => {
    const { flagClient, rpc } = client();
    const result = await executeModerationCorrectionAction('saveCorrectionSection', {
      flagClient,
      flagId: detailRow.flag_id,
      requestId: 'request-1',
      formData: form({
        outcome: 'dispute_opened',
        sectionId: 'dispute',
        expectedVerificationId: detailRow.current_verification_id,
        disputeReason: 'The live policy conflicts with the report.',
        evidenceKind: 'official_website',
        evidenceSourceLabel: 'Venue policy',
        evidenceUrl: 'https://example.invalid/policy',
        evidenceObservedAt: '2026-07-11T09:00'
      })
    });

    expect(result).toEqual({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'draft_saved', sectionId: 'dispute', draftVersion: 1 }
    });
    expect(rpc).toHaveBeenCalledWith('save_place_flag_moderation_draft', {
      requested_flag_id: detailRow.flag_id,
      expected_item_version: 1,
      expected_draft_version: 0,
      requested_section_id: 'dispute',
      requested_payload: {
        dispute_command: {
          expected_verification_id: detailRow.current_verification_id,
          reason: 'The live policy conflicts with the report.',
          evidence: {
            kind: 'official_website',
            source_url: 'https://example.invalid/policy',
            source_citation: null,
            source_label: 'Venue policy',
            observed_at: '2026-07-11T09:00:00.000Z',
            source_metadata: {}
          }
        }
      },
      command_request_id: 'request-1'
    });
  });

  it('preserves place-version concurrency when applying a replacement field value', async () => {
    const correctionDetail = {
      ...detailRow,
      kind: 'correction',
      target_kind: 'place_field',
      target_field: 'phone',
      access_condition_id: null,
      current_verification_id: null,
      current_verification_status: null,
      current_verification_verified_at: null,
      current_verification_freshness_until: null,
      current_verification_evidence: null,
      proposed_value: { value: '+354 555 0199' }
    };
    const { flagClient, rpc } = client({
      get_moderation_place_flag: { data: [correctionDetail], error: null }
    });

    const result = await executeModerationCorrectionAction('saveCorrectionSection', {
      flagClient,
      flagId: detailRow.flag_id,
      requestId: 'request-1',
      formData: form({
        outcome: 'applied',
        sectionId: 'application',
        expectedVersion: '4',
        fieldValueText: '+354 555 0111'
      })
    });

    expect(result).toEqual({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'draft_saved', sectionId: 'application', draftVersion: 1 }
    });
    expect(rpc).toHaveBeenCalledWith(
      'save_place_flag_moderation_draft',
      expect.objectContaining({
        requested_payload: {
          application_payload: {
            expected_version: 4,
            field_value: { value: '+354 555 0111' }
          }
        }
      })
    );
  });

  it('preserves whenever-open timing when applying an Access Condition replacement', async () => {
    const accessCorrectionDetail = {
      ...detailRow,
      kind: 'correction',
      target_kind: 'access_condition',
      proposed_value: {
        access_area: 'indoors',
        access_area_note: null,
        restraint_condition: 'off_leash_permitted',
        restraint_note: null,
        dog_eligibility: { scope: 'all_dogs' },
        availability_state: 'whenever_open',
        availability_window: {},
        permission_requirement: 'standing_permission'
      }
    };
    const { flagClient, rpc } = client({
      get_moderation_place_flag: { data: [accessCorrectionDetail], error: null }
    });

    const result = await executeModerationCorrectionAction('saveCorrectionSection', {
      flagClient,
      flagId: detailRow.flag_id,
      requestId: 'request-1',
      formData: form({
        outcome: 'applied',
        sectionId: 'application',
        accessArea: 'indoors',
        restraintCondition: 'off_leash_permitted',
        permissionRequirement: 'standing_permission',
        availabilityState: 'whenever_open',
        evidenceKind: 'official_website',
        evidenceSourceLabel: 'Venue policy',
        evidenceUrl: 'https://example.invalid/policy',
        evidenceObservedAt: '2026-07-11T09:00',
        expectedVerificationId: detailRow.current_verification_id,
        verifiedAt: '2026-07-11T09:00',
        freshnessUntil: '2027-07-11T09:00'
      })
    });

    expect(result).toEqual({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'draft_saved', sectionId: 'application', draftVersion: 1 }
    });
    expect(rpc).toHaveBeenCalledWith(
      'save_place_flag_moderation_draft',
      expect.objectContaining({
        requested_payload: {
          application_payload: expect.objectContaining({
            replacement_condition: expect.objectContaining({
              availability_state: 'whenever_open',
              availability_window: {}
            })
          })
        }
      })
    );
  });

  it.each([
    ['40001', 409, 'conflict'],
    ['42501', 403, 'forbidden'],
    ['22023', 400, 'invalid'],
    ['50000', 503, 'unavailable']
  ] as const)(
    'maps a resolution RPC failure %s to a route-neutral failure',
    async (code, httpStatus, error) => {
      const { flagClient } = client({
        resolve_place_flag: { data: null, error: { code } }
      });

      await expect(
        executeModerationCorrectionAction('decideCorrection', {
          flagClient,
          flagId: detailRow.flag_id,
          requestId: 'request-1',
          formData: form()
        })
      ).resolves.toEqual({ status: 'failure', httpStatus, error });
    }
  );

  it.each(['applied', 'confirmed_useful'] as const)(
    'allows %s to omit paired Member explanations and sends null inline content',
    async (outcome) => {
      const { flagClient, rpc } = client();
      const result = await executeModerationCorrectionAction('decideCorrection', {
        flagClient,
        flagId: detailRow.flag_id,
        requestId: 'request-1',
        formData: form({ outcome, memberReasonIs: '', memberReasonEn: '' })
      });
      expect(result).toMatchObject({ status: 'confirmed', terminal: true });
      expect(rpc).toHaveBeenCalledWith(
        'resolve_place_flag',
        expect.objectContaining({
          expected_item_version: 1,
          expected_draft_version: 0,
          member_reason_is: null,
          member_reason_en: null,
          application_payload: null,
          dispute_command: null,
          transition_command: null
        })
      );
    }
  );

  it('confirms useful contribution credit through the shared action contract', async () => {
    const { flagClient } = client();

    await expect(
      executeModerationCorrectionAction('confirmUseful', {
        flagClient,
        flagId: detailRow.flag_id,
        requestId: 'request-1',
        formData: null
      })
    ).resolves.toEqual({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'contribution', value: 'confirmed' }
    });
  });
});
