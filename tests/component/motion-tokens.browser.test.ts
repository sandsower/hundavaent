import { expect, test } from 'vitest';

import '../../src/app.css';
import {
  fadeDurationsMs,
  motionDurationsMs,
  motionEasings,
  operationsFadeDurationsMs,
  operationsMotionDurationsMs
} from '../../src/lib/design-system/motion';

function milliseconds(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed);
  return Number.parseFloat(trimmed) * 1_000;
}

function withModes<T>(inspect: (place: CSSStyleDeclaration, operations: CSSStyleDeclaration) => T) {
  const placeMode = document.createElement('section');
  placeMode.dataset.uiMode = 'place';
  const operationsMode = document.createElement('section');
  operationsMode.dataset.uiMode = 'operations';
  document.body.append(placeMode, operationsMode);

  try {
    return inspect(getComputedStyle(placeMode), getComputedStyle(operationsMode));
  } finally {
    placeMode.remove();
    operationsMode.remove();
  }
}

test('both motion families resolve in place and operations modes', () => {
  withModes((place, operations) => {
    for (const step of Object.keys(motionDurationsMs)) {
      expect(place.getPropertyValue(`--hv-motion-${step}`).trim()).not.toBe('');
      expect(operations.getPropertyValue(`--hv-motion-${step}`).trim()).not.toBe('');
    }
    for (const step of Object.keys(fadeDurationsMs)) {
      expect(place.getPropertyValue(`--hv-fade-${step}`).trim()).not.toBe('');
      expect(operations.getPropertyValue(`--hv-fade-${step}`).trim()).not.toBe('');
    }
    for (const easing of Object.keys(motionEasings)) {
      expect(place.getPropertyValue(`--hv-ease-${easing}`).trim()).toContain('cubic-bezier');
    }
  });
});

test('operations mode keeps the same motion language at a faster tempo', () => {
  withModes((place, operations) => {
    // Moderators work a queue. Every step is shorter, and celebration is removed outright.
    // Every step except celebrate, which is asserted separately below: operations removes it
    // outright rather than shortening it.
    for (const step of Object.keys(motionDurationsMs).filter((step) => step !== 'celebrate')) {
      expect(milliseconds(operations.getPropertyValue(`--hv-motion-${step}`))).toBeLessThan(
        milliseconds(place.getPropertyValue(`--hv-motion-${step}`))
      );
    }
    for (const step of Object.keys(fadeDurationsMs)) {
      expect(milliseconds(operations.getPropertyValue(`--hv-fade-${step}`))).toBeLessThan(
        milliseconds(place.getPropertyValue(`--hv-fade-${step}`))
      );
    }
    expect(milliseconds(operations.getPropertyValue('--hv-motion-celebrate'))).toBe(0);
  });
});

test('motion.ts stays in step with the resolved token values', () => {
  // maplibre's camera and animation cleanup timers cannot read custom properties, so the
  // numbers live in TypeScript too. Drift between the two would desynchronise motion that is
  // meant to read as one gesture.
  withModes((place, operations) => {
    for (const [step, duration] of Object.entries(motionDurationsMs)) {
      expect(milliseconds(place.getPropertyValue(`--hv-motion-${step}`))).toBe(duration);
    }
    for (const [step, duration] of Object.entries(fadeDurationsMs)) {
      expect(milliseconds(place.getPropertyValue(`--hv-fade-${step}`))).toBe(duration);
    }
    for (const [step, duration] of Object.entries(operationsMotionDurationsMs)) {
      expect(milliseconds(operations.getPropertyValue(`--hv-motion-${step}`))).toBe(duration);
    }
    for (const [step, duration] of Object.entries(operationsFadeDurationsMs)) {
      expect(milliseconds(operations.getPropertyValue(`--hv-fade-${step}`))).toBe(duration);
    }
  });
});

test('easing control points stay in step with the CSS easing tokens', () => {
  // The camera easing runs as a JavaScript function built from these control points; a CSS-side
  // curve change that skipped motion.ts would leave the camera settling on a different curve
  // than the pin and card it is meant to move with.
  withModes((place) => {
    for (const [easing, points] of Object.entries(motionEasings)) {
      expect(place.getPropertyValue(`--hv-ease-${easing}`).trim()).toBe(
        `cubic-bezier(${points.join(', ')})`
      );
    }
  });
});
