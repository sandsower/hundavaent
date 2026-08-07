import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/app.css';
import TranslationWorkspace from '$lib/translations/TranslationWorkspace.svelte';
import type { TranslationWorkspace as WorkspaceData } from '$server/translations/workspace';
import TranslationHistoryPage from '../../src/routes/translations/(workspace)/history/+page.svelte';
import TranslationSignInPage from '../../src/routes/translations/sign-in/+page.svelte';

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

  it('serializes continued typing behind an in-flight autosave', async () => {
    vi.useFakeTimers();
    let completeFirstSave!: (response: Response) => void;
    const firstSave = new Promise<Response>((resolve) => (completeFirstSave = resolve));
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: 'site.name',
            locale: 'en',
            value: 'Dog-friendly places',
            version: 4,
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
    await vi.advanceTimersByTimeAsync(700);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await fireEvent.input(english, { target: { value: 'Dog-friendly places' } });
    await vi.advanceTimersByTimeAsync(700);
    expect(fetchMock).toHaveBeenCalledOnce();

    completeFirstSave(
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/translations/api/drafts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'site.name',
        locale: 'en',
        value: 'Dog-friendly places',
        expectedPublicationRevision: 4,
        expectedDraftVersion: 3
      })
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(screen.queryByText('Conflict')).toBeNull();
  });

  it('shows remote and local conflict values and requires confirmation before overwrite', async () => {
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
    expect(screen.getByText('A different edit')).toBeTruthy();
    expect(screen.getByText('Keep this local value')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm overwrite with mine' }));
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

  it('can accept the latest value without overwriting it', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
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
                  draft: { is: 'Hundavænt', en: 'Latest saved value' }
                }
              ]
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    render(TranslationWorkspace, { workspace: workspace([baseEntries[0]]) });
    const english = screen.getByRole('textbox', { name: 'English translation for site.name' });
    await fireEvent.input(english, { target: { value: 'My local edit' } });
    await vi.advanceTimersByTimeAsync(700);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use latest' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Use latest' }));
    expect((english as HTMLTextAreaElement).value).toBe('Latest saved value');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('flushes a delayed edit before navigating through the primary Review action', async () => {
    let completeSave!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => (completeSave = resolve));
    const fetchMock = vi.fn().mockReturnValue(delayed);
    const navigate = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(TranslationWorkspace, { workspace: workspace([baseEntries[0]]), navigate });

    const english = screen.getByRole('textbox', { name: 'English translation for site.name' });
    await fireEvent.input(english, { target: { value: 'Saved before review' } });
    await fireEvent.click(screen.getAllByRole('link', { name: 'Review 1 unpublished change' })[0]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      value: 'Saved before review'
    });
    expect(navigate).not.toHaveBeenCalled();

    completeSave(
      new Response(
        JSON.stringify({
          key: 'site.name',
          locale: 'en',
          value: 'Saved before review',
          version: 3,
          changed: true,
          pendingCount: 1,
          currentRevision: 4
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/translations/review'));
  });

  it('keeps a filtered-out pending row coordinated until its save settles', async () => {
    let completeSave!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => (completeSave = resolve));
    const fetchMock = vi.fn().mockReturnValue(delayed);
    const navigate = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(TranslationWorkspace, { workspace: workspace(), navigate });

    await fireEvent.input(
      screen.getByRole('textbox', { name: 'English translation for site.name' }),
      { target: { value: 'Pending while filtering' } }
    );
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search translations' }), {
      target: { value: 'meta.description' }
    });
    expect(screen.getByText('site.name')).toBeTruthy();
    await fireEvent.click(screen.getAllByRole('link', { name: 'Review 2 unpublished changes' })[0]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    completeSave(
      new Response(
        JSON.stringify({
          key: 'site.name',
          locale: 'en',
          value: 'Pending while filtering',
          version: 3,
          changed: true,
          pendingCount: 2,
          currentRevision: 4
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/translations/review'));
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

  it('reveals an exact initial key beyond the first fifty and applies the textarea limit', () => {
    const entries = Array.from({ length: 51 }, (_, index) => ({
      ...baseEntries[0],
      key: `site.test${index}` as WorkspaceData['entries'][number]['key'],
      published: { is: `Íslenska ${index}`, en: `English ${index}` },
      draft: { is: `Íslenska ${index}`, en: `English ${index}` },
      changed: { is: false, en: false }
    }));
    render(TranslationWorkspace, {
      workspace: workspace(entries),
      initialSearch: 'site.test50'
    });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('site.test50')).toBeTruthy();
    expect(
      screen.getByRole('textbox', { name: 'English translation for site.test50' })
    ).toHaveAttribute('maxlength', '10000');
  });
});

describe('Translation supporting screens', () => {
  it('marks exactly one current revision and makes old revisions unavailable while drafts exist', () => {
    render(TranslationHistoryPage, {
      params: {},
      data: {
        workspace: {
          ...workspace(),
          currentRevision: 4,
          pendingCount: 2,
          revisions: [
            {
              revisionNumber: 4,
              kind: 'publish',
              changeCount: 2,
              publishedAt: '2026-07-21T12:00:00Z',
              restoredFromRevisionNumber: null
            },
            {
              revisionNumber: 3,
              kind: 'publish',
              changeCount: 1,
              publishedAt: '2026-07-20T12:00:00Z',
              restoredFromRevisionNumber: null
            }
          ]
        }
      },
      form: null
    });
    expect(screen.getAllByText('Current')).toHaveLength(1);
    expect(screen.getByText('Restore unavailable')).toBeTruthy();
  });

  it('shows the throttled sign-in state and disables submission', () => {
    render(TranslationSignInPage, {
      params: {},
      data: { redirectTo: '/translations' },
      form: { throttled: true, retryAfterSeconds: 900, redirectTo: '/translations' }
    });
    expect(screen.getByRole('alert').textContent).toContain('Too many failed attempts');
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();
  });
});
