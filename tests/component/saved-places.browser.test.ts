import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import SavedPlacesPage from '../../src/routes/[lang=lang]/saved/+page.svelte';

const { invalidateAllMock } = vi.hoisted(() => ({
  invalidateAllMock: vi.fn<() => Promise<void>>(async () => undefined)
}));

vi.mock('$app/navigation', () => ({ invalidateAll: invalidateAllMock }));

const places = [
  {
    placeId: '30000000-0000-4000-8000-000000000003',
    name: 'Available Place',
    category: 'park' as const,
    locality: 'Reykjavík',
    savedAt: '2026-07-11T10:00:00Z',
    availability: 'available' as const,
    successorPlaceId: null,
    successorName: null,
    successorAvailable: false
  },
  {
    placeId: '30000000-0000-4000-8000-000000000004',
    name: 'Reviewing Place',
    category: 'cafe' as const,
    locality: 'Kópavogur',
    savedAt: '2026-07-11T09:00:00Z',
    availability: 'unavailable' as const,
    successorPlaceId: null,
    successorName: null,
    successorAvailable: false
  },
  {
    placeId: '30000000-0000-4000-8000-000000000005',
    name: 'Inactive Place',
    category: 'restaurant' as const,
    locality: 'Hafnarfjörður',
    savedAt: '2026-07-11T08:00:00Z',
    availability: 'inactive' as const,
    successorPlaceId: '30000000-0000-4000-8000-000000000006',
    successorName: 'Successor Place',
    successorAvailable: true
  }
];

describe('Saved Places page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateAllMock.mockReset();
    invalidateAllMock.mockResolvedValue(undefined);
  });

  it('shows only caller-safe availability states and keeps unavailable Places removable', () => {
    render(SavedPlacesPage, {
      params: { lang: 'en' },
      form: null,
      data: {
        lang: 'en',
        copy: catalogues.en,
        signedIn: true,
        savedPlaces: places,
        nextCursor: null,
        isFirstPage: true
      }
    });

    expect(screen.getByRole('heading', { name: 'Saved places' })).toBeTruthy();
    expect(screen.getByText('Available in place discovery')).toBeTruthy();
    expect(screen.getByText('Temporarily unavailable in place discovery')).toBeTruthy();
    expect(screen.getByText('This place is no longer active')).toBeTruthy();
    expect(
      screen.getByText(
        'The information is being reviewed. Private moderation details are not shown.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'The place has closed or is no longer represented here. Private moderation details are not shown.'
      )
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Remove .* from saved places/ })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'View place' })).toHaveLength(1);
    expect(
      screen.getByText('This place is no longer active. It continued as Successor Place.')
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Successor Place' })).toBeTruthy();
  });

  it('renders the private empty state in Icelandic', () => {
    render(SavedPlacesPage, {
      params: { lang: 'is' },
      form: null,
      data: {
        lang: 'is',
        copy: catalogues.is,
        signedIn: true,
        savedPlaces: [],
        nextCursor: null,
        isFirstPage: true
      }
    });

    expect(screen.getByRole('heading', { name: 'Engir vistaðir staðir enn' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Til baka í staðaleit' })).toBeTruthy();
  });

  it('uses distinct temporary and inactive help in Icelandic', () => {
    render(SavedPlacesPage, {
      params: { lang: 'is' },
      form: null,
      data: {
        lang: 'is',
        copy: catalogues.is,
        signedIn: true,
        savedPlaces: places.slice(1),
        nextCursor: null,
        isFirstPage: true
      }
    });

    expect(
      screen.getByText(
        'Upplýsingarnar eru í yfirferð. Einkaupplýsingar um umsýslu eru ekki birtar.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Staðurinn hefur lokað eða er ekki lengur skráður hér. Einkaupplýsingar um umsýslu eru ekki birtar.'
      )
    ).toBeTruthy();
  });

  it('distinguishes an empty later page from a globally empty saved list', () => {
    render(SavedPlacesPage, {
      params: { lang: 'en' },
      form: null,
      data: {
        lang: 'en',
        copy: catalogues.en,
        signedIn: true,
        savedPlaces: [],
        nextCursor: null,
        isFirstPage: false
      }
    });

    expect(screen.getByRole('heading', { name: 'No saved places on this page' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No saved places yet' })).toBeNull();
  });

  it.each([
    [
      'first',
      0,
      'Remove Available Place from saved places',
      'Remove Reviewing Place from saved places'
    ],
    [
      'middle',
      1,
      'Remove Reviewing Place from saved places',
      'Remove Inactive Place from saved places'
    ],
    [
      'final',
      2,
      'Remove Inactive Place from saved places',
      'Remove Reviewing Place from saved places'
    ]
  ] as const)(
    'announces keyboard removal and restores focus after removing the %s row',
    async (_, __, removeLabel, focusLabel) => {
      stubSuccessfulRemoval();
      render(SavedPlacesPage, {
        params: { lang: 'en' },
        form: null,
        data: {
          lang: 'en',
          copy: catalogues.en,
          signedIn: true,
          savedPlaces: places,
          nextCursor: null,
          isFirstPage: true
        }
      });

      const button = screen.getByRole('button', { name: removeLabel });
      button.focus();
      await fireEvent.keyDown(button, { key: 'Enter' });
      await fireEvent.click(button);

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: focusLabel }))
      );
      expect(screen.getByRole('status').textContent).toContain(
        'was removed from your saved places'
      );
    }
  );

  it('focuses the global empty-state heading after removing the sole saved Place', async () => {
    stubSuccessfulRemoval();
    render(SavedPlacesPage, {
      params: { lang: 'en' },
      form: null,
      data: {
        lang: 'en',
        copy: catalogues.en,
        signedIn: true,
        savedPlaces: [places[0]],
        nextCursor: null,
        isFirstPage: true
      }
    });

    await fireEvent.click(
      screen.getByRole('button', { name: 'Remove Available Place from saved places' })
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'No saved places yet' })
      )
    );
  });

  it('shows and focuses the later-page empty state after removing its final row', async () => {
    stubSuccessfulRemoval();
    render(SavedPlacesPage, {
      params: { lang: 'en' },
      form: null,
      data: {
        lang: 'en',
        copy: catalogues.en,
        signedIn: true,
        savedPlaces: [places[0]],
        nextCursor: null,
        isFirstPage: false
      }
    });

    await fireEvent.click(
      screen.getByRole('button', { name: 'Remove Available Place from saved places' })
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'No saved places on this page' })
      )
    );
    expect(screen.queryByRole('heading', { name: 'No saved places yet' })).toBeNull();
  });

  it('does not let an older external refresh overwrite a successful local removal', async () => {
    stubSuccessfulRemoval();
    const staleRefresh = deferred<void>();
    const freshRefresh = deferred<void>();
    invalidateAllMock
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockImplementationOnce(() => freshRefresh.promise);
    const external = new BroadcastChannel('hundavaent-favourites');
    const view = render(SavedPlacesPage, {
      params: { lang: 'en' },
      form: null,
      data: {
        lang: 'en',
        copy: catalogues.en,
        signedIn: true,
        savedPlaces: [places[0]],
        nextCursor: null,
        isFirstPage: true
      }
    });

    try {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      external.postMessage({ type: 'invalidate', sourceId: 'external-tab' });
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalledTimes(1));

      await fireEvent.click(
        screen.getByRole('button', { name: 'Remove Available Place from saved places' })
      );
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'No saved places yet' })).toBeTruthy()
      );

      await view.rerender({
        params: { lang: 'en' },
        form: null,
        data: {
          lang: 'en',
          copy: catalogues.en,
          signedIn: true,
          savedPlaces: [places[0]],
          nextCursor: null,
          isFirstPage: true
        }
      });
      staleRefresh.resolve();
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalledTimes(2));

      expect(screen.queryByRole('heading', { name: 'Available Place' })).toBeNull();

      await view.rerender({
        params: { lang: 'en' },
        form: null,
        data: {
          lang: 'en',
          copy: catalogues.en,
          signedIn: true,
          savedPlaces: [],
          nextCursor: null,
          isFirstPage: true
        }
      });
      freshRefresh.resolve();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'No saved places yet' })).toBeTruthy()
      );
    } finally {
      external.close();
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function stubSuccessfulRemoval(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { desiredState: boolean };
      return new Response(
        JSON.stringify({ placeId: placeIdFromInput(_input), isFavourite: body.desiredState }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    })
  );
}

function placeIdFromInput(input: RequestInfo | URL): string {
  return String(input).split('/').at(-1) ?? '';
}
