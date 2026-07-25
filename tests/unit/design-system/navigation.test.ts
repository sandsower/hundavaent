import { describe, expect, it } from 'vitest';

import { shouldViewTransition } from '../../../src/lib/design-system/navigation';

const placeNavigation = {
  fromRouteId: '/[lang=lang]',
  toRouteId: '/[lang=lang]/about',
  prefersReducedMotion: false,
  supported: true
};

describe('view transition policy', () => {
  it('runs for member-facing navigations', () => {
    expect(shouldViewTransition(placeNavigation)).toBe(true);
  });

  it('never runs without browser support', () => {
    expect(shouldViewTransition({ ...placeNavigation, supported: false })).toBe(false);
  });

  it('never runs for Members who prefer reduced motion', () => {
    // The crossfade is browser-driven motion outside the token system, so the only correct
    // reduced-motion behaviour is to not start it at all.
    expect(shouldViewTransition({ ...placeNavigation, prefersReducedMotion: true })).toBe(false);
  });

  it('skips moderation in either direction', () => {
    // Every queue tab and work item in moderation is a real navigation; a crossfade per click
    // is choreography in a work-a-queue surface, the same reasoning that zeroes celebrate.
    expect(shouldViewTransition({ ...placeNavigation, toRouteId: '/[lang=lang]/moderation' })).toBe(
      false
    );
    expect(
      shouldViewTransition({
        ...placeNavigation,
        fromRouteId: '/[lang=lang]/moderation/places/new'
      })
    ).toBe(false);
  });

  it('stays out of navigations it cannot classify', () => {
    expect(shouldViewTransition({ ...placeNavigation, fromRouteId: null })).toBe(false);
    expect(shouldViewTransition({ ...placeNavigation, toRouteId: null })).toBe(false);
  });
});
