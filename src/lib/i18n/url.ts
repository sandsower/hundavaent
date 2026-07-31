import { isLocale, type Locale } from './locale';

export function replaceLocaleInUrl(currentUrl: string | URL, targetLocale: Locale): `/${string}` {
  const url =
    currentUrl instanceof URL
      ? new URL(currentUrl.href)
      : new URL(currentUrl, 'https://hundavaent.invalid');
  const segments = url.pathname.split('/').filter(Boolean);

  if (isLocale(segments[0])) {
    segments[0] = targetLocale;
  } else {
    segments.unshift(targetLocale);
  }

  const pathname = `/${segments.join('/')}`;
  return `${pathname}${url.search}${url.hash}` as `/${string}`;
}
