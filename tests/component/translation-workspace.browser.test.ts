import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TranslationWorkspace from '$lib/translations/TranslationWorkspace.svelte';
import type { TranslationWorkspace as WorkspaceData } from '$server/translations/workspace';

const baseEntries: WorkspaceData['entries'] = [
  {
    key: 'site.name',
    namespace: 'site',
    published: { is: 'Hundavænt', en: 'Dog Friendly' },
    draft: { is: 'Hundavænt', en: 'Dog friendly' },
    versions: { is: 0, en: 2 },
    changed: { is: false, en: true }
  },
  {
    key: 'meta.description',
    namespace: 'meta',
    published: { is: 'Finndu stað fyrir {name}', en: 'Find a place for {name}' },
    draft: { is: 'Finndu stað fyrir {name}', en: '' },
    versions: { is: 0, en: 1 },
    changed: { is: false, en: true }
  }
];

function workspace(entries = baseEntries): WorkspaceData {
  return {
    currentRevision: 4,
    publishedAt: '2026-07-21T12:00:00Z',
    draftGeneration: 9,
    pendingCount: entries.filter((entry) => entry.changed.is || entry.changed.en).length,
    entries,
    revisions: []
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Translation workspace', () => {
  it('filters by search, namespace, missing values, and unpublished changes', async () => {
    render(TranslationWorkspace, { workspace: workspace() });

    expect(screen.getByRole('heading', { name: 'Translations' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(2);

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search translations' }), {
      target: { value: 'site.name' }
    });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('site.name')).toBeTruthy();

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search translations' }), {
      target: { value: '' }
    });
    await fireEvent.change(screen.getByRole('combobox', { name: 'Namespace' }), {
      target: { value: 'meta' }
    });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('meta.description')).toBeTruthy();

    await fireEvent.change(screen.getByRole('combobox', { name: 'Namespace' }), {
      target: { value: 'all' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Missing' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('meta.description')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('treats both languages equally and can put either language first', async () => {
    render(TranslationWorkspace, { workspace: workspace([baseEntries[0]]) });
    const card = screen.getByRole('article');
    const labelsBefore = within(card)
      .getAllByText(/Icelandic|English/)
      .map((node) => node.textContent);
    expect(labelsBefore[0]).toContain('Icelandic');

    await fireEvent.click(screen.getByRole('button', { name: 'Show English first' }));
    const labelsAfter = within(card)
      .getAllByText(/Icelandic|English/)
      .map((node) => node.textContent);
    expect(labelsAfter[0]).toContain('English');
  });

  it('autosaves a changed field and updates the shared pending count', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: 'site.name',
          locale: 'en',
          value: 'Dog-friendly',
          version: 3,
          changed: true,
          pendingCount: 1,
          currentRevision: 4
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    render(TranslationWorkspace, { workspace: workspace([baseEntries[0]]) });

    const english = screen.getByRole('textbox', { name: 'English translation for site.name' });
    await fireEvent.input(english, { target: { value: 'Dog-friendly' } });
    expect(screen.getByText('Unsaved')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(700);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith('/translations/api/drafts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'site.name',
        locale: 'en',
        value: 'Dog-friendly',
        expectedPublicationRevision: 4,
        expectedDraftVersion: 2
      })
    });
    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Review 1 unpublished change' })).toBeTruthy();
  });

  it('shows a conflict without discarding the local value and offers retry', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'conflict' }), {
          status: 409,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace: {
              ...workspace([baseEntries[0]]),
              currentRevision: 5,
              entries: [
                {
                  ...baseEntries[0],
                  versions: { is: 0, en: 4 },
                  draft: { is: 'Hundavænt', en: 'A different edit' }
                }
              ]
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: 'site.name',
            locale: 'en',
            value: 'Keep this local value',
            version: 5,
            changed: true,
            pendingCount: 1,
            currentRevision: 5
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    render(TranslationWorkspace, { workspace: workspace([baseEntries[0]]) });

    const english = screen.getByRole('textbox', { name: 'English translation for site.name' });
    await fireEvent.input(english, { target: { value: 'Keep this local value' } });
    await vi.advanceTimersByTimeAsync(700);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('changed elsewhere')
    );
    expect((english as HTMLTextAreaElement).value).toBe('Keep this local value');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry saving English for site.name' })
    );
    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/translations/api/drafts');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/translations/api/drafts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'site.name',
        locale: 'en',
        value: 'Keep this local value',
        expectedPublicationRevision: 5,
        expectedDraftVersion: 4
      })
    });
    expect((english as HTMLTextAreaElement).value).toBe('Keep this local value');
  });

  it('shows placeholder and missing-value problems next to the affected card', async () => {
    render(TranslationWorkspace, { workspace: workspace([baseEntries[1]]) });

    expect(screen.getByRole('alert').textContent).toContain('English is missing');
    const english = screen.getByRole('textbox', {
      name: 'English translation for meta.description'
    });
    await fireEvent.input(english, { target: { value: 'Find {count} places' } });
    expect(screen.getByRole('alert').textContent).toContain('Placeholders must match');
  });

  it('renders only fifty matching cards until more are requested', async () => {
    const entries = Array.from({ length: 51 }, (_, index) => ({
      ...baseEntries[0],
      key: `site.test${index}` as WorkspaceData['entries'][number]['key'],
      published: { is: `Íslenska ${index}`, en: `English ${index}` },
      draft: { is: `Íslenska ${index}`, en: `English ${index}` },
      changed: { is: false, en: false }
    }));
    render(TranslationWorkspace, { workspace: workspace(entries) });

    expect(screen.getAllByRole('article')).toHaveLength(50);
    await fireEvent.click(screen.getByRole('button', { name: 'Show more translations' }));
    expect(screen.getAllByRole('article')).toHaveLength(51);
  });
});
