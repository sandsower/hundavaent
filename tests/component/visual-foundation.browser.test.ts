import { expect, test } from 'vitest';

import '../../src/app.css';
import { emptyMapLibreStyle } from '../../src/lib/map/maplibre-adapter';

test('the visual foundation is deterministic across browser hosts', async () => {
  const loadedInterFaces = await document.fonts.load(
    '400 16px "Inter Variable"',
    'Hundavænt staður'
  );
  const loadedSourceSerifFaces = await document.fonts.load(
    '600 24px "Source Serif 4 Variable"',
    'Hundavænt staður'
  );
  await document.fonts.ready;

  const interFaces = [...document.fonts].filter(
    (face) => face.family.replaceAll(/["']/g, '') === 'Inter Variable'
  );
  const sourceSerifFaces = [...document.fonts].filter(
    (face) => face.family.replaceAll(/["']/g, '') === 'Source Serif 4 Variable'
  );

  expect(interFaces.length).toBeGreaterThan(0);
  expect(loadedInterFaces.length).toBeGreaterThan(0);
  expect(loadedInterFaces.every((face) => face.status === 'loaded')).toBe(true);
  expect(sourceSerifFaces.length).toBeGreaterThan(0);
  expect(loadedSourceSerifFaces.length).toBeGreaterThan(0);
  expect(loadedSourceSerifFaces.every((face) => face.status === 'loaded')).toBe(true);
  expect(emptyMapLibreStyle.layers).toEqual([
    {
      id: 'hundavaent-background',
      type: 'background',
      paint: { 'background-color': '#dce5df' }
    }
  ]);
});

test('place and operations modes share semantic colours while changing density', () => {
  const placeMode = document.createElement('section');
  placeMode.dataset.uiMode = 'place';
  const operationsMode = document.createElement('section');
  operationsMode.dataset.uiMode = 'operations';
  document.body.append(placeMode, operationsMode);

  const placeStyles = getComputedStyle(placeMode);
  const operationsStyles = getComputedStyle(operationsMode);

  expect(placeStyles.getPropertyValue('--hv-color-snow').trim()).toBe('#f2f5f1');
  expect(placeStyles.getPropertyValue('--hv-color-basalt').trim()).toBe('#1e2d31');
  expect(placeStyles.getPropertyValue('--hv-color-moss').trim()).toBe('#58705b');
  expect(placeStyles.getPropertyValue('--hv-color-fjord').trim()).toBe('#2f6f86');
  expect(placeStyles.getPropertyValue('--hv-color-signal').trim()).toBe('#f2c94c');
  expect(operationsStyles.getPropertyValue('--hv-color-signal').trim()).toBe(
    placeStyles.getPropertyValue('--hv-color-signal').trim()
  );
  expect(operationsStyles.getPropertyValue('--hv-space-context').trim()).not.toBe(
    placeStyles.getPropertyValue('--hv-space-context').trim()
  );

  placeMode.remove();
  operationsMode.remove();
});
