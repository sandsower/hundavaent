import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPendingCorrections,
  submitInlineCorrection
} from '../../../src/lib/contributions/correction-client';

const placeId = '30000000-0000-4000-8000-000000000003';
const accessConditionId = '40000000-0000-4000-8000-000000000003';

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

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the inline Correction request body', () => {
  it('names the condition, the dimension and the value on an access-condition arm', async () => {
    const fetchMock = stubFetch(respond({ status: 'submitted', flagId: 'flag-1' }));

    await submitInlineCorrection({
      placeId,
      lang: 'is',
      target: 'access_condition',
      accessConditionId,
      dimension: 'eligibility',
      value: { scope: 'restricted', maximumDogs: 2 },
      note: null
    });

    expect(sentBody(fetchMock)).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'eligibility',
      value: { scope: 'restricted', maximumDogs: 2 },
      note: null
    });
  });

  it('names the field and the value on a place-field arm, and no condition at all', async () => {
    const fetchMock = stubFetch(respond({ status: 'submitted', flagId: 'flag-1' }));

    await submitInlineCorrection({
      placeId,
      lang: 'en',
      target: 'place_field',
      field: 'dog_amenities',
      value: ['water bowl'],
      note: 'They put a bowl by the door.'
    });

    expect(sentBody(fetchMock)).toEqual({
      target: 'place_field',
      field: 'dog_amenities',
      value: ['water bowl'],
      note: 'They put a bowl by the door.'
    });
    expect(sentBody(fetchMock)).not.toHaveProperty('accessConditionId');
  });

  it('never puts the locale or the place in the body the server parses', async () => {
    const fetchMock = stubFetch(respond({ status: 'submitted', flagId: 'flag-1' }));

    await submitInlineCorrection({
      placeId,
      lang: 'en',
      target: 'place_field',
      field: 'name',
      value: 'Leash Cafe',
      note: null
    });

    const body = sentBody(fetchMock);
    expect(body).not.toHaveProperty('lang');
    expect(body).not.toHaveProperty('placeId');
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/places/${placeId}/corrections?lang=en`);
  });
});

describe('the pending Correction read', () => {
  it('returns the caller open flags', async () => {
    const pending = [
      {
        kind: 'correction',
        targetKind: 'place_field',
        targetField: 'name',
        accessConditionId: null,
        reportReason: null,
        status: 'submitted'
      }
    ];
    stubFetch(respond({ pending }));

    await expect(fetchPendingCorrections(placeId)).resolves.toEqual({
      status: 'loaded',
      pending
    });
  });

  it('reads a signed-out caller as authentication required rather than as no pending work', async () => {
    stubFetch(respond({ error: 'authentication_required' }, 401));

    await expect(fetchPendingCorrections(placeId)).resolves.toEqual({
      status: 'authentication_required'
    });
  });

  it('reports an unreachable or unreadable endpoint as unavailable', async () => {
    stubFetch(new Error('offline'));
    await expect(fetchPendingCorrections(placeId)).resolves.toEqual({ status: 'unavailable' });

    stubFetch(respond({ error: 'unavailable' }, 503));
    await expect(fetchPendingCorrections(placeId)).resolves.toEqual({ status: 'unavailable' });
  });

  it('refuses a payload that is not the pending shape rather than rendering it', async () => {
    stubFetch(respond({ pending: [{ kind: 'suggestion' }] }));
    await expect(fetchPendingCorrections(placeId)).resolves.toEqual({ status: 'unavailable' });

    stubFetch(respond({ pending: 'none' }));
    await expect(fetchPendingCorrections(placeId)).resolves.toEqual({ status: 'unavailable' });
  });

  it('asks for the place without a language, because it returns no words', async () => {
    const fetchMock = stubFetch(respond({ pending: [] }));

    await fetchPendingCorrections(placeId);

    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/places/${placeId}/corrections`);
  });
});
