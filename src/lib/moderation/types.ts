import type { Snippet } from 'svelte';

import type { Catalogue } from '$i18n';

export const moderationQueueIds = [
  'suggestions',
  'corrections-and-reports',
  'candidate-places'
] as const;

export type ModerationQueueId = (typeof moderationQueueIds)[number];

export const moderationFilterIds = ['actionable', 'deferred', 'resolved'] as const;

export type ModerationFilterId = (typeof moderationFilterIds)[number];

export interface ModerationQueueSummary {
  readonly id: ModerationQueueId;
  readonly count: number;
}

export interface ModerationWorkItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly statusLabel: string;
  readonly meta: string;
  readonly priority?: boolean;
  readonly priorityLabel?: string;
}

/**
 * A Place holding Member photos, ready to render as a link into the media surface that already
 * reviews them. Not a queue item: there is no cursor, no filter and no decision here, only a way
 * to find the Place.
 */
export interface ModerationPendingPhotoEntry {
  readonly placeId: string;
  readonly title: string;
  readonly meta: string;
  readonly href: string;
}

export type ModerationReadinessState = 'ready' | 'attention' | 'blocked';

export type ModerationReviewSectionState = 'complete' | 'warning' | 'blocking';

export interface ModerationReviewIssue {
  readonly sectionId: string;
  readonly label: string;
  readonly severity: Exclude<ModerationReviewSectionState, 'complete'>;
}

export interface ModerationWorkspaceProps {
  copy: Catalogue;
  baseHref: string;
  queues: readonly ModerationQueueSummary[];
  activeQueueId: ModerationQueueId;
  items: readonly ModerationWorkItem[];
  selectedItemId: string | null;
  filters: readonly ModerationFilterId[];
  cursor: string | null;
  cursorTrail: readonly (string | null)[];
  nextCursor: string | null;
  hasPrevious: boolean;
  pendingPhotoPlaces?: readonly ModerationPendingPhotoEntry[];
  statusMessage?: string;
  errorMessage?: string | null;
  reviewErrorMessage?: string | null;
  actionsDisabled?: boolean;
  reviewDisabled?: boolean;
  showDecisionDock?: boolean;
  decisionHint?: string | null;
  focusTargetId?: string | null;
  reviewContent?: Snippet;
  decisionContent?: Snippet;
}

interface WorkspaceHrefState {
  queue: ModerationQueueId;
  itemId?: string | null;
  filters?: readonly ModerationFilterId[];
  cursor?: string | null;
  cursorTrail?: readonly (string | null)[];
  selectLast?: boolean;
}

export function buildModerationWorkspaceHref(
  baseHref: string,
  {
    queue,
    itemId = null,
    filters = ['actionable'],
    cursor = null,
    cursorTrail = [],
    selectLast = false
  }: WorkspaceHrefState
): string {
  const params = new URLSearchParams();
  params.set('queue', queue);
  if (itemId) params.set('item', itemId);

  const requested = new Set(filters);
  const normalized = moderationFilterIds.filter((filter) => requested.has(filter));
  for (const filter of normalized.length > 0 ? normalized : ['actionable']) {
    params.append('filter', filter);
  }

  const paginated =
    queue === 'suggestions' || queue === 'corrections-and-reports' || queue === 'candidate-places';
  if (paginated) {
    if (cursor) params.set('cursor', cursor);
    for (const previousCursor of cursorTrail) {
      params.append('back', previousCursor ?? 'first');
    }
    if (selectLast) params.set('select', 'last');
  }
  return `${baseHref}?${params.toString()}`;
}
