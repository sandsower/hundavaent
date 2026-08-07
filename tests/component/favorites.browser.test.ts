import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import FavoritesPage from '../../src/routes/[lang=lang]/favorites/+page.svelte';

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

describe('Favorites page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateAllMock.mockReset();
    invalidateAllMock.mockResolvedValue(undefined);
  });

  it('shows only caller-safe availability states and keeps unavailable Places removable', () => {
    render(FavoritesPage, {
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

    expect(screen.getByRole('heading', { name: 'Favorites' })).toBeTruthy();
    expect(screen.getByText('Available in place discovery')).toBeTruthy();
    expect(screen.getByText('Temporarily unavailable in place discovery')).toBeTruthy();
    expect(screen.getByText('This place is no longer active')).toBeTruthy();
    expect(screen.getByText('This place is not available in discovery right now.')).toBeTruthy();
    expect(screen.getByText('This place is no longer available here.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Remove .* from favorites/ })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'View place' })).toHaveLength(1);
    expect(
      screen.getByText('This place is no longer active. It continued as Successor Place.')
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Successor Place' })).toBeTruthy();
  });

  it('renders the private empty state in Icelandic', () => {
    render(FavoritesPage, {
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

    expect(screen.getByRole('heading', { name: 'Engir uppáhaldsstaðir enn' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Til baka í staðaleit' })).toBeTruthy();
  });

  it('uses distinct temporary and inactive help in Icelandic', () => {
    render(FavoritesPage, {
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

    expect(screen.getByText('Þessi staður er ekki tiltækur í leitinni eins og er.')).toBeTruthy();
    expect(screen.getByText('Þessi staður er ekki lengur tiltækur hér.')).toBeTruthy();
  });

  it('distinguishes an empty later page from a globally empty saved list', () => {
    render(FavoritesPage, {
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

    expect(screen.getByRole('heading', { name: 'No favorites on this page' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No favorites yet' })).toBeNull();
  });

  it.each([
    ['first', 0, 'Remove Available Place from favorites', 'Remove Reviewing Place from favorites'],
    ['middle', 1, 'Remove Reviewing Place from favorites', 'Remove Inactive Place from favorites'],
    ['final', 2, 'Remove Inactive Place from favorites', 'Remove Reviewing Place from favorites']
  ] as const)(
    'announces keyboard removal and restores focus after removing the %s row',
    async (_, __, removeLabel, focusLabel) => {
      stubSuccessfulRemoval();
      render(FavoritesPage, {
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
      const liveStatus = screen.getByRole('status');
      expect(liveStatus.textContent).toContain('was removed from your favorites');
      expect(getComputedStyle(liveStatus).position).toBe('absolute');
      expect(getComputedStyle(liveStatus).width).toBe('1px');
      expect(getComputedStyle(liveStatus).height).toBe('1px');
    }
  );

  it('focuses the global empty-state heading after removing the sole saved Place', async () => {
    stubSuccessfulRemoval();
    render(FavoritesPage, {
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
      screen.getByRole('button', { name: 'Remove Available Place from favorites' })
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'No favorites yet' }))
    );
  });

  it('shows and focuses the later-page empty state after removing its final row', async () => {
    stubSuccessfulRemoval();
    render(FavoritesPage, {
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
      screen.getByRole('button', { name: 'Remove Available Place from favorites' })
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'No favorites on this page' })
      )
    );
    expect(screen.queryByRole('heading', { name: 'No favorites yet' })).toBeNull();
  });

  it('does not let an older external refresh overwrite a successful local removal', async () => {
    stubSuccessfulRemoval();
    const staleRefresh = deferred<void>();
    const freshRefresh = deferred<void>();
    invalidateAllMock
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockImplementationOnce(() => freshRefresh.promise);
    const external = new BroadcastChannel('hundavaent-favourites');
    const view = render(FavoritesPage, {
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
        screen.getByRole('button', { name: 'Remove Available Place from favorites' })
      );
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'No favorites yet' })).toBeTruthy()
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
        expect(screen.getByRole('heading', { name: 'No favorites yet' })).toBeTruthy()
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
        JSON.stringify({
          placeId: placeIdFromInput(_input),
          isFavourite: body.desiredState,
          changedAt: '2026-07-13T12:00:00.000Z',
          recognition: {
            action: 'favourite',
            recognized: false,
            firstTimeForPlace: false,
            activatedCurrentWeek: false,
            currentWeek: {
              startsOn: '2026-07-13',
              endsOn: '2026-07-19',
              active: true
            }
          }
        }),
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
