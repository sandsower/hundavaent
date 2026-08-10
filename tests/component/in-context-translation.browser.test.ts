import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/app.css';
import TranslationMode from '$lib/translations/TranslationMode.svelte';

const access = {
  role: 'translation_owner' as const,
  canTranslate: true as const,
  canReview: true,
  actor: { id: 'owner-id', label: 'owner@example.invalid' }
};

const catalogues = {
  is: {
    'about.title': 'Um Hundavænt',
    'common.save': 'Vista',
    'profile.save': 'Vista'
  },
  en: {
    'about.title': 'About Hundavænt',
    'common.save': 'Save',
    'profile.save': 'Save'
  }
};

const emptyWorkspace = {
  access,
  pageId: '/about',
  currentRevision: 4,
  activePackage: null,
  approvedHistory: []
};

const startedPackage = {
  id: '6e1d6ca7-3d29-4533-af30-ab290f7c083b',
  pageId: '/about',
  contextPath: '/en/about',
  baseRevision: 4,
  status: 'draft',
  version: 1,
  reviewNote: null,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
  submittedAt: null,
  reviewedAt: null,
  approvedAt: null,
  exportedAt: null,
  candidateRevision: null,
  author: access.actor,
  reviewer: null,
  entries: []
};

afterEach(() => {
  document.querySelector('[data-test-product-copy]')?.remove();
  vi.unstubAllGlobals();
});

describe('In-context translation mode', () => {
  it('selects visible bundle copy and autosaves both languages without changing public text', async () => {
    const product = document.createElement('main');
    product.dataset.testProductCopy = '';
    product.innerHTML = '<h1>About Hundavænt</h1>';
    document.body.prepend(product);

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init || init.method === 'GET') {
        return jsonResponse({
          workspace: emptyWorkspace,
          selectedPackage: null,
          reviewQueue: [],
          catalogues
        });
      }
      const body = JSON.parse(String(init.body));
      if (init.method === 'POST' && body.action === 'start') {
        return jsonResponse({ package: startedPackage });
      }
      if (init.method === 'PUT') {
        return jsonResponse({
          entry: {
            packageId: startedPackage.id,
            key: 'about.title',
            entryVersion: 1,
            packageVersion: 2,
            changed: true,
            changedBy: access.actor.label,
            changedAt: '2026-08-10T10:02:00.000Z'
          }
        });
      }
      throw new Error(`Unexpected translation request ${init.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(TranslationMode, {
      active: true,
      locale: 'en',
      pageId: '/about',
      contextPath: '/en/about',
      access
    });

    const marker = await screen.findByRole('button', { name: 'Edit translation: about.title' });
    await fireEvent.click(marker);
    expect(screen.getByRole('heading', { name: 'about.title' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Icelandic' })).toHaveValue('Um Hundavænt');
    expect(screen.getByRole('textbox', { name: 'English' })).toHaveValue('About Hundavænt');

    await fireEvent.input(screen.getByRole('textbox', { name: 'Icelandic' }), {
      target: { value: 'Um verkefnið' }
    });
    await fireEvent.input(screen.getByRole('textbox', { name: 'English' }), {
      target: { value: 'About the project' }
    });

    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy(), { timeout: 2500 });
    expect(fetchMock).toHaveBeenCalledWith('/api/translations/context', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: expect.stringContaining('About the project')
    });
    expect(product.textContent).toBe('About Hundavænt');
  });

  it('shows duplicate key choices and keeps Browse mode available', async () => {
    const product = document.createElement('main');
    product.dataset.testProductCopy = '';
    product.innerHTML = '<a href="/en/account">Save</a>';
    document.body.prepend(product);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          workspace: emptyWorkspace,
          selectedPackage: null,
          reviewQueue: [],
          catalogues
        })
      )
    );

    render(TranslationMode, {
      active: true,
      locale: 'en',
      pageId: '/about',
      contextPath: '/en/about',
      access
    });

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Choose translation key for: Save' })
    );
    expect(screen.getByRole('button', { name: 'common.save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'profile.save' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Browse page' }));
    expect(screen.getByRole('button', { name: 'Edit copy' })).toBeTruthy();
  });

  it('starts marker scanning when an authorized user activates mode without a page reload', async () => {
    const product = document.createElement('main');
    product.dataset.testProductCopy = '';
    product.innerHTML = '<a data-translation-key="about.title">About Hundavænt</a>';
    document.body.prepend(product);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          workspace: emptyWorkspace,
          selectedPackage: null,
          reviewQueue: [],
          catalogues
        })
      )
    );

    const view = render(TranslationMode, {
      active: false,
      locale: 'en',
      pageId: '/about',
      contextPath: '/en/about',
      access
    });
    await view.rerender({
      active: true,
      locale: 'en',
      pageId: '/about',
      contextPath: '/en/about',
      access
    });

    expect(
      await screen.findByRole('button', { name: 'Edit translation: about.title' })
    ).toBeTruthy();
  });

  it('keeps submit disabled until the selected translation has autosaved', async () => {
    const product = document.createElement('main');
    product.dataset.testProductCopy = '';
    product.innerHTML = '<h1>About Hundavænt</h1>';
    document.body.prepend(product);
    const activePackage = {
      ...startedPackage,
      entries: [
        {
          key: 'about.title',
          baseline: { is: 'Um Hundavænt', en: 'About Hundavænt' },
          draft: { is: 'Um verkefnið', en: 'About the project' },
          version: 1,
          changedBy: access.actor.label,
          changedAt: '2026-08-10T10:02:00.000Z',
          complete: true
        }
      ]
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init || init.method === 'GET') {
        return jsonResponse({
          workspace: { ...emptyWorkspace, activePackage },
          selectedPackage: null,
          reviewQueue: [],
          catalogues
        });
      }
      if (init.method === 'PUT') {
        return jsonResponse({
          entry: {
            packageId: activePackage.id,
            key: 'about.title',
            entryVersion: 2,
            packageVersion: 2,
            changed: true,
            changedBy: access.actor.label,
            changedAt: '2026-08-10T10:03:00.000Z'
          }
        });
      }
      throw new Error(`Unexpected translation request ${init.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(TranslationMode, {
      active: true,
      locale: 'en',
      pageId: '/about',
      contextPath: '/en/about',
      access
    });

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Edit translation: about.title' })
    );
    const submit = screen.getByRole('button', { name: 'Submit page package' });
    expect(submit).toBeEnabled();

    await fireEvent.input(screen.getByRole('textbox', { name: 'English' }), {
      target: { value: 'About our project' }
    });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close translation panel' })).toBeDisabled();

    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy(), { timeout: 2500 });
    expect(submit).toBeEnabled();
  });

  it('keeps submit disabled while any entry in the page package is incomplete', async () => {
    const product = document.createElement('main');
    product.dataset.testProductCopy = '';
    product.innerHTML = '<h1>About Hundavænt</h1>';
    document.body.prepend(product);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          workspace: {
            ...emptyWorkspace,
            activePackage: {
              ...startedPackage,
              entries: [
                {
                  key: 'about.title',
                  baseline: { is: 'Um Hundavænt', en: 'About Hundavænt' },
                  draft: { is: 'Um verkefnið', en: 'About the project' },
                  version: 1,
                  changedBy: access.actor.label,
                  changedAt: '2026-08-10T10:02:00.000Z',
                  complete: true
                },
                {
                  key: 'profile.save',
                  baseline: { is: 'Vista', en: 'Save' },
                  draft: { is: '', en: 'Save profile' },
                  version: 1,
                  changedBy: access.actor.label,
                  changedAt: '2026-08-10T10:02:00.000Z',
                  complete: false
                }
              ]
            }
          },
          selectedPackage: null,
          reviewQueue: [],
          catalogues
        })
      )
    );

    render(TranslationMode, {
      active: true,
      locale: 'en',
      pageId: '/about',
      contextPath: '/en/about',
      access
    });

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Edit translation: about.title' })
    );
    expect(screen.getByRole('button', { name: 'Submit page package' })).toBeDisabled();
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
