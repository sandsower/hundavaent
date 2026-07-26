import { afterEach, describe, expect, it, vi } from 'vitest';

import { maxMemberPhotoBytes } from '../../../src/lib/contributions/photo';
import { fetchMyPlacePhotos, uploadPlacePhoto } from '../../../src/lib/contributions/photo-client';

const placeId = '30000000-0000-4000-8000-000000000003';

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function photoFile(byteLength = 32): File {
  return new File([new Uint8Array(byteLength)], 'photo.jpg', { type: 'image/jpeg' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploading a Member photo', () => {
  it('posts the file as multipart with a fresh idempotency key', async () => {
    const fetchMock = stubFetch(
      respond({ status: 'submitted', mediaId: 'media-1', approvalState: 'pending' })
    );

    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'submitted',
      mediaId: 'media-1',
      approvalState: 'pending'
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/places/${placeId}/photos`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
    // The browser has to set the multipart boundary itself, so the transport must not name a
    // content type of its own.
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('refuses a file over the cap without spending a round trip', async () => {
    const fetchMock = stubFetch(respond({}, 200));
    const oversized = new File([new Uint8Array(maxMemberPhotoBytes + 1)], 'big.jpg', {
      type: 'image/jpeg'
    });

    await expect(uploadPlacePhoto(placeId, oversized)).resolves.toEqual({ status: 'too_large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads each refusal as its own outcome', async () => {
    stubFetch(respond({ error: 'authentication_required' }, 401));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'authentication_required'
    });

    stubFetch(respond({ error: 'too_large' }, 413));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({ status: 'too_large' });

    stubFetch(respond({ error: 'rate_limited' }, 429));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'rate_limited'
    });

    stubFetch(respond({ error: 'invalid_request' }, 400));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({ status: 'invalid' });

    stubFetch(respond({ error: 'policy_unavailable' }, 503));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'unavailable'
    });
  });

  it('reads a network failure and an unreadable body as unavailable', async () => {
    stubFetch(new TypeError('offline'));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'unavailable'
    });

    stubFetch(new Response('not json', { status: 200 }));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'unavailable'
    });

    stubFetch(respond({ status: 'submitted' }));
    await expect(uploadPlacePhoto(placeId, photoFile())).resolves.toEqual({
      status: 'unavailable'
    });
  });
});

describe('reading the caller own photos', () => {
  it('loads the strip', async () => {
    const photo = {
      mediaId: 'media-1',
      url: 'https://storage.invalid/one.jpg?token',
      approvalState: 'pending',
      widthPx: 640,
      heightPx: 480,
      uploadedAt: '2026-07-26T09:00:00Z'
    };
    const fetchMock = stubFetch(respond({ photos: [photo] }));

    await expect(fetchMyPlacePhotos(placeId)).resolves.toEqual({
      status: 'loaded',
      photos: [photo]
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/places/${placeId}/photos`);
  });

  it('accepts a photo whose URL could not be signed', async () => {
    stubFetch(
      respond({
        photos: [
          {
            mediaId: 'media-1',
            url: null,
            approvalState: 'approved',
            widthPx: 1,
            heightPx: 1,
            uploadedAt: '2026-07-26T09:00:00Z'
          }
        ]
      })
    );

    await expect(fetchMyPlacePhotos(placeId)).resolves.toMatchObject({ status: 'loaded' });
  });

  it('reads a signed-out caller as authentication_required, not as an error', async () => {
    stubFetch(respond({ error: 'authentication_required' }, 401));
    await expect(fetchMyPlacePhotos(placeId)).resolves.toEqual({
      status: 'authentication_required'
    });
  });

  it('refuses a payload that is not the shape it asked for', async () => {
    stubFetch(respond({ photos: [{ mediaId: 'media-1' }] }));
    await expect(fetchMyPlacePhotos(placeId)).resolves.toEqual({ status: 'unavailable' });

    stubFetch(respond({ photos: 'not an array' }));
    await expect(fetchMyPlacePhotos(placeId)).resolves.toEqual({ status: 'unavailable' });
  });
});
