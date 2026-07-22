import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';

const mocks = vi.hoisted(() => ({
  executeSuggestion: vi.fn(),
  loadSuggestion: vi.fn(),
  executeCorrection: vi.fn(),
  loadCorrection: vi.fn(),
  executeCandidate: vi.fn(),
  executeCandidateDecision: vi.fn(),
  saveCandidateSection: vi.fn(),
  loadCandidate: vi.fn()
}));

vi.mock('$server/moderation/suggestion-workspace', () => ({
  executeModerationSuggestionAction: mocks.executeSuggestion,
  loadModerationSuggestionReview: mocks.loadSuggestion
}));

vi.mock('$server/moderation/correction-workspace', () => ({
  executeModerationCorrectionAction: mocks.executeCorrection,
  loadModerationCorrectionReview: mocks.loadCorrection
}));

vi.mock('$server/moderation/candidate-workspace', () => ({
  executeModerationCandidateAction: mocks.executeCandidate,
  executeCandidateDecision: mocks.executeCandidateDecision,
  saveCandidateDraftSection: mocks.saveCandidateSection,
  loadModerationCandidateReview: mocks.loadCandidate
}));

import {
  actions as suggestionActions,
  load as loadSuggestionDetail
} from '../../../src/routes/[lang=lang]/moderation/suggestions/[id]/+page.server';
import {
  actions as correctionActions,
  load as loadCorrectionDetail
} from '../../../src/routes/[lang=lang]/moderation/corrections-and-reports/[id]/+page.server';
import { actions as candidateActions } from '../../../src/routes/[lang=lang]/moderation/places/[id]/+page.server';

const itemId = '30000000-0000-4000-8000-000000000003';
const conflict = { status: 'failure', httpStatus: 409, error: 'conflict' } as const;

function actionEvent(path: string) {
  const url = new URL(`http://localhost${path}`);
  return {
    locals: { copy: catalogues.en, requestId: 'request-conflict', supabase: { rpc: vi.fn() } },
    params: { lang: 'en', id: itemId },
    request: new Request(url, { method: 'POST', body: new FormData() }),
    url
  };
}

describe('standalone moderation conflict refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [loadSuggestionDetail, mocks.loadSuggestion],
    [loadCorrectionDetail, mocks.loadCorrection]
  ] as const)('exposes direct-route draft save feedback', async (load, loadReview) => {
    loadReview.mockResolvedValue({ status: 'success', value: { resolved: false } });
    const url = new URL(`http://localhost/en/moderation/detail/${itemId}?draft=saved`);

    const result = await load({
      locals: { copy: catalogues.en, requestId: 'request-load', supabase: { rpc: vi.fn() } },
      params: { lang: 'en', id: itemId },
      url
    } as never);

    expect(result).toMatchObject({ draftSaved: true });
  });

  it('returns the fresh Suggestion review with a conflict failure', async () => {
    const conflictReview = { suggestion: { suggestionId: itemId, itemVersion: 2 } };
    mocks.executeSuggestion.mockResolvedValue(conflict);
    mocks.loadSuggestion.mockResolvedValue({ status: 'success', value: conflictReview });

    const result = await suggestionActions.decideSuggestion!(
      actionEvent(`/en/moderation/suggestions/${itemId}?resolved=accepted`) as never
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        error: 'conflict',
        conflict: true,
        conflictReview,
        conflictRefreshFailed: false
      }
    });
    expect(mocks.loadSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      itemId,
      new URLSearchParams('resolved=accepted')
    );
  });

  it('returns the fresh Correction review with a conflict failure', async () => {
    const conflictReview = { flag: { flagId: itemId, itemVersion: 3 } };
    mocks.executeCorrection.mockResolvedValue(conflict);
    mocks.loadCorrection.mockResolvedValue({ status: 'success', value: conflictReview });

    const result = await correctionActions.decideCorrection!(
      actionEvent(`/en/moderation/corrections-and-reports/${itemId}`) as never
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        error: 'conflict',
        conflict: true,
        conflictReview,
        conflictRefreshFailed: false
      }
    });
    expect(mocks.loadCorrection).toHaveBeenCalledWith(
      expect.anything(),
      itemId,
      new URLSearchParams()
    );
  });

  it.each([
    ['saveCandidateSection', mocks.saveCandidateSection],
    ['decideCandidate', mocks.executeCandidateDecision],
    ['publish', mocks.executeCandidate]
  ] as const)('returns the fresh Candidate review for %s conflicts', async (action, execute) => {
    const conflictReview = { review: { placeId: itemId, itemVersion: 4 } };
    execute.mockResolvedValue(conflict);
    mocks.loadCandidate.mockResolvedValue({ status: 'success', value: conflictReview });

    const result = await candidateActions[action]!(
      actionEvent(`/en/moderation/places/${itemId}`) as never
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        action,
        success: false,
        conflict: true,
        conflictReview,
        conflictRefreshFailed: false
      }
    });
  });

  it('marks a failed conflict refresh without replacing the stale review', async () => {
    mocks.executeSuggestion.mockResolvedValue(conflict);
    mocks.loadSuggestion.mockResolvedValue({ status: 'infrastructure_error' });

    const result = await suggestionActions.decideSuggestion!(
      actionEvent(`/en/moderation/suggestions/${itemId}`) as never
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        error: 'conflict',
        conflict: true,
        conflictRefreshFailed: true
      }
    });
    expect((result as { data: Record<string, unknown> }).data).not.toHaveProperty('conflictReview');
  });
});
