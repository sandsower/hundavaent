import { describe, expect, it } from 'vitest';

import { cubicBezierEasing, motionEasings } from '../../../src/lib/design-system/motion';

describe('cubic bezier easing', () => {
  it('pins the endpoints for every easing', () => {
    for (const points of Object.values(motionEasings)) {
      const easing = cubicBezierEasing(points);
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
      expect(easing(-0.5)).toBe(0);
      expect(easing(1.5)).toBe(1);
    }
  });

  it('reproduces a linear curve', () => {
    const easing = cubicBezierEasing([1 / 3, 1 / 3, 2 / 3, 2 / 3]);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(easing(t)).toBeCloseTo(t, 5);
    }
  });

  it('settle leads and exit trails the diagonal', () => {
    // Settle is an ease-out shape (fast arrival, soft landing); exit is an ease-in shape.
    expect(cubicBezierEasing(motionEasings.settle)(0.5)).toBeGreaterThan(0.5);
    expect(cubicBezierEasing(motionEasings.exit)(0.5)).toBeLessThan(0.5);
  });

  it('overshoot passes beyond its target before settling', () => {
    const easing = cubicBezierEasing(motionEasings.overshoot);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easing((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
  });
});
