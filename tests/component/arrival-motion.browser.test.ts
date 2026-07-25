import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import { motionDurationsMs } from '$lib/design-system/motion';
import PlaceList from '$lib/discovery/PlaceList.svelte';

/**
 * Arrival choreography contract: list items cascade in on the stagger token, the cascade caps
 * at the eighth item so large result sets do not crawl, and nothing about the entry touches
 * opacity - cards are text-bearing, so words arrive at full contrast and move into place.
 */
const places = Array.from({ length: 12 }, (_, index) => ({
  placeId: `30000000-0000-4000-8000-0000000000${String(10 + index)}`,
  name: `Place ${index}`,
  category: 'park' as const,
  locality: 'Reykjavík',
  latitude: 64.14 + index * 0.001,
  longitude: -21.95,
  wheelchairAccessibility: 'unknown' as const,
  accessConditionCount: 1,
  simpleAccessSummary: true,
  accessArea: 'outdoors' as const,
  restraintCondition: 'leash_required' as const,
  permissionRequirement: 'standing_permission' as const,
  accessConditions: [
    {
      accessArea: 'outdoors' as const,
      restraintCondition: 'leash_required' as const,
      permissionRequirement: 'standing_permission' as const
    }
  ],
  primaryPhoto: null
}));

function milliseconds(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed);
  return Number.parseFloat(trimmed) * 1_000;
}

test('list items cascade on the stagger token and cap at the eighth item', () => {
  const { container } = render(PlaceList, {
    places,
    selectedPlaceId: null,
    lang: 'en',
    copy: catalogues.en
  });

  const items = [...container.querySelectorAll('li')];
  expect(items).toHaveLength(12);

  const styles = items.map((item) => getComputedStyle(item));
  expect(styles[0].animationName).toContain('list-item-enter');
  expect(milliseconds(styles[0].animationDuration)).toBe(motionDurationsMs.considered);

  for (const [index, style] of styles.entries()) {
    const expectedStep = Math.min(index, 8);
    expect(milliseconds(style.animationDelay)).toBe(expectedStep * motionDurationsMs.stagger);
    // The entry is transform-only: full contrast from the first frame.
    expect(style.opacity).toBe('1');
  }
});
