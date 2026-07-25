/**
 * Canonical motion durations for the JavaScript that cannot read the CSS custom properties in
 * `tokens.css`: maplibre's camera, and cleanup timers for animations whose `animationend` never
 * arrives reliably once reduced motion collapses their duration to zero.
 *
 * These values mirror `tokens.css` exactly. `tests/component/motion-tokens.browser.test.ts`
 * fails on any drift between the two, because motion that is meant to read as a single gesture
 * desynchronises the moment the CSS half and the JavaScript half disagree.
 *
 * The two families split by what reduced motion must suppress, not by CSS property: motion
 * covers things that move, fade covers appearance changes that stay put.
 */

export const motionDurationsMs = {
  stagger: 50,
  instant: 120,
  quick: 200,
  considered: 320,
  traverse: 450,
  celebrate: 520
} as const;

export const fadeDurationsMs = {
  quick: 160,
  considered: 260
} as const;

export const operationsMotionDurationsMs = {
  stagger: 30,
  instant: 80,
  quick: 120,
  considered: 180,
  traverse: 240,
  celebrate: 0
} as const satisfies Record<MotionStep, number>;

export const operationsFadeDurationsMs = {
  quick: 120,
  considered: 160
} as const satisfies Record<FadeStep, number>;

export type MotionStep = keyof typeof motionDurationsMs;
export type FadeStep = keyof typeof fadeDurationsMs;

/**
 * Control points behind the `--hv-ease-*` tokens, for motion that runs outside CSS: maplibre's
 * camera takes an easing function, not a timing-function string. The browser parity test holds
 * these to the exact `cubic-bezier(...)` text in `tokens.css`.
 */
export const motionEasings = {
  settle: [0.2, 0.85, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  overshoot: [0.2, 0.9, 0.3, 1.25]
} as const;

export type MotionEasing = keyof typeof motionEasings;

/**
 * Evaluates a CSS cubic-bezier curve as a progress function. The curve is parametric, so the
 * input progress is first resolved to the curve parameter through the x axis (binary search;
 * x(u) is monotonic for CSS-valid control points), then mapped through the y axis.
 */
export function cubicBezierEasing(
  points: readonly [number, number, number, number]
): (t: number) => number {
  const [x1, y1, x2, y2] = points;
  const axis = (a: number, b: number) => (u: number) => {
    const inverse = 1 - u;
    return 3 * inverse * inverse * u * a + 3 * inverse * u * u * b + u * u * u;
  };
  const x = axis(x1, x2);
  const y = axis(y1, y2);
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lower = 0;
    let upper = 1;
    let u = t;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      if (x(u) < t) lower = u;
      else upper = u;
      u = (lower + upper) / 2;
    }
    return y(u);
  };
}
