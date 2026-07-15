import { describe, expect, it, vi } from 'vitest';

import { load } from '../../../src/routes/[lang=lang]/history/+page.server';

function personalPlaceRow(index: number) {
  return {
    place_id: `a1000000-0000-4000-8000-${String(999999999999 - index).padStart(12, '0')}`,
    name: `Place ${index + 1}`,
    category: 'park',
    locality: 'Reykjavík',
    latitude: 64.14,
    longitude: -21.94,
    is_favourite: true,
    favourited_at: new Date(Date.UTC(2026, 6, 11, 10, 0, -index)).toISOString(),
    visit_count: null,
    first_visited_at: null,
    last_visited_at: null,
    last_activity_at: new Date(Date.UTC(2026, 6, 11, 10, 0, -index)).toISOString(),
    availability: 'available',
    successor_place_id: null,
    successor_name: null,
    successor_available: null
  };
}

describe('Personal history page boundary', () => {
  it('does not query private history when the canonical layout is signed out', async () => {
    const rpc = vi.fn();

    await expect(
      load({
        locals: { supabase: { rpc }, requestId: 'request-signed-out' },
        params: { lang: 'en' },
        parent: vi.fn(async () => ({ signedIn: false })),
        setHeaders: vi.fn(),
        url: new URL('http://localhost/en/history?view=map')
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: `/en/account?returnTo=${encodeURIComponent('/en/history?view=map')}`
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('redirects a signed-in but not-activated Member through sign-in instead of failing', async () => {
    // A session cookie exists (layout says signedIn) but the Member activation is missing or was
    // revoked, so the RPC denies with 42501 and the adapter reports authentication_required.
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'Member activation required' }
    }));

    await expect(
      load({
        locals: { supabase: { rpc }, requestId: 'request-1' },
        params: { lang: 'en' },
        parent: vi.fn(async () => ({ signedIn: true })),
        setHeaders: vi.fn(),
        url: new URL('http://localhost/en/history?view=visited')
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: `/en/account?returnTo=${encodeURIComponent('/en/history?view=visited')}`
    });
  });

  it('redirects the not-activated map view identically', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'Member activation required' }
    }));

    await expect(
      load({
        locals: { supabase: { rpc }, requestId: 'request-2' },
        params: { lang: 'is' },
        parent: vi.fn(async () => ({ signedIn: true })),
        setHeaders: vi.fn(),
        url: new URL('http://localhost/is/history?view=map')
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: `/is/account?returnTo=${encodeURIComponent('/is/history?view=map')}`
    });
  });

  it('flags map truncation only when the lookahead row past the window exists', async () => {
    const fullWindow = Array.from({ length: 201 }, (_, index) => personalPlaceRow(index));
    const rpc = vi.fn(async () => ({ data: fullWindow, error: null }));

    const result = await load({
      locals: { supabase: { rpc }, requestId: 'request-3' },
      params: { lang: 'en' },
      parent: vi.fn(async () => ({ signedIn: true })),
      setHeaders: vi.fn(),
      url: new URL('http://localhost/en/history?view=map')
    } as never);
    if (!result || result.view !== 'map') throw new Error('History map load returned no data');

    expect(result.mapPlaces).toHaveLength(200);
    expect(result.mapTruncated).toBe(true);
    expect(result.mapLimit).toBe(200);
    expect(rpc).toHaveBeenCalledWith('list_personal_places', {
      requested_locale: 'en',
      requested_filter: 'all',
      requested_limit: 201,
      requested_before_activity_at: undefined,
      requested_before_place_id: undefined
    });
  });

  it('reports no truncation when the whole history fits inside the map window', async () => {
    const partialWindow = Array.from({ length: 3 }, (_, index) => personalPlaceRow(index));
    const rpc = vi.fn(async () => ({ data: partialWindow, error: null }));

    const result = await load({
      locals: { supabase: { rpc }, requestId: 'request-4' },
      params: { lang: 'en' },
      parent: vi.fn(async () => ({ signedIn: true })),
      setHeaders: vi.fn(),
      url: new URL('http://localhost/en/history?view=map')
    } as never);
    if (!result || result.view !== 'map') throw new Error('History map load returned no data');

    expect(result.mapPlaces).toHaveLength(3);
    expect(result.mapTruncated).toBe(false);
  });

  it('loads quarantined history without exposing its withheld coordinates', async () => {
    const quarantinedRow = {
      ...personalPlaceRow(0),
      latitude: null,
      longitude: null,
      availability: 'unavailable'
    };
    const rpc = vi.fn(async () => ({ data: [quarantinedRow], error: null }));

    const result = await load({
      locals: { supabase: { rpc }, requestId: 'request-5' },
      params: { lang: 'en' },
      parent: vi.fn(async () => ({ signedIn: true })),
      setHeaders: vi.fn(),
      url: new URL('http://localhost/en/history?view=map')
    } as never);
    if (!result || result.view !== 'map') throw new Error('History map load returned no data');

    expect(result.mapPlaces).toEqual([
      expect.objectContaining({
        placeId: quarantinedRow.place_id,
        latitude: null,
        longitude: null,
        availability: 'unavailable'
      })
    ]);
  });
});
