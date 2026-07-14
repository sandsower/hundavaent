import { describe, expect, it, vi } from 'vitest';

import {
  createReportFromRatingNote,
  excludeRating,
  getMyRating,
  getPrivateRatingNotePolicy,
  getSummary,
  listModerationRatingNoteDispositions,
  listModerationRatingNoteHistory,
  listModerationRatings,
  recordRatingNoteDisposition,
  reinstateRating,
  submitRating,
  type DogFriendlinessRpcClient
} from '$server/dog-friendliness/dog-friendliness';
import {
  isPrivateRatingNoteClassification,
  parseRatingNoteDispositionFormData,
  readRatingNoteInput,
  type RatingScores
} from '$server/dog-friendliness/dog-friendliness-input';

const scores: RatingScores = { welcome: 4, clarity: null, comfort: 5, thoughtfulness: 3 };

const baseRow = {
  id: 'rating-1',
  place_id: 'place-1',
  welcome_score: 4,
  clarity_score: null,
  comfort_score: 5,
  thoughtfulness_score: 3,
  rated_at: '2026-07-12T09:00:00Z',
  excluded: false,
  private_note: null,
  private_note_classification: null,
  private_note_updated_at: null,
  linked_report_id: null
};

describe('Dog-Friendliness RPC adapter', () => {
  it('submits a Rating with the Dimension scores mapped to database parameter names', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [baseRow], error: null });

    await expect(
      submitRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', scores, 'request-1')
    ).resolves.toEqual({
      status: 'success',
      value: {
        id: 'rating-1',
        placeId: 'place-1',
        scores: { welcome: 4, clarity: null, comfort: 5, thoughtfulness: 3 },
        ratedAt: '2026-07-12T09:00:00Z',
        excluded: false,
        privateNote: null,
        privateNoteClassification: null,
        privateNoteUpdatedAt: null,
        linkedReportId: null
      }
    });
    expect(rpc).toHaveBeenCalledWith('submit_dog_friendliness_rating', {
      requested_place_id: 'place-1',
      requested_welcome_score: 4,
      requested_clarity_score: null,
      requested_comfort_score: 5,
      requested_thoughtfulness_score: 3,
      command_request_id: 'request-1',
      requested_update_private_note: false,
      requested_private_note: null,
      requested_private_note_classification: null
    });
  });

  it('submits a Private Rating Note alongside a qualifying low score', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          ...baseRow,
          welcome_score: 2,
          private_note: 'The welcome felt cold.',
          private_note_classification: 'subjective',
          private_note_updated_at: '2026-07-12T10:00:00Z'
        }
      ],
      error: null
    });

    const result = await submitRating(
      { rpc } satisfies DogFriendlinessRpcClient,
      'place-1',
      { welcome: 2, clarity: null, comfort: 5, thoughtfulness: 3 },
      'request-1',
      { update: true, note: 'The welcome felt cold.', classification: 'subjective' }
    );

    expect(result).toEqual({
      status: 'success',
      value: {
        id: 'rating-1',
        placeId: 'place-1',
        scores: { welcome: 2, clarity: null, comfort: 5, thoughtfulness: 3 },
        ratedAt: '2026-07-12T09:00:00Z',
        excluded: false,
        privateNote: 'The welcome felt cold.',
        privateNoteClassification: 'subjective',
        privateNoteUpdatedAt: '2026-07-12T10:00:00Z',
        linkedReportId: null
      }
    });
    expect(rpc).toHaveBeenCalledWith(
      'submit_dog_friendliness_rating',
      expect.objectContaining({
        requested_update_private_note: true,
        requested_private_note: 'The welcome felt cold.',
        requested_private_note_classification: 'subjective'
      })
    );
  });

  it('clears a note by sending update: true with a null note, never omitting the intent', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [baseRow], error: null });

    await submitRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', scores, 'request-1', {
      update: true,
      note: null,
      classification: null
    });

    expect(rpc).toHaveBeenCalledWith(
      'submit_dog_friendliness_rating',
      expect.objectContaining({
        requested_update_private_note: true,
        requested_private_note: null,
        requested_private_note_classification: null
      })
    );
  });

  it('returns null when the Member has no current Rating', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(
      getMyRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1')
    ).resolves.toEqual({ status: 'success', value: null });
  });

  it('reads the Member own current Rating including exclusion state and note', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          ...baseRow,
          welcome_score: 2,
          clarity_score: 2,
          comfort_score: 2,
          thoughtfulness_score: 2,
          excluded: true,
          private_note: 'Access rules were confusing.',
          private_note_classification: 'inaccurate_info',
          private_note_updated_at: '2026-07-12T09:00:00Z',
          linked_report_id: 'flag-1'
        }
      ],
      error: null
    });

    const result = await getMyRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.value?.excluded).toBe(true);
    expect(result.value?.privateNoteClassification).toBe('inaccurate_info');
    expect(result.value?.linkedReportId).toBe('flag-1');
  });

  it('reads a hidden public Summary with no leaked counts or values', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          place_id: 'place-1',
          summary_visible: false,
          eligible_count: null,
          trailing_twelve_month_count: null,
          dimensions: null,
          overall_mean: null,
          overall_visible: false
        }
      ],
      error: null
    });

    await expect(
      getSummary({ rpc } satisfies DogFriendlinessRpcClient, 'place-1')
    ).resolves.toEqual({
      status: 'success',
      value: {
        placeId: 'place-1',
        visible: false,
        eligibleCount: null,
        trailingTwelveMonthCount: null,
        dimensions: [],
        overallMean: null,
        overallVisible: false
      }
    });
  });

  it('reads a visible public Summary with qualifying Dimensions and an overall result', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          place_id: 'place-1',
          summary_visible: true,
          eligible_count: 5,
          trailing_twelve_month_count: 5,
          dimensions: [
            { dimension: 'welcome', applicableCount: 5, mean: 4 },
            { dimension: 'comfort', applicableCount: 5, mean: 3.5 }
          ],
          overall_mean: 3.5,
          overall_visible: true
        }
      ],
      error: null
    });

    const result = await getSummary({ rpc } satisfies DogFriendlinessRpcClient, 'place-1');

    expect(result).toEqual({
      status: 'success',
      value: {
        placeId: 'place-1',
        visible: true,
        eligibleCount: 5,
        trailingTwelveMonthCount: 5,
        dimensions: [
          { dimension: 'welcome', applicableCount: 5, mean: 4 },
          { dimension: 'comfort', applicableCount: 5, mean: 3.5 }
        ],
        overallMean: 3.5,
        overallVisible: true
      }
    });
  });

  it('lists unaggregated Ratings for Moderator review, eligible and excluded alike, with note fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'rating-1',
          member_id: 'member-1',
          welcome_score: 4,
          clarity_score: null,
          comfort_score: 5,
          thoughtfulness_score: 3,
          rated_at: '2026-07-12T09:00:00Z',
          excluded_at: null,
          excluded_kind: null,
          excluded_reason: null,
          private_note: 'A loose dog nearly reached the street.',
          private_note_classification: 'safety_concern',
          private_note_updated_at: '2026-07-12T09:00:00Z',
          linked_report_id: 'flag-2'
        },
        {
          id: 'rating-2',
          member_id: 'member-2',
          welcome_score: 1,
          clarity_score: 1,
          comfort_score: 1,
          thoughtfulness_score: 1,
          rated_at: '2026-07-12T08:00:00Z',
          excluded_at: '2026-07-12T09:30:00Z',
          excluded_kind: 'fraud',
          excluded_reason: 'Duplicate account signal',
          private_note: null,
          private_note_classification: null,
          private_note_updated_at: null,
          linked_report_id: null
        }
      ],
      error: null
    });

    const result = await listModerationRatings(
      { rpc } satisfies DogFriendlinessRpcClient,
      'place-1'
    );

    expect(result).toEqual({
      status: 'success',
      value: [
        {
          id: 'rating-1',
          memberId: 'member-1',
          scores: { welcome: 4, clarity: null, comfort: 5, thoughtfulness: 3 },
          ratedAt: '2026-07-12T09:00:00Z',
          excludedAt: null,
          excludedKind: null,
          excludedReason: null,
          privateNote: 'A loose dog nearly reached the street.',
          privateNoteClassification: 'safety_concern',
          privateNoteUpdatedAt: '2026-07-12T09:00:00Z',
          linkedReportId: 'flag-2'
        },
        {
          id: 'rating-2',
          memberId: 'member-2',
          scores: { welcome: 1, clarity: 1, comfort: 1, thoughtfulness: 1 },
          ratedAt: '2026-07-12T08:00:00Z',
          excludedAt: '2026-07-12T09:30:00Z',
          excludedKind: 'fraud',
          excludedReason: 'Duplicate account signal',
          privateNote: null,
          privateNoteClassification: null,
          privateNoteUpdatedAt: null,
          linkedReportId: null
        }
      ]
    });
  });

  it('excludes a Rating with an auditable reason', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'rating-1', excluded_at: '2026-07-12T09:00:00Z' }],
      error: null
    });

    await expect(
      excludeRating(
        { rpc } satisfies DogFriendlinessRpcClient,
        'member-1',
        'place-1',
        'fraud',
        'Duplicate account signal',
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { ratingId: 'rating-1', excludedAt: '2026-07-12T09:00:00Z' }
    });
    expect(rpc).toHaveBeenCalledWith('exclude_dog_friendliness_rating', {
      requested_member_id: 'member-1',
      requested_place_id: 'place-1',
      exclusion_kind: 'fraud',
      reason: 'Duplicate account signal',
      command_request_id: 'request-1'
    });
  });

  it('reinstates a Rating with an auditable reason', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'rating-1', reinstated_at: '2026-07-12T09:00:00Z' }],
      error: null
    });

    await expect(
      reinstateRating(
        { rpc } satisfies DogFriendlinessRpcClient,
        'member-1',
        'place-1',
        'Investigation cleared the account',
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { ratingId: 'rating-1', reinstatedAt: '2026-07-12T09:00:00Z' }
    });
  });

  it('reads the Private Rating Note policy status', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ enabled: true, low_score_threshold: 2 }],
      error: null
    });

    await expect(
      getPrivateRatingNotePolicy({ rpc } satisfies DogFriendlinessRpcClient)
    ).resolves.toEqual({ status: 'success', value: { enabled: true, lowScoreThreshold: 2 } });
    expect(rpc).toHaveBeenCalledWith('get_private_rating_note_policy');
  });

  it('creates an explicit Report from a qualifying note', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ flag_id: 'flag-1', status: 'submitted', submitted_at: '2026-07-12T09:00:00Z' }],
      error: null
    });

    await expect(
      createReportFromRatingNote({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', 'request-1')
    ).resolves.toEqual({
      status: 'success',
      value: { flagId: 'flag-1', outcome: 'submitted', submittedAt: '2026-07-12T09:00:00Z' }
    });
    expect(rpc).toHaveBeenCalledWith('create_report_from_rating_note', {
      requested_place_id: 'place-1',
      command_request_id: 'request-1'
    });
  });

  it('maps a conflicting Report-creation attempt to conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '55006' } });

    await expect(
      createReportFromRatingNote({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', 'request-1')
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('lists Moderator-only note history', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          event_kind: 'submitted',
          private_note: 'Original note.',
          private_note_classification: 'subjective',
          occurred_at: '2026-07-12T09:00:00Z'
        },
        {
          event_kind: 'note_updated',
          private_note: 'Edited note.',
          private_note_classification: 'inaccurate_info',
          occurred_at: '2026-07-12T09:05:00Z'
        }
      ],
      error: null
    });

    await expect(
      listModerationRatingNoteHistory(
        { rpc } satisfies DogFriendlinessRpcClient,
        'member-1',
        'place-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          eventKind: 'submitted',
          privateNote: 'Original note.',
          privateNoteClassification: 'subjective',
          occurredAt: '2026-07-12T09:00:00Z'
        },
        {
          eventKind: 'note_updated',
          privateNote: 'Edited note.',
          privateNoteClassification: 'inaccurate_info',
          occurredAt: '2026-07-12T09:05:00Z'
        }
      ]
    });
  });

  it('records a Moderator disposition for a Private Rating Note', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'disposition-1', occurred_at: '2026-07-12T09:00:00Z' }],
      error: null
    });

    await expect(
      recordRatingNoteDisposition(
        { rpc } satisfies DogFriendlinessRpcClient,
        'member-1',
        'place-1',
        'feedback_use_permitted',
        'Aggregated feedback may be shared once feedback-sharing ships.',
        'request-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: { id: 'disposition-1', occurredAt: '2026-07-12T09:00:00Z' }
    });
    expect(rpc).toHaveBeenCalledWith('record_rating_note_disposition', {
      requested_member_id: 'member-1',
      requested_place_id: 'place-1',
      disposition_kind: 'feedback_use_permitted',
      notes: 'Aggregated feedback may be shared once feedback-sharing ships.',
      command_request_id: 'request-1'
    });
  });

  it('lists recorded Moderator dispositions for a note', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'disposition-1',
          disposition_kind: 'escalated',
          notes: 'Needs follow-up.',
          moderator_id: 'moderator-1',
          occurred_at: '2026-07-12T09:00:00Z'
        }
      ],
      error: null
    });

    await expect(
      listModerationRatingNoteDispositions(
        { rpc } satisfies DogFriendlinessRpcClient,
        'member-1',
        'place-1'
      )
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          id: 'disposition-1',
          dispositionKind: 'escalated',
          notes: 'Needs follow-up.',
          moderatorId: 'moderator-1',
          occurredAt: '2026-07-12T09:00:00Z'
        }
      ]
    });
  });

  it.each([
    ['55006', 'conflict'],
    ['23505', 'conflict'],
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    [undefined, 'infrastructure_error']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(
      submitRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', scores, 'request-1')
    ).resolves.toEqual({ status });
  });

  it('returns infrastructure_error for a malformed submission row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });

    await expect(
      submitRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', scores, 'request-1')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('returns infrastructure_error when the adapter throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      submitRating({ rpc } satisfies DogFriendlinessRpcClient, 'place-1', scores, 'request-1')
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});

describe('Private Rating Note input parsing', () => {
  it('recognizes the three valid classification values and rejects everything else', () => {
    expect(isPrivateRatingNoteClassification('subjective')).toBe(true);
    expect(isPrivateRatingNoteClassification('inaccurate_info')).toBe(true);
    expect(isPrivateRatingNoteClassification('safety_concern')).toBe(true);
    expect(isPrivateRatingNoteClassification('business_quality')).toBe(false);
    expect(isPrivateRatingNoteClassification(undefined)).toBe(false);
  });

  it('reports no note-update intent when the fieldset was not rendered/touched', () => {
    const form = new FormData();
    form.set('privateRatingNote', 'This would be ignored');

    expect(readRatingNoteInput(form)).toEqual({ update: false });
  });

  it('reads an explicit note update with a forced classification', () => {
    const form = new FormData();
    form.set('noteFieldsetTouched', 'true');
    form.set('privateRatingNote', '  The signage was misleading.  ');
    form.set('privateRatingNoteClassification', 'inaccurate_info');

    expect(readRatingNoteInput(form)).toEqual({
      update: true,
      note: 'The signage was misleading.',
      classification: 'inaccurate_info'
    });
  });

  it('never defaults an invalid or missing classification to a valid one', () => {
    const form = new FormData();
    form.set('noteFieldsetTouched', 'true');
    form.set('privateRatingNote', 'Some text');
    form.set('privateRatingNoteClassification', 'not_a_real_category');

    expect(readRatingNoteInput(form)).toEqual({
      update: true,
      note: 'Some text',
      classification: null
    });
  });

  it('reads an explicit clear action regardless of stray textarea content', () => {
    const form = new FormData();
    form.set('noteFieldsetTouched', 'true');
    form.set('noteAction', 'clear');
    form.set('privateRatingNote', 'Leftover text that should be ignored');
    form.set('privateRatingNoteClassification', 'subjective');

    expect(readRatingNoteInput(form)).toEqual({ update: true, note: null, classification: null });
  });

  it('parses a valid Moderator disposition submission', () => {
    const form = new FormData();
    form.set('dispositionKind', 'escalated');
    form.set('dispositionNotes', 'Needs a follow-up call to the venue.');

    expect(parseRatingNoteDispositionFormData(form)).toEqual({
      ok: true,
      payload: { dispositionKind: 'escalated', notes: 'Needs a follow-up call to the venue.' }
    });
  });

  it('rejects a disposition submission with an invalid kind or blank notes', () => {
    const invalidKind = new FormData();
    invalidKind.set('dispositionKind', 'not_a_real_kind');
    invalidKind.set('dispositionNotes', 'Notes');
    expect(parseRatingNoteDispositionFormData(invalidKind)).toEqual({
      ok: false,
      error: 'incomplete'
    });

    const blankNotes = new FormData();
    blankNotes.set('dispositionKind', 'escalated');
    blankNotes.set('dispositionNotes', '   ');
    expect(parseRatingNoteDispositionFormData(blankNotes)).toEqual({
      ok: false,
      error: 'incomplete'
    });
  });
});
