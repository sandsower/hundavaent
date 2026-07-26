import { describe, expect, it, vi } from 'vitest';

import {
  buildJpeg,
  buildPng,
  bytesOf,
  containsSequence,
  gpsMarker
} from '../place-media/image-fixtures';

const mocks = vi.hoisted(() => ({ storageClient: null as unknown }));

vi.mock('$server/place-media/place-photo-storage', () => ({
  createPlacePhotoStorageClient: () => mocks.storageClient
}));

const { GET, POST } = await import('../../../src/routes/api/places/[id]/photos/+server');

const placeId = '30000000-0000-4000-8000-000000000003';
const commandId = 'a2000000-0000-4000-8000-000000000001';

interface RpcOverrides {
  submit?: { data: unknown; error: { code: string } | null };
  list?: { data: unknown; error: { code: string } | null };
  allowance?: { data: unknown; error: { code: string } | null };
  /** The path a replayed registration answers with, in place of the one this attempt supplied. */
  replayedPath?: string;
  signingFails?: boolean;
}

function memberClient(overrides: RpcOverrides = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'member' } }, error: null }))
    },
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_current_member_account') {
        return { data: [{ member_id: 'member' }], error: null };
      }
      if (name === 'get_my_place_photo_allowance') {
        return (
          overrides.allowance ?? {
            data: [{ remaining_pending: 3, remaining_window: 10 }],
            error: null
          }
        );
      }
      if (name === 'submit_place_photo') {
        const payload = (args?.command_payload ?? {}) as Record<string, unknown>;
        return (
          overrides.submit ?? {
            data: [
              {
                media_id: 'media-1',
                approval_state: 'pending',
                uploaded_at: '2026-07-26T09:00:00Z',
                storage_object_path: overrides.replayedPath ?? payload.storage_object_path
              }
            ],
            error: null
          }
        );
      }
      if (name === 'list_my_place_photos') {
        return (
          overrides.list ?? {
            data: [
              {
                media_id: 'media-1',
                storage_object_path: `${placeId}/member-uploads/one.jpg`,
                mime_type: 'image/jpeg',
                approval_state: 'pending',
                width_px: 640,
                height_px: 480,
                uploaded_at: '2026-07-26T09:00:00Z'
              }
            ],
            error: null
          }
        );
      }
      return { data: null, error: { code: 'unexpected' } };
    }),
    storage: {
      from: () => ({
        createSignedUrls: vi.fn(async (paths: string[]) =>
          overrides.signingFails
            ? { data: null, error: { message: 'signing is unavailable' } }
            : {
                data: paths.map((path) => ({
                  path,
                  signedUrl: `https://storage.invalid/${path}?token`
                })),
                error: null
              }
        )
      })
    }
  };
}

function submittedCommand(client: ReturnType<typeof memberClient>): Record<string, unknown> {
  const call = client.rpc.mock.calls.find(([name]) => name === 'submit_place_photo');
  if (!call) throw new Error('The photo submission RPC was never called');
  return (call[1] as { command_payload: Record<string, unknown> }).command_payload;
}

function submittedRequestId(client: ReturnType<typeof memberClient>): string {
  const call = client.rpc.mock.calls.find(([name]) => name === 'submit_place_photo');
  if (!call) throw new Error('The photo submission RPC was never called');
  return (call[1] as { command_request_id: string }).command_request_id;
}

function signedOutClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    rpc: vi.fn(async () => ({ data: null, error: null }))
  };
}

function storageClient(uploadError: { message: string } | null = null) {
  const uploaded: { path: string; bytes: Uint8Array; contentType: string }[] = [];
  const removed: string[] = [];
  return {
    uploaded,
    removed,
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string, file: File, options: { contentType: string }) => {
          uploaded.push({
            path,
            bytes: new Uint8Array(await file.arrayBuffer()),
            contentType: options.contentType
          });
          return { error: uploadError };
        }),
        remove: vi.fn(async (paths: string[]) => {
          removed.push(...paths);
          return { error: null };
        })
      })
    }
  };
}

function uploadEvent(
  client: unknown,
  file: File | string | null,
  options: { id?: string; idempotencyKey?: string | null; declaredLength?: number } = {}
) {
  const body = new FormData();
  if (file !== null) body.set('file', file);
  const id = options.id ?? placeId;
  const headers = new Headers();
  const key = options.idempotencyKey === undefined ? commandId : options.idempotencyKey;
  if (key !== null) headers.set('idempotency-key', key);
  if (options.declaredLength !== undefined) {
    headers.set('content-length', String(options.declaredLength));
  }

  return {
    cookies: {},
    locals: { supabase: client, requestId: 'request-under-test' },
    params: { id },
    request: new Request(`http://localhost/api/places/${id}/photos`, {
      method: 'POST',
      headers,
      body
    }),
    url: new URL(`http://localhost/api/places/${id}/photos`)
  } as never;
}

function listEvent(client: unknown, id: string = placeId) {
  return {
    cookies: {},
    locals: { supabase: client, requestId: 'request-under-test' },
    params: { id },
    request: new Request(`http://localhost/api/places/${id}/photos`),
    url: new URL(`http://localhost/api/places/${id}/photos`)
  } as never;
}

function photoFile(bytes: Uint8Array, type: string, name = 'photo.jpg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('member photo upload', () => {
  it('stores stripped bytes under the member namespace and registers them as pending', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient();
    const source = buildJpeg();

    const response = await POST(uploadEvent(client, photoFile(source, 'image/jpeg')));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'submitted',
      mediaId: 'media-1',
      approvalState: 'pending',
      uploadedAt: '2026-07-26T09:00:00Z'
    });

    const written = (mocks.storageClient as ReturnType<typeof storageClient>).uploaded;
    expect(written).toHaveLength(1);
    expect(written[0]!.path).toMatch(
      new RegExp(`^${placeId}/member-uploads/[0-9a-f-]{36}\\.jpg$`, 'i')
    );
    expect(written[0]!.contentType).toBe('image/jpeg');
  });

  it('writes bytes that no longer carry the location the file arrived with', async () => {
    mocks.storageClient = storageClient();
    const source = buildJpeg();
    expect(containsSequence(source, bytesOf(gpsMarker))).toBe(true);

    await POST(uploadEvent(memberClient(), photoFile(source, 'image/jpeg')));

    const written = (mocks.storageClient as ReturnType<typeof storageClient>).uploaded[0]!;
    expect(containsSequence(written.bytes, bytesOf(gpsMarker))).toBe(false);
  });

  it('keeps the orientation a browser needs while dropping the location it does not', async () => {
    mocks.storageClient = storageClient();
    await POST(uploadEvent(memberClient(), photoFile(buildJpeg({ orientation: 6 }), 'image/jpeg')));

    const written = (mocks.storageClient as ReturnType<typeof storageClient>).uploaded[0]!;
    expect(containsSequence(written.bytes, bytesOf(gpsMarker))).toBe(false);
    expect(containsSequence(written.bytes, bytesOf('Exif'))).toBe(true);
  });

  it('sends the dimensions and byte size it measured, not anything the caller stated', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient();
    const source = buildPng({ widthPx: 321, heightPx: 123 });

    await POST(uploadEvent(client, photoFile(source, 'image/png', 'photo.png')));

    const payload = submittedCommand(client);
    const written = (mocks.storageClient as ReturnType<typeof storageClient>).uploaded[0]!;
    expect(payload).toMatchObject({
      place_id: placeId,
      mime_type: 'image/png',
      width_px: 321,
      height_px: 123,
      byte_size: written.bytes.byteLength
    });
    expect(payload.storage_object_path).toBe(written.path);
  });

  it('forwards the supplied idempotency key so a retried upload replays', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient();

    await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(submittedRequestId(client)).toBe(commandId);
  });

  it('generates a request id when the caller supplies none', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient();

    await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg'), { idempotencyKey: null }));

    expect(submittedRequestId(client)).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('refuses a request that is not from a Member before reading any bytes', async () => {
    mocks.storageClient = storageClient();
    const response = await POST(
      uploadEvent(signedOutClient(), photoFile(buildJpeg(), 'image/jpeg'))
    );

    expect(response.status).toBe(401);
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
  });

  it('refuses a malformed Place id and a malformed idempotency key', async () => {
    mocks.storageClient = storageClient();
    await expect(
      POST(uploadEvent(memberClient(), photoFile(buildJpeg(), 'image/jpeg'), { id: 'not-a-uuid' }))
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      POST(
        uploadEvent(memberClient(), photoFile(buildJpeg(), 'image/jpeg'), {
          idempotencyKey: 'not-a-uuid'
        })
      )
    ).resolves.toMatchObject({ status: 400 });
  });

  it('refuses a request carrying no file part', async () => {
    mocks.storageClient = storageClient();
    await expect(POST(uploadEvent(memberClient(), null))).resolves.toMatchObject({ status: 400 });
    await expect(POST(uploadEvent(memberClient(), 'a string, not a file'))).resolves.toMatchObject({
      status: 400
    });
  });

  it('refuses a file whose declared type disagrees with its bytes', async () => {
    mocks.storageClient = storageClient();
    const response = await POST(
      uploadEvent(memberClient(), photoFile(buildPng(), 'image/jpeg', 'lying.jpg'))
    );

    expect(response.status).toBe(400);
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
  });

  it('refuses a file that is not an image this app publishes', async () => {
    mocks.storageClient = storageClient();
    const pdf = Uint8Array.from(bytesOf('%PDF-1.7 not an image at all'));
    const response = await POST(uploadEvent(memberClient(), photoFile(pdf, 'image/jpeg')));

    expect(response.status).toBe(400);
  });

  it('refuses a truncated image rather than storing bytes it cannot parse', async () => {
    mocks.storageClient = storageClient();
    const response = await POST(
      uploadEvent(memberClient(), photoFile(buildJpeg().slice(0, 40), 'image/jpeg'))
    );

    expect(response.status).toBe(400);
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
  });

  it('refuses a file over the size cap with 413, before any byte reaches Storage', async () => {
    mocks.storageClient = storageClient();
    const oversized = new Uint8Array(8 * 1024 * 1024 + 1);
    oversized.set(buildJpeg(), 0);
    const response = await POST(uploadEvent(memberClient(), photoFile(oversized, 'image/jpeg')));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'too_large' });
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
  });

  it('refuses a declared length past the cap without reading the body at all', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient();
    const event = uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg'), {
      declaredLength: 9 * 1024 * 1024
    }) as unknown as { request: Request };

    const response = await POST(event as never);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'too_large' });
    expect(event.request.bodyUsed).toBe(false);
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
    expect(client.rpc.mock.calls.some(([name]) => name === 'get_my_place_photo_allowance')).toBe(
      false
    );
  });

  it('lets a declared length within the multipart envelope through', async () => {
    mocks.storageClient = storageClient();
    const source = buildJpeg();
    const response = await POST(
      uploadEvent(memberClient(), photoFile(source, 'image/jpeg'), {
        declaredLength: source.byteLength + 512
      })
    );

    expect(response.status).toBe(200);
  });

  it('answers 429 at the pending cap without reading the file or writing a byte', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({
      allowance: { data: [{ remaining_pending: 0, remaining_window: 7 }], error: null }
    });
    const event = uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')) as unknown as {
      request: Request;
    };

    const response = await POST(event as never);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
    expect(event.request.bodyUsed).toBe(false);
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
    expect(client.rpc.mock.calls.some(([name]) => name === 'submit_place_photo')).toBe(false);
  });

  it('answers 429 at the window cap on the same terms', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({
      allowance: { data: [{ remaining_pending: 2, remaining_window: 0 }], error: null }
    });

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(429);
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
  });

  it('answers 503 when the allowance cannot be read because no policy is configured', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({ allowance: { data: null, error: { code: '55000' } } });

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'policy_unavailable' });
    expect((mocks.storageClient as ReturnType<typeof storageClient>).uploaded).toHaveLength(0);
  });

  it('removes the object it wrote when a replay answers with the first attempt path', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({
      replayedPath: `${placeId}/member-uploads/the-first-attempt.jpg`
    });

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(200);
    const storage = mocks.storageClient as ReturnType<typeof storageClient>;
    expect(storage.removed).toEqual([storage.uploaded[0]!.path]);
  });

  it('keeps the object it wrote when the registration is a first submission', async () => {
    mocks.storageClient = storageClient();

    await POST(uploadEvent(memberClient(), photoFile(buildJpeg(), 'image/jpeg')));

    expect((mocks.storageClient as ReturnType<typeof storageClient>).removed).toEqual([]);
  });

  it('answers 429 on a policy cap and removes the object it had already written', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({ submit: { data: null, error: { code: '54000' } } });

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
    const storage = mocks.storageClient as ReturnType<typeof storageClient>;
    expect(storage.removed).toEqual([storage.uploaded[0]!.path]);
  });

  it('answers 503 when the abuse policy has never been configured', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({ submit: { data: null, error: { code: '55000' } } });

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'policy_unavailable' });
  });

  it('answers 400 when the registration refuses the command', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({ submit: { data: null, error: { code: '22023' } } });

    await expect(
      POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')))
    ).resolves.toMatchObject({ status: 400 });
  });

  it('answers 401 when the registration finds no activated Member', async () => {
    mocks.storageClient = storageClient();
    const client = memberClient({ submit: { data: null, error: { code: '42501' } } });

    await expect(
      POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')))
    ).resolves.toMatchObject({ status: 401 });
  });

  it('answers 503 when the service credential is not configured, and stores nothing', async () => {
    mocks.storageClient = null;
    const client = memberClient();

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(503);
    expect(client.rpc.mock.calls.some(([name]) => name === 'submit_place_photo')).toBe(false);
  });

  it('answers 503 when the Storage write fails, and never registers a missing object', async () => {
    mocks.storageClient = storageClient({ message: 'storage is down' });
    const client = memberClient();

    const response = await POST(uploadEvent(client, photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.status).toBe(503);
    expect(client.rpc.mock.calls.some(([name]) => name === 'submit_place_photo')).toBe(false);
  });

  it('sends a private, uncacheable response', async () => {
    mocks.storageClient = storageClient();
    const response = await POST(uploadEvent(memberClient(), photoFile(buildJpeg(), 'image/jpeg')));

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('cookie');
  });
});

describe('member photo listing', () => {
  it('returns the caller own photos with signed URLs minted through the uploader gateway', async () => {
    const response = await GET(listEvent(memberClient()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      photos: [
        {
          mediaId: 'media-1',
          url: `https://storage.invalid/${placeId}/member-uploads/one.jpg?token`,
          approvalState: 'pending',
          widthPx: 640,
          heightPx: 480,
          uploadedAt: '2026-07-26T09:00:00Z'
        }
      ]
    });
  });

  it('renders a photo whose URL could not be signed rather than dropping the strip', async () => {
    const response = await GET(listEvent(memberClient({ signingFails: true })));
    const payload = (await response.json()) as { photos: { url: string | null }[] };
    expect(payload.photos[0]!.url).toBeNull();
  });

  it('refuses a signed-out caller', async () => {
    await expect(GET(listEvent(signedOutClient()))).resolves.toMatchObject({ status: 401 });
  });

  it('refuses a malformed Place id', async () => {
    await expect(GET(listEvent(memberClient(), 'not-a-uuid'))).resolves.toMatchObject({
      status: 400
    });
  });

  it('answers 503 when the projection is unavailable', async () => {
    const client = memberClient({ list: { data: null, error: { code: 'XX000' } } });
    await expect(GET(listEvent(client))).resolves.toMatchObject({ status: 503 });
  });

  it('sends a private, uncacheable response', async () => {
    const response = await GET(listEvent(memberClient()));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('cookie');
  });
});
