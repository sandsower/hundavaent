import { describe, expect, it, vi } from 'vitest';

import {
  normalizeGiscoAddress,
  searchModerationAddresses
} from '$server/moderation/address-search';

describe('moderation address search', () => {
  it('normalizes a supported Icelandic address', () => {
    expect(
      normalizeGiscoAddress({
        LD: '30',
        TF: 'LAUGAVEGUR',
        L2: 'REYKJAVÍKURBORG',
        L0: 'IS',
        PC: '101',
        XY: [-21.9274441, 64.14524477],
        OL: '99PW43WF+32V'
      })
    ).toEqual({
      id: '99PW43WF+32V',
      label: 'Laugavegur 30, 101 Reykjavík',
      addressLine: 'Laugavegur 30',
      locality: 'Reykjavík',
      postalCode: '101',
      municipality: 'reykjavik',
      latitude: 64.145245,
      longitude: -21.927444,
      source: 'EU GISCO Address API'
    });
  });

  it('filters provider leakage outside Iceland and unsupported municipalities', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              LD: '30',
              TF: 'LANDAVEGUR',
              L2: 'TÓRSHAVN',
              L0: 'FO',
              PC: '100',
              XY: [-6.78, 62.0]
            },
            {
              LD: '30',
              TF: 'LAUGAVEGUR',
              L2: 'REYKJAVÍKURBORG',
              L0: 'IS',
              PC: '101',
              XY: [-21.9274441, 64.14524477]
            }
          ]
        }),
        { status: 200 }
      )
    );

    const results = await searchModerationAddresses('Laugavegur 30', fetcher);
    expect(results).toHaveLength(1);
    expect(results[0]?.municipality).toBe('reykjavik');
  });
});
