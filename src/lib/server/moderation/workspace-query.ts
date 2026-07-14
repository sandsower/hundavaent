export const moderationWorkspaceQueueIds = [
  'suggestions',
  'corrections-and-reports',
  'candidate-places'
] as const;

export type ModerationWorkspaceQueueId = (typeof moderationWorkspaceQueueIds)[number];

export const moderationWorkspaceFilterIds = ['actionable'] as const;

export type ModerationWorkspaceFilterId = (typeof moderationWorkspaceFilterIds)[number];

export interface ModerationWorkspaceQuery {
  readonly queue: ModerationWorkspaceQueueId;
  readonly itemId: string | null;
  readonly filters: readonly ModerationWorkspaceFilterId[];
  readonly cursor: string | null;
  readonly cursorTrail: readonly (string | null)[];
  readonly decidedFieldId: string | null;
  readonly selectLast: boolean;
}

export const defaultModerationWorkspaceQuery: ModerationWorkspaceQuery = Object.freeze({
  queue: 'suggestions',
  itemId: null,
  filters: Object.freeze(['actionable'] as const),
  cursor: null,
  cursorTrail: Object.freeze([]),
  decidedFieldId: null,
  selectLast: false
});

export function parseModerationWorkspaceQuery(params: URLSearchParams): ModerationWorkspaceQuery {
  const requestedQueue = params.get('queue');
  if (requestedQueue !== null && !isModerationWorkspaceQueueId(requestedQueue)) {
    return copyDefaultQuery();
  }

  const queue = requestedQueue ?? defaultModerationWorkspaceQuery.queue;
  const paginated = isPaginatedQueue(queue);

  return {
    queue,
    itemId: normalizeUuid(params.get('item')),
    filters: normalizeFilters(params.getAll('filter')),
    cursor: paginated ? normalizeCursor(params.get('cursor')) : null,
    cursorTrail: paginated ? normalizeCursorTrail(params.getAll('back')) : [],
    decidedFieldId: null,
    selectLast: paginated && params.get('select') === 'last'
  };
}

export function serializeModerationWorkspaceQuery(
  state: ModerationWorkspaceQuery
): URLSearchParams {
  const params = new URLSearchParams();
  if (!isModerationWorkspaceQueueId(state.queue)) {
    return serializeModerationWorkspaceQuery(defaultModerationWorkspaceQuery);
  }

  params.set('queue', state.queue);

  const itemId = normalizeUuid(state.itemId);
  if (itemId) params.set('item', itemId);

  const filters = normalizeFilters(Array.isArray(state.filters) ? state.filters : []);
  for (const filter of filters) params.append('filter', filter);

  if (isPaginatedQueue(state.queue)) {
    const cursor = normalizeCursor(state.cursor);
    if (cursor) params.set('cursor', cursor);

    for (const previousCursor of normalizeCursorTrail(state.cursorTrail)) {
      params.append('back', previousCursor ?? firstPageToken);
    }
    if (state.selectLast) params.set('select', 'last');
  }

  return params;
}

export function canonicalizeModerationWorkspaceQuery(params: URLSearchParams): URLSearchParams {
  return serializeModerationWorkspaceQuery(parseModerationWorkspaceQuery(params));
}

export function buildModerationWorkspaceContinuation(
  queue: ModerationWorkspaceQueueId,
  currentItemId: string,
  terminal: boolean,
  formData: FormData,
  decidedFieldId: string | null = null
): ModerationWorkspaceQuery {
  const params = new URLSearchParams();
  params.set('queue', queue);
  params.append('filter', 'actionable');

  const currentCursor = String(formData.get('workspaceCursor') ?? '').trim();
  if (currentCursor) params.set('cursor', currentCursor);
  for (const previousCursor of formData.getAll('workspaceBack')) {
    params.append('back', String(previousCursor));
  }

  if (!terminal) {
    params.set('item', currentItemId);
    if (decidedFieldId) params.set('decided', decidedFieldId);
    return parseModerationWorkspaceQuery(params);
  }

  const nextItemId = String(formData.get('workspaceNextItemId') ?? '')
    .trim()
    .toLowerCase();
  if (uuidPattern.test(nextItemId)) {
    params.set('item', nextItemId);
    return parseModerationWorkspaceQuery(params);
  }

  const nextCursor = String(formData.get('workspaceNextCursor') ?? '').trim();
  if (nextCursor) {
    params.set('cursor', nextCursor);
    params.append('back', currentCursor || firstPageToken);
  }

  return parseModerationWorkspaceQuery(params);
}

export function isModerationWorkspaceQueueId(value: string): value is ModerationWorkspaceQueueId {
  return moderationWorkspaceQueueIds.some((queue) => queue === value);
}

export function selectVisibleModerationItemId(
  requestedItemId: string | null,
  visibleItemIds: readonly string[],
  selectLast: boolean
): string | null {
  if (requestedItemId && visibleItemIds.includes(requestedItemId)) return requestedItemId;
  return (selectLast ? visibleItemIds.at(-1) : visibleItemIds[0]) ?? null;
}

function copyDefaultQuery(): ModerationWorkspaceQuery {
  return {
    ...defaultModerationWorkspaceQuery,
    filters: [...defaultModerationWorkspaceQuery.filters],
    cursorTrail: []
  };
}

function normalizeFilters(values: readonly string[]): ModerationWorkspaceFilterId[] {
  const requested = new Set(values);
  const normalized = moderationWorkspaceFilterIds.filter((filter) => requested.has(filter));

  return normalized.length > 0 ? [...normalized] : [...defaultModerationWorkspaceQuery.filters];
}

function normalizeUuid(value: string | null): string | null {
  return value && uuidPattern.test(value) ? value.toLowerCase() : null;
}

function normalizeCursor(value: string | null): string | null {
  return value && opaqueCursorPattern.test(value) ? value : null;
}

function normalizeCursorTrail(values: readonly (string | null)[]): (string | null)[] {
  return values.slice(-maximumCursorTrailLength).flatMap((value) => {
    if (value === firstPageToken || value === null) return [null];
    const cursor = normalizeCursor(value);
    return cursor ? [cursor] : [];
  });
}

function isPaginatedQueue(queue: ModerationWorkspaceQueueId): boolean {
  return (
    queue === 'suggestions' || queue === 'corrections-and-reports' || queue === 'candidate-places'
  );
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaqueCursorPattern = /^[A-Za-z0-9._~-]{1,256}$/;
const firstPageToken = 'first';
const maximumCursorTrailLength = 50;
