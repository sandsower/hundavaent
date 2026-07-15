import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import InlineRating from '$lib/discovery/InlineRating.svelte';
import { catalogues } from '$i18n';

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const placeId = '30000000-0000-4000-8000-000000000003';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  requestAuthentication.mockReset();
});

describe('InlineRating', () => {
  it('keeps stars visible while signed out and carries the chosen overall score into AuthDialog', async () => {
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: false,
      summary: null
    });

    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));

    expect(requestAuthentication).toHaveBeenCalledWith({
      origin: 'rating',
      intent: { action: 'rating', placeId, placeName: 'Brikk', overallRating: 2 }
    });
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('autosaves overall, visually inherits untouched categories, and reveals an optional low-score note', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return new Response(JSON.stringify({ rating: null }));
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            rating: {
              id: 'rating-1',
              placeId,
              overallScore: 2,
              scores: { welcome: null, clarity: null, comfort: null, thoughtfulness: null },
              ratedAt: '2026-07-15T00:00:00Z',
              excluded: false,
              privateNote: null,
              privateNoteClassification: null,
              privateNoteUpdatedAt: null,
              linkedReportId: null
            }
          })
        );
      })
    );
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ overall: 2, welcome: null, noteUpdate: false });
    expect(screen.getByText('What could be better? (optional)')).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('does not let a stale initial read overwrite a newer star selection', async () => {
    const initialRead = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return initialRead.promise;
        return new Response(JSON.stringify({ rating: null }));
      })
    );
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    initialRead.resolve(
      new Response(
        JSON.stringify({
          rating: {
            id: 'rating-1',
            placeId,
            overallScore: 4,
            scores: { welcome: null, clarity: null, comfort: null, thoughtfulness: null },
            ratedAt: '2026-07-15T00:00:00Z',
            privateNote: null,
            privateNoteUpdatedAt: null
          }
        })
      )
    );

    const overallGroup = screen.getByRole('radiogroup', { name: 'Overall rating' });
    await waitFor(() =>
      expect(overallGroup.querySelector('[aria-label="2 stars"]')).toHaveAttribute(
        'aria-checked',
        'true'
      )
    );
  });

  it('retains the newest queued snapshot when an earlier save fails', async () => {
    const firstSave = deferred<Response>();
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return new Response(JSON.stringify({ rating: null }));
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (bodies.length === 1) return firstSave.promise;
        return new Response(JSON.stringify({ rating: null }));
      })
    );
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    await fireEvent.click(
      screen.getByRole('radiogroup', { name: 'Welcome' }).querySelectorAll('[role="radio"]')[3]
    );
    firstSave.resolve(new Response(null, { status: 503 }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ overall: 2, welcome: 4 });
  });

  it('does not let an older note save clear a newer unsaved edit', async () => {
    const firstNoteSave = deferred<Response>();
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return new Response(JSON.stringify({ rating: null }));
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (bodies.length === 2) return firstNoteSave.promise;
        return new Response(JSON.stringify({ rating: null }));
      })
    );
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    await waitFor(() => expect(bodies).toHaveLength(1));

    vi.useFakeTimers();
    const note = screen.getByRole('textbox', { name: 'What could be better? (optional)' });
    await fireEvent.input(note, { target: { value: 'First note' } });
    await vi.advanceTimersByTimeAsync(651);
    expect(bodies).toHaveLength(2);

    await fireEvent.input(note, { target: { value: 'Newer note' } });
    firstNoteSave.resolve(new Response(JSON.stringify({ rating: null })));
    await vi.advanceTimersByTimeAsync(651);

    expect(bodies).toHaveLength(3);
    expect(bodies[2]).toMatchObject({ noteUpdate: true, privateNote: 'Newer note' });
  });

  it('announces save failure and keeps retry reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return new Response(JSON.stringify({ rating: null }));
        return new Response(null, { status: 503 });
      })
    );
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));

    expect(await screen.findByText('Not saved. Try again.')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('describes an initial load failure without implying unsaved changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 }))
    );
    render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });

    expect(await screen.findByText("Couldn't load your rating. Try again.")).toHaveAttribute(
      'aria-live',
      'polite'
    );
    expect(screen.queryByText('Not saved. Try again.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('flushes the latest dirty snapshot with keepalive when unmounted', async () => {
    const pendingSave = deferred<Response>();
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return new Response(JSON.stringify({ rating: null }));
        calls.push(init);
        return init.keepalive
          ? new Response(JSON.stringify({ rating: null }))
          : pendingSave.promise;
      })
    );
    const view = render(InlineRating, {
      placeId,
      placeName: 'Brikk',
      copy: catalogues.en,
      signedIn: true,
      summary: null
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    await fireEvent.click(
      screen.getByRole('radiogroup', { name: 'Welcome' }).querySelectorAll('[role="radio"]')[3]
    );
    view.unmount();

    const keepalive = calls.find((call) => call.keepalive);
    expect(keepalive).toBeTruthy();
    expect(JSON.parse(String(keepalive?.body))).toMatchObject({ overall: 2, welcome: 4 });
    pendingSave.resolve(new Response(JSON.stringify({ rating: null })));
  });
});
