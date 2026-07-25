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
  instant: 120,
  quick: 200,
  considered: 320,
  celebrate: 520
} as const;

export const fadeDurationsMs = {
  quick: 160,
  considered: 260
} as const;

export const operationsMotionDurationsMs = {
  instant: 80,
  quick: 120,
  considered: 180,
  celebrate: 0
} as const;

export const operationsFadeDurationsMs = {
  quick: 120,
  considered: 160
} as const;

export type MotionStep = keyof typeof motionDurationsMs;
export type FadeStep = keyof typeof fadeDurationsMs;
