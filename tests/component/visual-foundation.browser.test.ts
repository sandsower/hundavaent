import { expect, test } from 'vitest';

import '../../src/app.css';
import { emptyMapLibreStyle } from '../../src/lib/map/maplibre-adapter';

test('the visual foundation is deterministic across browser hosts', async () => {
  const loadedInterFaces = await document.fonts.load(
    '400 16px "Inter Variable"',
    'Hundavænt staður'
  );
  await document.fonts.ready;

  const interFaces = [...document.fonts].filter(
    (face) => face.family.replaceAll(/["']/g, '') === 'Inter Variable'
  );

  expect(interFaces.length).toBeGreaterThan(0);
  expect(loadedInterFaces.length).toBeGreaterThan(0);
  expect(loadedInterFaces.every((face) => face.status === 'loaded')).toBe(true);
  expect(emptyMapLibreStyle.layers).toEqual([
    {
      id: 'hundavaent-background',
      type: 'background',
      paint: { 'background-color': '#d9ece7' }
    }
  ]);
});
