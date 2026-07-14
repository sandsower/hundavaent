import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import RatingSummary from '$lib/discovery/RatingSummary.svelte';
import type { DogFriendlinessSummary } from '$server/dog-friendliness/dog-friendliness';

const summary: DogFriendlinessSummary = {
  placeId: '30000000-0000-4000-8000-000000000003',
  visible: true,
  eligibleCount: 5,
  trailingTwelveMonthCount: 4,
  dimensions: [{ dimension: 'welcome', applicableCount: 5, mean: 4 }],
  overallMean: null,
  overallVisible: false
};

describe('RatingSummary presentation contract', () => {
  it('uses the shared panel and informational evidence semantics', () => {
    const { container } = render(RatingSummary, {
      summary,
      copy: catalogues.en,
      signedIn: false,
      rateHref: '/en/places/place-1/rate'
    });

    const panel = container.querySelector('[data-rating-summary]');
    expect(panel?.classList.contains('hv-panel')).toBe(true);
    expect(panel?.getAttribute('data-surface')).toBe('rating-evidence');
    expect(panel?.getAttribute('data-tone')).toBe('informational');

    const context = container.querySelectorAll('.hv-status[data-status="informational"]');
    expect(context).toHaveLength(2);
  });
});
