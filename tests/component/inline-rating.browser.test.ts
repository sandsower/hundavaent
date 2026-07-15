import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import InlineRating from '$lib/discovery/InlineRating.svelte';
import { catalogues } from '$i18n';

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const placeId = '30000000-0000-4000-8000-000000000003';

afterEach(() => {
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
    await waitFor(() => expect(screen.queryByText('Retry')).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ overall: 2, welcome: null, noteUpdate: false });
    expect(screen.getByText('What could be better? (optional)')).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});
