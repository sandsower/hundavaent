import { describe, expect, it, vi } from 'vitest';

import { load } from '../../../src/routes/[lang=lang]/favorites/+page.server';

const placeId = '30000000-0000-4000-8000-000000000003';

describe('Favorites page boundary', () => {
  it('opens the contextual sign-in dialog and preserves the Favorites destination', async () => {
    await expect(
      load({
        locals: { requestId: 'request-signed-out' },
        params: { lang: 'en' },
        parent: vi.fn(async () => ({ signedIn: false })),
        setHeaders: vi.fn(),
        url: new URL('http://localhost/en/favorites')
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: `/en?auth=open&authReturnTo=${encodeURIComponent('/en/favorites')}`
    });
  });

  it('requests one lookahead row and exposes a cursor only when one exists', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      place_id: `30000000-0000-4000-8000-${String(999999999999 - index).padStart(12, '0')}`,
      name: `Place ${index + 1}`,
      category: 'park',
      locality: 'Reykjavík',
      saved_at: new Date(Date.UTC(2026, 6, 11, 10, 0, -index)).toISOString(),
      availability: 'available',
      successor_place_id: null,
      successor_name: null,
      successor_available: false
    }));
    const rpc = vi.fn(async () => ({ data: rows, error: null }));

    const result = await load({
      locals: { supabase: { rpc }, requestId: 'request-1' },
      params: { lang: 'en' },
      parent: vi.fn(async () => ({ signedIn: true })),
      setHeaders: vi.fn(),
      url: new URL('http://localhost/en/favorites')
    } as never);
    if (!result) throw new Error('Saved page load returned no data');

    expect(result.savedPlaces).toHaveLength(24);
    expect(result.nextCursor).toEqual({
      beforeSavedAt: rows[23].saved_at,
      beforePlaceId: rows[23].place_id
    });
    expect(result.isFirstPage).toBe(true);
    expect(result.savedPlaces[0]).toMatchObject({
      successorPlaceId: null,
      successorName: null,
      successorAvailable: false
    });
    expect(rpc).toHaveBeenCalledWith('list_current_favourites', {
      requested_before_place_id: undefined,
      requested_before_saved_at: undefined,
      requested_limit: 25,
      requested_locale: 'en'
    });
  });

  it.each([
    `http://localhost/en/favorites?before=not-a-date&beforePlace=${placeId}`,
    `http://localhost/en/favorites?before=1&beforePlace=${placeId}`,
    'http://localhost/en/favorites?before=2026-07-11T10%3A00%3A00Z&beforePlace=not-a-place',
    'http://localhost/en/favorites?before=2026-07-11T10%3A00%3A00Z',
    'http://localhost/en/favorites?beforePlace=not-a-place'
  ])('rejects a malformed or incomplete cursor: %s', async (url) => {
    await expect(
      load({
        locals: { supabase: { rpc: vi.fn() }, requestId: 'request-2' },
        params: { lang: 'en' },
        parent: vi.fn(async () => ({ signedIn: true })),
        setHeaders: vi.fn(),
        url: new URL(url)
      } as never)
    ).rejects.toMatchObject({ status: 400 });
  });
});
