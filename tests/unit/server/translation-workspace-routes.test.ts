import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
  env: {
    TRANSLATION_WORKSPACE_PASSWORD: 'shared-password',
    TRANSLATION_SESSION_SECRET: 'session-secret-with-enough-entropy',
    TRANSLATION_DATABASE_SECRET: 'database-secret-with-enough-entropy'
  }
}));

import { actions as historyActions } from '../../../src/routes/translations/(workspace)/history/+page.server';
import { actions as reviewActions } from '../../../src/routes/translations/(workspace)/review/+page.server';

function signedOutEvent(pathname: string, fields: Record<string, string>) {
  const rpc = vi.fn();
  const body = new URLSearchParams(fields);
  return {
    event: {
      cookies: { get: vi.fn().mockReturnValue(undefined) },
      locals: { requestId: 'request-direct-action', supabase: { rpc } },
      request: new Request(`https://hundavaent.is${pathname}`, { method: 'POST', body }),
      url: new URL(`https://hundavaent.is${pathname}`)
    },
    rpc
  };
}

describe('translation protected actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects direct unauthenticated source readiness before any RPC', async () => {
    const { event, rpc } = signedOutEvent('/translations/review?/ready', {
      expectedRevision: '4',
      expectedDraftGeneration: '9'
    });
    await expect(reviewActions.ready!(event as never)).rejects.toMatchObject({ status: 303 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('redirects a direct unauthenticated restore before any RPC', async () => {
    const { event, rpc } = signedOutEvent('/translations/history?/restore', {
      targetRevision: '2',
      expectedRevision: '4',
      confirm: 'restore'
    });
    await expect(historyActions.restore!(event as never)).rejects.toMatchObject({ status: 303 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
