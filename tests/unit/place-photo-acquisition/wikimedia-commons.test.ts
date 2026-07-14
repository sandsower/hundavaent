import { describe, expect, it, vi } from 'vitest';

import { WikimediaCommonsSource } from '../../../scripts/place-photo-acquisition/wikimedia-commons';

const commonsResponse = {
  query: {
    pages: {
      '123': {
        pageid: 123,
        title: 'File:Rights Cafe Reykjavík.jpg',
        imageinfo: [
          {
            timestamp: '2026-06-01T12:00:00Z',
            mime: 'image/jpeg',
            thumburl: 'https://upload.wikimedia.org/example/1600px-Rights_Cafe.jpg',
            thumbwidth: 1600,
            thumbheight: 1067,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Rights_Cafe_Reykjavik.jpg',
            extmetadata: {
              LicenseShortName: { value: 'CC BY 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
              Artist: { value: '<a href="/wiki/User:Photographer">A. Photographer</a>' },
              Credit: { value: 'Own work' },
              DateTimeOriginal: { value: '2026-05-30' },
              ImageDescription: { value: '<b>Rights Cafe</b> exterior' }
            }
          }
        ]
      },
      '456': {
        pageid: 456,
        title: 'File:Unusable Rights Cafe.jpg',
        imageinfo: [
          {
            timestamp: '2026-06-01T12:00:00Z',
            mime: 'image/jpeg',
            thumburl: 'https://upload.wikimedia.org/example/unusable.jpg',
            thumbwidth: 1200,
            thumbheight: 800,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Unusable_Rights_Cafe.jpg',
            extmetadata: {
              LicenseShortName: { value: 'CC BY-NC 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-nc/4.0/' },
              Artist: { value: 'Another photographer' },
              DateTime: { value: '2026-05-30' }
            }
          }
        ]
      }
    }
  }
};

describe('WikimediaCommonsSource', () => {
  it('normalizes allowlisted API metadata and drops unsupported licenses', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(commonsResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    const source = new WikimediaCommonsSource(fetcher);

    const candidates = await source.discover({
      placeId: 'place-1',
      lifecycle: 'published',
      nameIs: 'Réttindakaffi',
      nameEn: 'Rights Cafe',
      websiteUrl: 'https://venue.example.invalid',
      latitude: 64.1466,
      longitude: -21.9426,
      existingPhotoHashes: [],
      existingPhotoSourceUrls: []
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      sourceId: 'wikimedia-commons:123',
      title: 'File:Rights Cafe Reykjavík.jpg',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Rights_Cafe_Reykjavik.jpg',
      downloadUrl: 'https://upload.wikimedia.org/example/1600px-Rights_Cafe.jpg',
      rightsBasis: 'cc_by',
      licenseReference: 'CC BY 4.0',
      photographerOrUploader: 'A. Photographer',
      sourceOrCaptureDate: '2026-05-30',
      widthPx: 1600,
      heightPx: 1067
    });
    expect(candidates[0]?.rightsEvidenceReference).toContain('page 123');
    expect(candidates[0]?.attributionText).toContain('A. Photographer');
    expect(candidates[0]?.altTextEn).toContain('Rights Cafe');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('generator=search');
    const requestHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get('User-Agent')).toBe(
      'Hundavaent/1.0 (rights-cleared Place photo acquisition; https://hv.valenzuela.is)'
    );
  });

  it('fails closed when the Commons response is not successful JSON', async () => {
    const source = new WikimediaCommonsSource(async () => new Response('blocked', { status: 429 }));
    await expect(
      source.discover({
        placeId: 'place-1',
        lifecycle: 'candidate',
        nameIs: 'Staður',
        nameEn: 'Place',
        websiteUrl: null,
        latitude: 64.1,
        longitude: -21.9,
        existingPhotoHashes: [],
        existingPhotoSourceUrls: []
      })
    ).rejects.toThrow('Wikimedia Commons discovery failed with HTTP 429');
  });

  it('rejects image and description URLs outside the supported Wikimedia hosts', async () => {
    const poisonedResponse = structuredClone(commonsResponse);
    const info = poisonedResponse.query.pages['123'].imageinfo[0];
    info.thumburl = 'https://lh3.googleusercontent.com/copied-place-photo.jpg';
    const source = new WikimediaCommonsSource(
      async () => new Response(JSON.stringify(poisonedResponse), { status: 200 })
    );

    await expect(
      source.discover({
        placeId: 'place-1',
        lifecycle: 'published',
        nameIs: 'Réttindakaffi',
        nameEn: 'Rights Cafe',
        websiteUrl: null,
        latitude: 64.1,
        longitude: -21.9,
        existingPhotoHashes: [],
        existingPhotoSourceUrls: []
      })
    ).resolves.toEqual([]);
  });
});
