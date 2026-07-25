import { afterEach, describe, expect, it, vi } from 'vitest';

import { authRequestEventName, isAuthRequest, requestAuthentication } from '$lib/auth/controller';

afterEach(() => vi.unstubAllGlobals());

describe('authentication controller', () => {
  it('accepts only complete supported authentication requests', () => {
    expect(isAuthRequest({ origin: 'header' })).toBe(true);
    expect(
      isAuthRequest({
        origin: 'favourite',
        intent: { action: 'favourite', placeId: 'place-1', placeName: 'Brikk' }
      })
    ).toBe(true);
    expect(
      isAuthRequest({
        origin: 'rating',
        intent: { action: 'rating', placeId: 'place-1', placeName: 'Brikk', overallRating: 6 }
      })
    ).toBe(false);
    expect(isAuthRequest({ origin: 'favourite' })).toBe(false);
  });

  it('accepts an intent-less contribution request, because contribution never defers intent', () => {
    expect(isAuthRequest({ origin: 'contribution' })).toBe(true);
    expect(isAuthRequest({ origin: 'contribution', continuationToken: 'x'.repeat(32) })).toBe(
      false
    );
    expect(
      isAuthRequest({
        origin: 'contribution',
        intent: { action: 'favourite', placeId: 'place-1' }
      })
    ).toBe(false);
  });

  it('publishes a typed request without retaining unrelated user data', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    requestAuthentication({
      origin: 'favourite',
      intent: { action: 'favourite', placeId: 'place-1', placeName: 'Brikk' }
    });

    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(authRequestEventName);
    expect(event.detail).toEqual({
      origin: 'favourite',
      intent: { action: 'favourite', placeId: 'place-1', placeName: 'Brikk' }
    });
  });
});
