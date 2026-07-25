import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import {
  formatDogAmenities,
  formatOpeningHours,
  localizeAccessArea,
  localizeEvidenceKind,
  localizeFlagTarget,
  localizePermission,
  localizeRestraint
} from '$i18n/structured-place';

describe('structured Place copy', () => {
  it('localizes supported opening-hours and amenity identifiers without altering free text', () => {
    const hours = {
      seasonal_note: 'Call ahead on holidays',
      friday: ['08:00-18:00'],
      monday: ['09:00-17:00']
    };
    const amenities = ['water_bowl', 'covered patio hook'];

    expect(formatOpeningHours(hours, catalogues.en, 'Not available')).toBe(
      'Monday: 09:00-17:00 · Friday: 08:00-18:00 · seasonal_note: Call ahead on holidays'
    );
    expect(formatOpeningHours(hours, catalogues.is, 'Ekki tiltækt')).toBe(
      'Mánudagur: 09:00-17:00 · Föstudagur: 08:00-18:00 · seasonal_note: Call ahead on holidays'
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

  it('names every flag target kind, and never calls a whole-Place claim an Access Condition', () => {
    expect(localizeFlagTarget('place', null, catalogues.en)).toBe('The whole place');
    expect(localizeFlagTarget('place', null, catalogues.is)).toBe('Staðurinn í heild');
    expect(localizeFlagTarget('place_field', 'phone', catalogues.en)).toBe('Phone');
    expect(localizeFlagTarget('access_condition', null, catalogues.en)).toBe('An Access Condition');
    // A place_field row that lost its field is still not a Condition claim, but the Condition
    // wording is the only honest fallback left: it is the shape the older rows all had.
    expect(localizeFlagTarget('place_field', null, catalogues.en)).toBe('An Access Condition');
  });
});
