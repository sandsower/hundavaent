import type { Locale } from '$i18n';
import type { PlaceFieldChange } from '$lib/contributions/correction';
import type { PublishedPlaceProfile } from '$server/discovery/public-places';
import type { PlaceFieldValue } from '$server/place-flags/place-flag-input';

/**
 * The place-field counterpart of `access-condition-change`: the no-op verdict and the proposed
 * value, each a switch over the same union, so a new editable field is two compile errors rather
 * than a silent gap.
 */

export function isUnchangedPlaceField(
  profile: PublishedPlaceProfile,
  change: PlaceFieldChange
): boolean {
  switch (change.field) {
    case 'name':
      // The profile was read in the Member's locale, and the hatch writes only that locale, so
      // this compares exactly the value the Correction would replace.
      return profile.name === change.value;
    case 'website_url':
      return (profile.websiteUrl ?? null) === change.value;
    case 'phone':
      return (profile.phone ?? null) === change.value;
    case 'dog_amenities':
      return isSameAmenitySet(profile.dogAmenities, change.value);
    case 'wheelchair_accessibility':
      return profile.wheelchairAccessibility === change.value;
  }
}

export function proposedPlaceFieldValue(change: PlaceFieldChange, locale: Locale): PlaceFieldValue {
  switch (change.field) {
    case 'name':
      // No server read returns a Place's name in both locales, and asking a Member for a language
      // they may not speak is the ask this phase exists to remove. The other locale is named for
      // review instead of being guessed, copied or blanked.
      return { [locale]: change.value, needs_review: otherLocale(locale) };
    case 'website_url':
    case 'phone':
      return { value: change.value };
    case 'dog_amenities':
      return { value: change.value };
    case 'wheelchair_accessibility':
      return { value: change.value };
  }
}

function otherLocale(locale: Locale): Locale {
  return locale === 'is' ? 'en' : 'is';
}

function isSameAmenitySet(published: readonly string[], proposed: readonly string[]): boolean {
  // Amenities are an unordered vocabulary, so a reordering is not a Correction.
  const publishedSet = new Set(published);
  const proposedSet = new Set(proposed);
  if (publishedSet.size !== proposedSet.size) return false;
  for (const amenity of proposedSet) {
    if (!publishedSet.has(amenity)) return false;
  }
  return true;
}
