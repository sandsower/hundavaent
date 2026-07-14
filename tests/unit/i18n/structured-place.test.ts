import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import {
  formatDogAmenities,
  formatOpeningHours,
  localizeAccessArea,
  localizeEvidenceKind,
  localizePermission,
  localizeRestraint
} from '$i18n/structured-place';

describe('structured Place copy', () => {
  it('localizes supported opening-hours and amenity identifiers without altering free text', () => {
    const hours = {
      monday: ['09:00-17:00'],
      seasonal_note: 'Call ahead on holidays'
    };
    const amenities = ['water_bowl', 'covered patio hook'];

    expect(formatOpeningHours(hours, catalogues.en, 'Not available')).toBe(
      'Monday: 09:00-17:00 · seasonal_note: Call ahead on holidays'
    );
    expect(formatOpeningHours(hours, catalogues.is, 'Ekki tiltækt')).toBe(
      'Mánudagur: 09:00-17:00 · seasonal_note: Call ahead on holidays'
    );
    expect(formatDogAmenities(amenities, catalogues.en)).toBe('Water bowl, covered patio hook');
    expect(formatDogAmenities(amenities, catalogues.is)).toBe('Vatnsskál, covered patio hook');
  });

  it('localizes the supported Access and Evidence vocabularies', () => {
    expect(localizeAccessArea('outdoors', catalogues.is)).toBe('Utandyra');
    expect(localizeRestraint('leash_required', catalogues.en)).toBe('Leash required');
    expect(localizePermission('ask_on_arrival', catalogues.is)).toBe('Spyrja þarf við komu');
    expect(localizeEvidenceKind('public_record', catalogues.is)).toBe('Opinber skrá');
  });
});
