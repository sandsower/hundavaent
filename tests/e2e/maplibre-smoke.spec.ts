import { expect, test } from '@playwright/test';

test('the real MapLibre adapter renders, selects, moves, attributes, and disposes', async ({
  page
}) => {
  await page.goto('/en');
  await page.evaluate(async () => {
    const modulePath = '/src/lib/map/maplibre-adapter.ts';
    const { createMapLibreAdapter, emptyMapLibreStyle } = await import(modulePath);
    const container = document.createElement('div');
    container.id = 'maplibre-smoke';
    container.style.width = '640px';
    container.style.height = '420px';
    document.body.append(container);
    const adapter = createMapLibreAdapter({ style: emptyMapLibreStyle });
    await adapter.mount(container, {
      onMarkerSelect: (placeId: string) => {
        document.body.dataset.selectedPlace = placeId;
      },
      onClusterSelect: (placeIds: readonly string[]) => {
        document.body.dataset.clusterPlaces = JSON.stringify(placeIds);
      },
      onCameraChange: () => undefined
    });
    adapter.setPlaces([
      {
        placeId: '30000000-0000-4000-8000-000000000003',
        name: 'Published Place marker',
        latitude: 64.1423,
        longitude: -21.9555
      }
    ]);
    adapter.setSelectedPlace('30000000-0000-4000-8000-000000000003');
    adapter.setCamera({ latitude: 64.1423, longitude: -21.9555, zoom: 13 });
    document.body.dataset.mapCamera = JSON.stringify(adapter.getCamera());
    (window as unknown as { smokeMapAdapter: { destroy(): void } }).smokeMapAdapter = adapter;
  });

  const smokeMap = page.locator('#maplibre-smoke');
  const marker = smokeMap.getByRole('button', { name: 'Published Place marker' });
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await marker.click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-selected-place',
    '30000000-0000-4000-8000-000000000003'
  );
  await expect(smokeMap.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(smokeMap.getByText('© OpenStreetMap contributors')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute(
    'data-map-camera',
    JSON.stringify({ latitude: 64.1423, longitude: -21.9555, zoom: 13 })
  );

  await page.evaluate(() => {
    const adapter = (
      window as unknown as {
        smokeMapAdapter: {
          setPlaces(places: Array<Record<string, string | number>>): void;
          setSelectedPlace(placeId: string | null): void;
          setCamera(camera: { latitude: number; longitude: number; zoom: number }): void;
        };
      }
    ).smokeMapAdapter;
    adapter.setSelectedPlace(null);
    adapter.setPlaces([
      {
        placeId: '30000000-0000-4000-8000-000000000003',
        name: 'Published Place marker',
        latitude: 64.1423,
        longitude: -21.9555
      },
      {
        placeId: '30000000-0000-4000-8000-000000000004',
        name: 'Overlapping Place marker',
        latitude: 64.1423,
        longitude: -21.9555
      }
    ]);
    adapter.setCamera({ latitude: 64.1423, longitude: -21.9555, zoom: 13 });
  });
  await smokeMap.getByRole('button', { name: '2 places' }).click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-cluster-places',
    JSON.stringify(['30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004'])
  );

  await page.evaluate(() => {
    (window as unknown as { smokeMapAdapter: { destroy(): void } }).smokeMapAdapter.destroy();
  });
  await expect(smokeMap.locator('canvas')).toHaveCount(0);
});
