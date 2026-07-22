import { describe, expect, it, vi } from 'vitest';

import {
  decideCandidatePlace,
  saveFlagModerationDraft,
  saveCandidateModerationDraft,
  saveSuggestionModerationDraft,
  type ModerationDraftRpcClient
} from '$server/moderation/moderation-drafts';

const placeId = '70000000-0000-4000-8000-000000000001';

describe('shared moderation draft RPC adapter', () => {
  it('saves a versioned Candidate section and maps the returned shared draft', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_id: placeId,
          draft_version: 3,
          payload: { operator: { name: 'Edited operator' } },
          updated_by: 'moderator-1',
          updated_at: '2026-07-21T21:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      saveCandidateModerationDraft({ rpc } satisfies ModerationDraftRpcClient, {
        placeId,
        expectedItemVersion: 2,
        expectedDraftVersion: 2,
        sectionId: 'identity',
        payload: { operator: { name: 'Edited operator' } },
        requestId: '80000000-0000-4000-8000-000000000001'
      })
    ).resolves.toEqual({
      status: 'success',
      value: {
        targetId: placeId,
        version: 3,
        payload: { operator: { name: 'Edited operator' } },
        updatedBy: 'moderator-1',
        updatedAt: '2026-07-21T21:00:00Z'
      }
    });
    expect(rpc).toHaveBeenCalledWith('save_candidate_place_moderation_draft', {
      requested_place_id: placeId,
      expected_item_version: 2,
      expected_draft_version: 2,
      requested_section_id: 'identity',
      requested_payload: { operator: { name: 'Edited operator' } },
      command_request_id: '80000000-0000-4000-8000-000000000001'
    });
  });

  it.each([
    ['40001', 'conflict'],
    ['55006', 'resolved'],
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    [undefined, 'infrastructure_error']
  ] as const)('maps draft database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
    await expect(
      saveCandidateModerationDraft(
        { rpc },
        {
          placeId,
          expectedItemVersion: 1,
          expectedDraftVersion: 0,
          sectionId: 'identity',
          payload: {},
          requestId: '80000000-0000-4000-8000-000000000002'
        }
      )
    ).resolves.toEqual({ status });
  });

  it.each([
    [
      'suggestion',
      saveSuggestionModerationDraft,
      'save_place_suggestion_moderation_draft',
      'suggestionId',
      'requested_suggestion_id'
    ],
    [
      'flag',
      saveFlagModerationDraft,
      'save_place_flag_moderation_draft',
      'flagId',
      'requested_flag_id'
    ]
  ] as const)(
    'saves a versioned %s moderation section',
    async (_kind, save, rpcName, idKey, rpcIdKey) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            target_id: placeId,
            draft_version: 1,
            payload: { edited: true },
            updated_by: 'moderator-1',
            updated_at: '2026-07-21T21:00:00Z'
          }
        ],
        error: null
      });
      await expect(
        save({ rpc }, {
          [idKey]: placeId,
          expectedItemVersion: 2,
          expectedDraftVersion: 0,
          sectionId: 'identity',
          payload: { edited: true },
          requestId: 'request-1'
        } as never)
      ).resolves.toMatchObject({ status: 'success', value: { version: 1 } });
      expect(rpc).toHaveBeenCalledWith(rpcName, {
        [rpcIdKey]: placeId,
        expected_item_version: 2,
        expected_draft_version: 0,
        requested_section_id: 'identity',
        requested_payload: { edited: true },
        command_request_id: 'request-1'
      });
    }
  );

  it('submits a Candidate rejection with both concurrency tokens and reasons', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ place_id: placeId, status: 'rejected', item_version: 5, draft_version: 3 }],
      error: null
    });

    await expect(
      decideCandidatePlace(
        { rpc },
        {
          placeId,
          outcome: 'rejected',
          expectedItemVersion: 4,
          expectedDraftVersion: 3,
          reasonCode: 'insufficient_evidence',
          contributorExplanationIs: 'Fleiri heimildir vantar.',
          contributorExplanationEn: 'More evidence is required.',
          privateNote: 'Reopen when evidence arrives.',
          requestId: '80000000-0000-4000-8000-000000000003'
        }
      )
    ).resolves.toEqual({
      status: 'success',
      value: { placeId, status: 'rejected', itemVersion: 5, draftVersion: 3 }
    });
  });
});
