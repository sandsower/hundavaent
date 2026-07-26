import { describe, expect, it, vi } from 'vitest';

import { GET } from '../../../src/routes/api/locations/search/+server';

describe('public location search route', () => {
  it('searches Icelandic addresses without requiring a signed-in session', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              LD: '30',
              TF: 'LAUGAVEGUR',
              L2: 'REYKJAVÍKURBORG',
              L0: 'IS',
              PC: '101',
              XY: [-21.9274441, 64.14524477],
              OL: '99PW43WF+32V'
            }
          ]
        }),
        { status: 200 }
      )
    );

    const response = await GET({
      url: new URL('http://localhost/api/locations/search?q=Laugavegur%2030'),
      fetch: fetcher
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      results: [
        expect.objectContaining({
          label: 'Laugavegur 30, 101 Reykjavík',
          latitude: 64.145245,
          longitude: -21.927444
        })
      ]
    });
  });

  it.each(['La', 'x'.repeat(121)])(
    'rejects an invalid query without calling a provider',
    async (q) => {
      const fetcher = vi.fn();

      const response = await GET({
        url: new URL(`http://localhost/api/locations/search?q=${q}`),
        fetch: fetcher
      } as never);

      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it('returns a bounded unavailable response when providers fail', async () => {
    const response = await GET({
      url: new URL('http://localhost/api/locations/search?q=Laugavegur'),
      fetch: vi.fn().mockRejectedValue(new Error('provider unavailable'))
    } as never);

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });
});
