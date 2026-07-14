import { isBlockedPhotoHost, mapCommonsLicense } from './policy.ts';
import type { AcquisitionCandidate, AcquisitionPlace } from './types.ts';

type Fetcher = typeof fetch;

const userAgent =
  'Hundavaent/1.0 (rights-cleared Place photo acquisition; https://hv.valenzuela.is)';

interface CommonsMetadataValue {
  value?: unknown;
}

interface CommonsImageInfo {
  timestamp?: unknown;
  mime?: unknown;
  thumburl?: unknown;
  thumbwidth?: unknown;
  thumbheight?: unknown;
  descriptionurl?: unknown;
  extmetadata?: Record<string, CommonsMetadataValue>;
}

interface CommonsPage {
  pageid?: unknown;
  title?: unknown;
  imageinfo?: CommonsImageInfo[];
}

export class WikimediaCommonsSource {
  private readonly fetcher: Fetcher;

  constructor(fetcher: Fetcher = fetch) {
    this.fetcher = fetcher;
  }

  async discover(place: AcquisitionPlace): Promise<AcquisitionCandidate[]> {
    const query = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `intitle:"${place.nameEn}" OR intitle:"${place.nameIs}"`,
      gsrnamespace: '6',
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|mime|size|timestamp|extmetadata',
      iiurlwidth: '1600',
      format: 'json',
      formatversion: '2',
      origin: '*'
    });
    const response = await this.fetcher(`https://commons.wikimedia.org/w/api.php?${query}`, {
      headers: {
        'User-Agent': userAgent,
        'Api-User-Agent': userAgent,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Wikimedia Commons discovery failed with HTTP ${response.status}`);
    }

    const raw: unknown = await response.json();
    const pages = readPages(raw);
    return pages.flatMap((page) => normalizePage(place, page));
  }
}

function readPages(raw: unknown): CommonsPage[] {
  if (!raw || typeof raw !== 'object') return [];
  const pages = (raw as { query?: { pages?: unknown } }).query?.pages;
  if (Array.isArray(pages)) return pages.filter(isObject) as CommonsPage[];
  if (isObject(pages)) return Object.values(pages).filter(isObject) as CommonsPage[];
  return [];
}

function normalizePage(place: AcquisitionPlace, page: CommonsPage): AcquisitionCandidate[] {
  const info = page.imageinfo?.[0];
  const pageId = integer(page.pageid);
  const title = text(page.title);
  const sourcePageUrl = text(info?.descriptionurl);
  const downloadUrl = text(info?.thumburl);
  const widthPx = integer(info?.thumbwidth);
  const heightPx = integer(info?.thumbheight);
  const metadata = info?.extmetadata ?? {};
  const licenseReference = metadataText(metadata, 'LicenseShortName');
  const rightsBasis = mapCommonsLicense(licenseReference);
  const licenseUrl = metadataText(metadata, 'LicenseUrl');
  const artist = stripMarkup(metadataText(metadata, 'Artist'));
  const sourceDate =
    date(metadataText(metadata, 'DateTimeOriginal')) ??
    date(metadataText(metadata, 'DateTime')) ??
    date(text(info?.timestamp));

  if (
    pageId === null ||
    !title ||
    !sourcePageUrl ||
    !downloadUrl ||
    isBlockedPhotoHost(sourcePageUrl) ||
    isBlockedPhotoHost(downloadUrl) ||
    !isExpectedHttpsHost(sourcePageUrl, 'commons.wikimedia.org') ||
    !isExpectedHttpsHost(downloadUrl, 'upload.wikimedia.org') ||
    widthPx === null ||
    heightPx === null ||
    !rightsBasis ||
    !licenseReference ||
    !licenseUrl ||
    !artist ||
    !sourceDate ||
    info?.mime !== 'image/jpeg'
  ) {
    return [];
  }

  const attributionText = `${place.nameEn} by ${artist}, ${licenseReference}`;
  return [
    {
      sourceId: `wikimedia-commons:${pageId}`,
      title,
      sourcePageUrl,
      downloadUrl,
      rightsBasis,
      rightsEvidenceReference: `Wikimedia Commons page ${pageId}; license metadata at ${sourcePageUrl}`,
      licenseReference,
      licenseUrl,
      photographerOrUploader: artist,
      attributionText,
      attributionUrl: null,
      sourceOrCaptureDate: sourceDate,
      altTextIs: `Ljósmynd af ${place.nameIs}`,
      altTextEn: `Photo of ${place.nameEn}`,
      widthPx,
      heightPx,
      expectedMimeType: 'image/jpeg'
    }
  ];
}

function metadataText(metadata: Record<string, CommonsMetadataValue>, key: string): string {
  return text(metadata[key]?.value);
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function date(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExpectedHttpsHost(value: string, expectedHost: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}
