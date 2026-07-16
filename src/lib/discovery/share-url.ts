import type { Locale } from '$i18n';

export function buildPlaceShareUrl(origin: string, lang: Locale, placeId: string): string {
  const url = new URL(`/${lang}`, origin);
  url.searchParams.set('place', placeId);
  return url.toString();
}
