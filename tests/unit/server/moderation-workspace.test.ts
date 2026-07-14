import { describe, expect, it, vi } from 'vitest';

import {
  listModerationQueueSummary,
  type QueueSummaryRpcClient
} from '$server/moderation/queue-summary';

import {
  buildModerationWorkspaceContinuation,
  canonicalizeModerationWorkspaceQuery,
  defaultModerationWorkspaceQuery,
  moderationWorkspaceFilterIds,
  moderationWorkspaceQueueIds,
  parseModerationWorkspaceQuery,
  selectVisibleModerationItemId,
  serializeModerationWorkspaceQuery
} from '$server/moderation/workspace-query';

const suggestionId = '30000000-0000-4000-8000-000000000003';

describe('moderation workspace query state', () => {
  it.each(moderationWorkspaceQueueIds)('parses the supported %s queue identifier', (queue) => {
    const state = parseModerationWorkspaceQuery(new URLSearchParams({ queue, item: suggestionId }));

    expect(state).toEqual({
      queue,
      itemId: suggestionId,
      filters: ['actionable'],
      cursor: null,
      cursorTrail: [],
      decidedFieldId: null,
      selectLast: false
    });
  });

  it('defaults to Suggestions and accepts a selected Suggestion without an explicit queue', () => {
    expect(parseModerationWorkspaceQuery(new URLSearchParams({ item: suggestionId }))).toEqual({
      queue: 'suggestions',
      itemId: suggestionId,
      filters: ['actionable'],
      cursor: null,
      cursorTrail: [],
      decidedFieldId: null,
      selectLast: false
    });
  });

  it.each([
    '',
    'suggestion-1',
    '30000000-0000-0000-8000-000000000003',
    '30000000-0000-4000-0000-000000000003',
    '30000000-0000-4000-8000-00000000000z'
  ])('strips a malformed selected item UUID: %s', (item) => {
    expect(
      parseModerationWorkspaceQuery(new URLSearchParams({ queue: 'suggestions', item })).itemId
    ).toBeNull();
  });

  it('normalizes supported filters, removes duplicates, and retains a bounded opaque cursor', () => {
    const params = new URLSearchParams({ queue: 'suggestions', cursor: 'next_page-2.token_3~' });
    params.append('filter', 'priority');
    params.append('filter', 'actionable');
    params.append('filter', 'priority');
    params.append('filter', 'unsupported');
    params.append('filter', 'oldest');

    expect(parseModerationWorkspaceQuery(params)).toEqual({
      queue: 'suggestions',
      itemId: null,
      filters: [...moderationWorkspaceFilterIds],
      cursor: 'next_page-2.token_3~',
      cursorTrail: [],
      decidedFieldId: null,
      selectLast: false
    });
  });

  it.each(['cursor with spaces', `${'a'.repeat(256)}!`, ''])(
    'strips a malformed opaque cursor: %s',
    (cursor) => {
      expect(
        parseModerationWorkspaceQuery(new URLSearchParams({ queue: 'suggestions', cursor })).cursor
      ).toBeNull();
    }
  );

  it('clears dependent state when an explicit queue identifier is invalid', () => {
    const params = new URLSearchParams({
      queue: 'reports',
      item: suggestionId,
      filter: 'priority',
      cursor: 'next_page'
    });

    expect(parseModerationWorkspaceQuery(params)).toEqual(defaultModerationWorkspaceQuery);
  });

  it('serializes every queue item in a stable order', () => {
    const params = serializeModerationWorkspaceQuery({
      queue: 'candidate-places',
      itemId: suggestionId,
      filters: ['actionable'],
      cursor: 'candidate_page_2',
      cursorTrail: [null, 'candidate_page_1'],
      decidedFieldId: suggestionId,
      selectLast: true
    });

    expect(params.toString()).toBe(
      `queue=candidate-places&item=${suggestionId}&filter=actionable&cursor=candidate_page_2&back=first&back=candidate_page_1&select=last`
    );
  });

  it('canonicalizes unknown parameters, UUID casing, filters, and cursor validity', () => {
    const params = new URLSearchParams({
      cursor: 'bad cursor',
      item: suggestionId.toUpperCase(),
      queue: 'suggestions',
      ignored: 'value'
    });
    params.append('filter', 'oldest');
    params.append('filter', 'actionable');
    params.append('filter', 'oldest');

    expect(canonicalizeModerationWorkspaceQuery(params).toString()).toBe(
      `queue=suggestions&item=${suggestionId}&filter=actionable`
    );
  });

  it('round-trips canonical workspace state without drift', () => {
    const state = parseModerationWorkspaceQuery(
      new URLSearchParams(
        `queue=suggestions&item=${suggestionId}&filter=actionable&cursor=next_page&back=first&decided=${suggestionId}`
      )
    );

    expect(parseModerationWorkspaceQuery(serializeModerationWorkspaceQuery(state))).toEqual(state);
  });

  it('continues to the actual next item on the current queue page', () => {
    const formData = new FormData();
    formData.set('workspaceCursor', 'page_2');
    formData.append('workspaceBack', 'first');
    formData.set('workspaceNextItemId', '40000000-0000-4000-8000-000000000004');
    formData.set('workspaceNextCursor', 'page_3');

    expect(
      buildModerationWorkspaceContinuation('suggestions', suggestionId, true, formData)
    ).toEqual({
      queue: 'suggestions',
      itemId: '40000000-0000-4000-8000-000000000004',
      filters: ['actionable'],
      cursor: 'page_2',
      cursorTrail: [null],
      decidedFieldId: null,
      selectLast: false
    });
  });

  it('continues onto the next queue page after resolving its final visible item', () => {
    const formData = new FormData();
    formData.set('workspaceCursor', 'page_2');
    formData.append('workspaceBack', 'first');
    formData.set('workspaceNextCursor', 'page_3');

    expect(
      buildModerationWorkspaceContinuation('candidate-places', suggestionId, true, formData)
    ).toEqual({
      queue: 'candidate-places',
      itemId: null,
      filters: ['actionable'],
      cursor: 'page_3',
      cursorTrail: [null, 'page_2'],
      decidedFieldId: null,
      selectLast: false
    });
  });

  it('selects only visible items and supports adjacent previous-page selection', () => {
    const visible = [
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    ];

    expect(selectVisibleModerationItemId(suggestionId, visible, false)).toBe(visible[0]);
    expect(selectVisibleModerationItemId(null, visible, true)).toBe(visible[1]);
    expect(selectVisibleModerationItemId(visible[0], visible, true)).toBe(visible[0]);
  });
});

describe('moderation queue summary', () => {
  it('maps every implemented actionable queue count in workspace order', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { queue_id: 'suggestions', actionable_count: 3 },
        { queue_id: 'corrections-and-reports', actionable_count: 2 },
        { queue_id: 'candidate-places', actionable_count: 1 }
      ],
      error: null
    });

    await expect(
      listModerationQueueSummary({ rpc } satisfies QueueSummaryRpcClient)
    ).resolves.toEqual({
      status: 'success',
      value: [
        { queueId: 'suggestions', actionableCount: 3 },
        { queueId: 'corrections-and-reports', actionableCount: 2 },
        { queueId: 'candidate-places', actionableCount: 1 }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('list_moderation_queue_summary');
  });

  it.each([
    null,
    [],
    [
      { queue_id: 'suggestions', actionable_count: 1 },
      { queue_id: 'corrections-and-reports', actionable_count: 0 }
    ],
    [
      { queue_id: 'suggestions', actionable_count: 1 },
      { queue_id: 'corrections-and-reports', actionable_count: 0 },
      { queue_id: 'not-a-queue', actionable_count: 0 }
    ],
    [
      { queue_id: 'suggestions', actionable_count: 1 },
      { queue_id: 'suggestions', actionable_count: 2 },
      { queue_id: 'candidate-places', actionable_count: 0 }
    ],
    [
      { queue_id: 'suggestions', actionable_count: -1 },
      { queue_id: 'corrections-and-reports', actionable_count: 0 },
      { queue_id: 'candidate-places', actionable_count: 0 }
    ]
  ])('fails closed for malformed queue-summary data: %j', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });

    await expect(
      listModerationQueueSummary({ rpc } satisfies QueueSummaryRpcClient)
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });

  it('maps authorization errors and rejected requests without throwing', async () => {
    const forbiddenRpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });
    const rejectedRpc = vi.fn().mockRejectedValue(new Error('database offline'));

    await expect(
      listModerationQueueSummary({ rpc: forbiddenRpc } satisfies QueueSummaryRpcClient)
    ).resolves.toEqual({ status: 'forbidden' });
    await expect(
      listModerationQueueSummary({ rpc: rejectedRpc } satisfies QueueSummaryRpcClient)
    ).resolves.toEqual({ status: 'infrastructure_error' });
  });
});
