import { describe, expect, it, vi } from 'vitest';

const operations = vi.hoisted(() => ({
  executeModerationCandidateAction: vi.fn()
}));

vi.mock('$server/moderation/candidate-workspace', async (importOriginal) => ({
  ...(await importOriginal()),
  executeModerationCandidateAction: operations.executeModerationCandidateAction
}));

import { actions } from '../../../src/routes/[lang=lang]/moderation/+page.server';

const placeId = '70000000-0000-4000-8000-000000000001';

describe('primary moderation workspace candidate actions', () => {
  it('routes wheelchair accessibility updates and preserves the nonterminal workspace state', async () => {
    operations.executeModerationCandidateAction.mockResolvedValue({
      status: 'confirmed',
      terminal: false,
      effect: { kind: 'wheelchair_accessibility_updated' }
    });
    const formData = new FormData();
    formData.set('placeId', placeId);
    formData.set('expectedVersion', '3');
    formData.set('wheelchairAccessibility', 'accessible');
    const cookies = { set: vi.fn() };
    const action = actions.updateWheelchairAccessibility;

    expect(action).toBeTypeOf('function');
    await expect(
      action?.({
        cookies,
        locals: { supabase: { rpc: vi.fn() }, requestId: 'request-accessibility' },
        params: { lang: 'en' },
        request: { formData: vi.fn(async () => formData) },
        url: new URL(
          `http://localhost/en/moderation?queue=candidate-places&item=${placeId}&filter=actionable`
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: `/en/moderation?queue=candidate-places&item=${placeId}&filter=actionable`
    });

    expect(operations.executeModerationCandidateAction).toHaveBeenCalledWith(
      'updateWheelchairAccessibility',
      expect.objectContaining({
        placeId,
        requestId: 'request-accessibility',
        formData
      })
    );
    expect(cookies.set).toHaveBeenCalledWith(
      'moderation-workspace-notice',
      'candidate:wheelchair_accessibility_updated',
      expect.objectContaining({ path: '/en/moderation', httpOnly: true, sameSite: 'lax' })
    );
  });
});
