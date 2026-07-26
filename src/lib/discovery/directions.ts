import type { GeographicPoint } from './filter';

/**
 * The cross-platform Google Maps directions URL: on phones it opens the installed app, elsewhere
 * the website. The destination is coordinates rather than the place name, because a name is only
 * a search query on Google's side and can land on a different venue; coordinates are the one
 * fact about a Place both catalogues agree on.
 */
export function googleMapsDirectionsUrl(point: GeographicPoint): string {
  const destination = encodeURIComponent(`${point.latitude},${point.longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
