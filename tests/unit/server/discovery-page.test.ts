import { describe, expect, it, vi } from 'vitest';

import { load } from '../../../src/routes/[lang=lang]/+page.server';

describe('Discovery Member boundary', () => {
  it('loads only public Places when the canonical layout is signed out', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name !== 'list_published_places') throw new Error(`Unexpected private RPC: ${name}`);
      return {
        data: [
          {
            place_id: '30000000-0000-4000-8000-000000000003',
            name: 'Published Place',
            category: 'park',
            locality: 'Reykjavík',
            latitude: 64.14,
            longitude: -21.94,
            access_condition_count: 1,
            simple_access_summary: true,
            access_area: 'outdoors',
            restraint_condition: 'leash_required',
            permission_requirement: 'standing_permission',
            access_conditions: [
              {
                accessArea: 'outdoors',
                restraintCondition: 'leash_required',
                permissionRequirement: 'standing_permission'
              }
            ],
            verified_at: '2026-07-09T11:00:00.000Z'
          }
        ],
        error: null
      };
    });
    const setHeaders = vi.fn();

    const result = await load({
      locals: { supabase: { rpc }, requestId: 'request-discovery-signed-out' },
      params: { lang: 'en' },
      parent: vi.fn(async () => ({ signedIn: false })),
      setHeaders,
      url: new URL('http://localhost/en')
    } as never);

    expect(result).toMatchObject({ proximityAssistEnabled: false });
    expect(result).not.toHaveProperty('favouritePlaceIds');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('list_published_places', { requested_locale: 'en' });
    expect(setHeaders).not.toHaveBeenCalled();
  });
});
