import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  publishDeferredFavouriteRecognition,
  publishWeeklyRhythmInvalidation,
  subscribeToDeferredFavouriteRecognition,
  subscribeToWeeklyRhythmInvalidation,
  weeklyRhythmChannelName,
  weeklyRhythmStorageKey
} from '$lib/member-activity/client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('weekly rhythm cross-tab invalidation', () => {
  it('routes deferred recognition to one presentation target in the same tab', () => {
    const listRecognition = vi.fn();
    const selectedRecognition = vi.fn();
    const placeId = '30000000-0000-4000-8000-000000000003';
    const stopList = subscribeToDeferredFavouriteRecognition(listRecognition, placeId, 'list');
    const stopSelected = subscribeToDeferredFavouriteRecognition(
      selectedRecognition,
      placeId,
      'selected'
    );

    publishDeferredFavouriteRecognition(placeId, 'selected', {
      action: 'favourite',
      recognized: true,
      firstTimeForPlace: true,
      activatedCurrentWeek: true,
      currentWeek: {
        startsOn: '2026-07-20',
        endsOn: '2026-07-26',
        active: true
      }
    });

    expect(selectedRecognition).toHaveBeenCalledOnce();
    expect(listRecognition).not.toHaveBeenCalled();
    stopList();
    stopSelected();
  });

  it('publishes control metadata without any activity or week payload', () => {
    const posted: unknown[] = [];
    class RecordingChannel {
      constructor(readonly name: string) {}
      postMessage(value: unknown) {
        posted.push(value);
      }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', RecordingChannel);

    publishWeeklyRhythmInvalidation();

    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual({
      type: 'invalidate',
      sourceId: expect.any(String)
    });
    expect(JSON.stringify(posted[0])).not.toMatch(/active|week|start|end/i);
  });

  it('accepts only payload-free invalidations from another browser context', async () => {
    const invalidate = vi.fn();
    const stop = subscribeToWeeklyRhythmInvalidation(invalidate);
    const external = new BroadcastChannel(weeklyRhythmChannelName);

    try {
      external.postMessage({
        type: 'invalidate',
        sourceId: 'external-tab',
        active: true
      });
      external.postMessage({ type: 'invalidate', sourceId: 'external-tab' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(invalidate).toHaveBeenCalledOnce();
    } finally {
      stop();
      external.close();
    }
  });

  it('uses a storage event fallback when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const invalidate = vi.fn();
    const stop = subscribeToWeeklyRhythmInvalidation(invalidate);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: weeklyRhythmStorageKey,
        newValue: 'external-tab'
      })
    );

    expect(invalidate).toHaveBeenCalledOnce();
    stop();
  });

  it('falls through to storage when constructing BroadcastChannel fails', () => {
    class ThrowingChannel {
      constructor() {
        throw new Error('BroadcastChannel is blocked');
      }
    }
    vi.stubGlobal('BroadcastChannel', ThrowingChannel);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    publishWeeklyRhythmInvalidation();

    expect(setItem).toHaveBeenCalledWith(weeklyRhythmStorageKey, expect.any(String));
  });

  it('keeps the storage subscription when constructing BroadcastChannel fails', () => {
    class ThrowingChannel {
      constructor() {
        throw new Error('BroadcastChannel is blocked');
      }
    }
    vi.stubGlobal('BroadcastChannel', ThrowingChannel);
    const invalidate = vi.fn();
    const stop = subscribeToWeeklyRhythmInvalidation(invalidate);

    window.dispatchEvent(new StorageEvent('storage', { key: weeklyRhythmStorageKey }));

    expect(invalidate).toHaveBeenCalledOnce();
    stop();
  });
});
