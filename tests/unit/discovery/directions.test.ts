import { describe, expect, it } from 'vitest';

import { googleMapsDirectionsUrl } from '$lib/discovery/directions';

describe('googleMapsDirectionsUrl', () => {
  it('builds the universal Google Maps directions URL from coordinates', () => {
    expect(googleMapsDirectionsUrl({ latitude: 64.1466, longitude: -21.9426 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=64.1466%2C-21.9426'
    );
  });

  it('keeps full stored precision so the destination pin lands on the place', () => {
    expect(googleMapsDirectionsUrl({ latitude: 64.145245, longitude: -21.927444 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=64.145245%2C-21.927444'
    );
  });
});
