import { describe, expect, it } from 'vitest';

import { computeDownscaledDimensions } from '$lib/place-media/downscale-image';

describe('computeDownscaledDimensions', () => {
  it('never enlarges an image already within the target edge', () => {
    expect(computeDownscaledDimensions({ width: 800, height: 600 }, 1600)).toEqual({
      width: 800,
      height: 600
    });
  });

  it('downscales a landscape image, preserving aspect ratio', () => {
    expect(computeDownscaledDimensions({ width: 3200, height: 2400 }, 1600)).toEqual({
      width: 1600,
      height: 1200
    });
  });

  it('downscales a portrait image by its longest edge', () => {
    expect(computeDownscaledDimensions({ width: 2400, height: 3200 }, 1600)).toEqual({
      width: 1200,
      height: 1600
    });
  });

  it('treats an exactly-at-the-limit image as already within bounds', () => {
    expect(computeDownscaledDimensions({ width: 1600, height: 900 }, 1600)).toEqual({
      width: 1600,
      height: 900
    });
  });

  it('never rounds a dimension down to zero for extreme aspect ratios', () => {
    const result = computeDownscaledDimensions({ width: 10000, height: 10 }, 1600);
    expect(result.width).toBe(1600);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('rejects non-positive source dimensions', () => {
    expect(() => computeDownscaledDimensions({ width: 0, height: 100 }, 1600)).toThrow(RangeError);
    expect(() => computeDownscaledDimensions({ width: 100, height: -1 }, 1600)).toThrow(RangeError);
  });

  it('rejects a non-positive target edge', () => {
    expect(() => computeDownscaledDimensions({ width: 100, height: 100 }, 0)).toThrow(RangeError);
  });
});
