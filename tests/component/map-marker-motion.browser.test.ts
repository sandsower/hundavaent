import { afterEach, expect, test } from 'vitest';

import '../../src/app.css';
import { markerPinSvg } from '../../src/lib/map/marker-icons';

/**
 * The map adapter builds marker DOM outside Svelte, so these tests build the same DOM and hold
 * the stylesheet to the marker motion contract: selection state lands in one frame, only
 * transforms take time, and every duration resolves from a motion token.
 */
function createMarker(selected = false): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = selected ? 'hundavaent-marker selected' : 'hundavaent-marker';
  element.innerHTML = markerPinSvg('food_drink');
  const chip = document.createElement('span');
  chip.className = 'marker-label';
  chip.textContent = 'Published Place';
  element.append(chip);
  document.body.append(element);
  return element;
}

afterEach(() => {
  for (const marker of document.querySelectorAll('.hundavaent-marker')) marker.remove();
});

test('selection colour and stroke weight land in one frame', () => {
  const selected = createMarker(true);
  const idle = createMarker(false);
  const selectedBody = getComputedStyle(selected.querySelector('.pin-body') as Element);
  const idleBody = getComputedStyle(idle.querySelector('.pin-body') as Element);

  // stroke-width is not compositor-only; a transition here would repaint every frame.
  expect(selectedBody.strokeWidth).toBe('5px');
  expect(idleBody.strokeWidth).toBe('3px');
  expect(selectedBody.transitionDuration).toBe('0s');
});

test('the settle punch rides the motion token from the pin base', () => {
  const selected = createMarker(true);
  const idle = createMarker(false);
  const selectedPin = selected.querySelector('.pin') as Element;
  const selectedStyles = getComputedStyle(selectedPin);

  expect(selectedStyles.animationName).toBe('hv-pin-settle');
  // --hv-motion-quick resolves to 200ms outside reduced motion.
  expect(selectedStyles.animationDuration).toBe('0.2s');
  expect(getComputedStyle(idle.querySelector('.pin') as Element).animationName).toBe('none');

  // The tail must stay planted on the coordinate while the pin settles.
  const rect = selectedPin.getBoundingClientRect();
  const [originX, originY] = selectedStyles.transformOrigin.split(' ').map(Number.parseFloat);
  expect(originX).toBeCloseTo(rect.width / 2, 0);
  expect(originY).toBeCloseTo(rect.height, 0);
});

test('the name label hides by visibility and moves without fading', () => {
  const marker = createMarker(false);
  const label = getComputedStyle(marker.querySelector('.marker-label') as Element);

  // Text never rides an opacity fade: the label arrives at full contrast and moves into place.
  expect(label.display).not.toBe('none');
  expect(label.visibility).toBe('hidden');
  expect(label.opacity).toBe('1');
  expect(label.transitionProperty).toBe('transform');
  expect(label.transitionDuration).toBe('0.2s');
  expect(label.transform).not.toBe('none');
});
