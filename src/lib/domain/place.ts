export type PlaceLifecycle = 'candidate' | 'published' | 'inactive';

export type PlaceCategory =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'shop'
  | 'shopping_centre'
  | 'accommodation'
  | 'park'
  | 'recreation'
  | 'culture'
  | 'service'
  | 'other';

export interface Place {
  id: string;
  operatorId: string;
  locationId: string;
  purpose: string;
  lifecycle: PlaceLifecycle;
  category: PlaceCategory;
  version: number;
  publishedAt: string | null;
}

export function isPubliclyEligiblePlace(place: Place, hasCurrentVerification: boolean): boolean {
  return place.lifecycle === 'published' && place.publishedAt !== null && hasCurrentVerification;
}
