import { describe, expect, it, vi } from 'vitest';

import { _createPendingIntent } from '../../../src/routes/[lang=lang]/auth/start/+server';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe('authentication start continuation', () => {
  it('does not create an intent for a generic header sign-in', async () => {
    const rpc = vi.fn();
    await expect(_createPendingIntent({ rpc } as never, form({}))).resolves.toEqual({
      status: 'none',
      token: null
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('stores only the bounded Favorite intent through the database capability', async () => {
    const rpc = vi.fn(async () => ({ data: 'opaque-random-token', error: null }));
    await expect(
      _createPendingIntent(
        { rpc } as never,
        form({ intentAction: 'favourite', placeId: '30000000-0000-4000-8000-000000000003' })
      )
    ).resolves.toEqual({ status: 'ready', token: 'opaque-random-token' });
    expect(rpc).toHaveBeenCalledWith('create_auth_pending_intent', {
      requested_action: 'favourite',
      requested_place_id: '30000000-0000-4000-8000-000000000003',
      requested_overall_rating: null
    });
  });

  it('rejects incomplete or out-of-range rating intents before persistence', async () => {
    const rpc = vi.fn();
    await expect(
      _createPendingIntent(
        { rpc } as never,
        form({ intentAction: 'rating', placeId: 'place-1', overallRating: '6' })
      )
    ).resolves.toEqual({ status: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reuses only a still-valid opaque continuation after provider recovery', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          action: 'favourite',
          place_id: 'place-1',
          place_name: 'Brikk',
          overall_rating: null
        }
      ],
      error: null
    }));
    const token = 'opaque-continuation-token-that-is-long-enough';
    await expect(
      _createPendingIntent({ rpc } as never, form({ pendingIntentToken: token }))
    ).resolves.toEqual({ status: 'ready', token });
    expect(rpc).toHaveBeenCalledWith('get_auth_pending_intent', {
      pending_token: token,
      requested_locale: 'en'
    });
  });
});
