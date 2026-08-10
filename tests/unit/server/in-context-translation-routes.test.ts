import { describe, expect, it, vi } from 'vitest';

import {
  GET as getContext,
  PUT as putContext
} from '../../../src/routes/api/translations/context/+server';
import { POST as setMode } from '../../../src/routes/api/translations/mode/+server';

const ownerAccess = {
  role: 'translation_owner',
  canTranslate: true,
  canReview: true,
  actor: { id: 'owner-id', label: 'owner@example.invalid' }
};

const workspace = {
  access: ownerAccess,
  pageId: '/about',
  currentRevision: 4,
  activePackage: null,
  approvedHistory: []
};

function eventFor(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    rpc?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const request = new Request(url, {
    method: options.method ?? 'GET',
    headers:
      options.method && options.method !== 'GET' ? { 'content-type': 'application/json' } : {},
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const cookies = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
  return {
    event: {
      request,
      url: new URL(url),
      cookies,
      locals: {
        requestId: 'route-request',
        supabase: { rpc: options.rpc ?? vi.fn() }
      }
    },
    cookies
  };
}

describe('in-context translation routes', () => {
  it('denies ordinary accounts without returning bundle or status payloads', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const { event } = eventFor('https://hundavaent.is/api/translations/context?pageId=%2Fabout', {
      rpc
    });

    const response = await getContext(event as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns both source catalogues and the private page workspace only to an owner', async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === 'get_my_interface_translation_access') {
        return { data: ownerAccess, error: null };
      }
      if (functionName === 'get_my_interface_translation_workspace') {
        return { data: workspace, error: null };
      }
      if (functionName === 'list_interface_translation_review_packages') {
        return { data: [], error: null };
      }
      return { data: null, error: { code: 'unknown' } };
    });
    const { event } = eventFor('https://hundavaent.is/api/translations/context?pageId=%2Fabout', {
      rpc
    });

    const response = await getContext(event as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace).toEqual(workspace);
    expect(body.reviewQueue).toEqual([]);
    expect(body.catalogues.is['nav.about']).toBe('Um Hundavænt');
    expect(body.catalogues.en['nav.about']).toBe('About');
  });

  it('maps stale autosave writes to a reloadable conflict', async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === 'get_my_interface_translation_access') {
        return { data: ownerAccess, error: null };
      }
      return { data: null, error: { code: '40001' } };
    });
    const { event } = eventFor('https://hundavaent.is/api/translations/context', {
      method: 'PUT',
      rpc,
      body: {
        packageId: '6e1d6ca7-3d29-4533-af30-ab290f7c083b',
        key: 'nav.about',
        valueIs: 'Um okkur',
        valueEn: 'About us',
        expectedEntryVersion: 1,
        requestId: 'save-request'
      }
    });

    const response = await putContext(event as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'conflict' });
  });

  it('does not set a translation-mode cookie for an ordinary account', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const { event, cookies } = eventFor('https://hundavaent.is/api/translations/mode', {
      method: 'POST',
      rpc,
      body: { active: true }
    });

    const response = await setMode(event as never);

    expect(response.status).toBe(403);
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it('sets a strict server-only mode preference for an authorized account', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ownerAccess, error: null });
    const { event, cookies } = eventFor('https://hundavaent.is/api/translations/mode', {
      method: 'POST',
      rpc,
      body: { active: true }
    });

    const response = await setMode(event as never);

    expect(response.status).toBe(200);
    expect(cookies.set).toHaveBeenCalledWith('hundavaent-translation-mode', 'active', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      maxAge: 2_592_000
    });
  });
});
